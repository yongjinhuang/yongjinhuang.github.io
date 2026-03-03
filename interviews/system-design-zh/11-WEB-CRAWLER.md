# 设计网络爬虫

网络爬虫（也称为蜘蛛或机器人）系统性地浏览万维网以发现和下载网页。它是搜索引擎、数据挖掘管道和网络存档系统的基础组件。

---

## 1. 需求澄清

### 功能需求

| 需求                 | 描述                                                         |
|----------------------|--------------------------------------------------------------|
| 抓取网页             | 从数十亿个 URL 下载 HTML 内容                                |
| 存储内容             | 持久化原始 HTML 和解析内容供下游消费者使用                   |
| 提取链接             | 解析下载的页面并发现新的 URL                                 |
| 检测重复 URL         | 避免重复抓取相同的 URL                                       |
| 检测重复内容         | 识别近似重复的页面（镜像站、内容聚合）                       |
| 遵守 robots.txt      | 遵循站点所有者声明的抓取规则                                 |
| 处理内容类型         | 处理 HTML、PDF、图片和其他媒体                               |
| 增量抓取             | 根据变更频率重新抓取页面                                     |
| URL 规范化           | 规范化 URL 以避免冗余抓取                                    |

### 非功能需求

| 需求         | 目标                                                          |
|--------------|---------------------------------------------------------------|
| 可扩展性     | 每月 10 亿页面                                                |
| 礼貌性       | 遵守每域名速率限制、crawl-delay、robots.txt                   |
| 健壮性       | 处理蜘蛛陷阱、畸形 HTML、超时、服务器错误                     |
| 可扩展性     | 插件架构支持新内容类型和提取逻辑                              |
| 新鲜度       | 在重要页面变更后数小时内重新抓取                              |
| 容错性       | 无单点故障；崩溃后可恢复                                      |

### 规模估算

```
目标：           1,000,000,000 页面 / 月
每月天数：       30
每日页面数：     1B / 30 = ~33,333,333 页面/天
每秒页面数：     33.3M / 86,400 = ~386 页面/秒

平均页面大小：         500 KB（HTML + 嵌入资源）
每月原始存储：         1B * 500 KB = 500 TB / 月
每年原始存储：         500 TB * 12 = 6 PB / 年

所需带宽：             386 页面/秒 * 500 KB = ~193 MB/秒 = ~1.54 Gbps

每秒 DNS 查询：        ~386（缓存后以 90% 命中率降至 ~40/秒）

每个 URL 的元数据：    ~500 字节（URL、状态、时间戳、优先级）
URL 元数据存储：       1B * 500 字节 = 500 GB / 月
```

### 粗略估算总结

```
+-----------------------------+-------------------+
| 指标                        | 值                |
+-----------------------------+-------------------+
| 每秒页面数                  | ~400              |
| 带宽                        | ~1.5 Gbps        |
| 每月原始存储                | 500 TB            |
| 每月 URL 元数据             | 500 GB            |
| 每秒 DNS 查询               | ~400（缓存前）    |
| 所需爬虫实例                | 50-100            |
| 每页平均抓取延迟            | ~2-3 秒           |
+-----------------------------+-------------------+
```

以每秒约 400 页面、每次抓取约 2 秒计算，我们需要至少 800 个并发连接分布在多台爬虫机器上来维持吞吐量。

---

## 2. 高层架构

```
                            +------------------+
                            |    Seed URLs     |
                            +--------+---------+
                                     |
                                     v
                    +----------------+----------------+
                    |          URL Frontier            |
                    |  (Priority Queue + Politeness)   |
                    +----------------+----------------+
                                     |
                          +----------+----------+
                          |                     |
                          v                     v
                 +--------+--------+   +--------+--------+
                 | Robots.txt Cache|   |  DNS Resolver    |
                 |   (per domain)  |   |    Cache         |
                 +--------+--------+   +--------+--------+
                          |                     |
                          +----------+----------+
                                     |
                                     v
                    +----------------+----------------+
                    |        HTML Downloader           |
                    |  (HTTP client + retry + timeout) |
                    +----------------+----------------+
                                     |
                                     v
                    +----------------+----------------+
                    |         Content Parser           |
                    | (HTML parse, link extract, etc.) |
                    +----------------+----------------+
                                     |
                       +-------------+-------------+
                       |                           |
                       v                           v
            +----------+----------+    +-----------+-----------+
            |   Content Seen?     |    |     URL Extractor     |
            | (SimHash / MinHash) |    | (normalize + extract) |
            +----------+----------+    +-----------+-----------+
                       |                           |
                  +----+----+                      v
                  |         |           +----------+----------+
                  v         v           |      URL Filter     |
              Discard   +---+---+       | (blacklist, scope)  |
                        | Store |       +----------+----------+
                        +---+---+                  |
                            |                      v
                            v           +----------+----------+
                    +-------+-------+   |     URL Seen?       |
                    | Content Store |   |  (Bloom Filter)     |
                    | (S3 / HDFS)   |   +----------+----------+
                    +---------------+              |
                                          +--------+--------+
                                          |                 |
                                          v                 v
                                       Discard         URL Frontier
                                                      (enqueue new)
```

### 数据流概要

```
1. Seed URL 初始化 URL Frontier
2. Frontier 选择下一个 URL（遵循优先级 + 礼貌性）
3. 检查 robots.txt 缓存获取抓取权限
4. 通过 DNS 缓存解析域名
5. 通过 HTTP 客户端下载页面
6. 解析 HTML 内容并提取链接
7. 检查内容是否近似重复（SimHash）
8. 将唯一内容存储到对象存储
9. 规范化提取的 URL
10. 过滤 URL（范围、黑名单）
11. 检查 URL 去重（Bloom filter）
12. 将新 URL 加入 Frontier 队列
13. 重复以上步骤
```

---

## 3. 核心组件深入分析

### 3.1 Seed URL

Seed URL 用于引导抓取过程。种子的选择对覆盖范围和效率有极大影响。

**基于域名的种子：**
```
- 来自 Alexa/Similarweb 排名的顶级站点（前 10K 域名）
- 特定国家的顶级域名（.uk, .de, .jp）
- 已知的高质量目录（DMOZ, Wikipedia）
```

**基于主题的种子：**
```
- 每个垂直领域的精选列表（新闻、电商、学术）
- 主要站点的站点地图（sitemap.xml）
- 内容聚合器的订阅源（RSS, Atom）
```

**种子选择策略：**

```python
def generate_seeds():
    seeds = []

    # 第1层：具有高外链密度的主要枢纽
    seeds.extend(load_top_sites(count=10000))

    # 第2层：特定国家的入口点
    for country_tld in ['.uk', '.de', '.fr', '.jp', '.cn', '.br']:
        seeds.extend(load_top_sites_for_tld(country_tld, count=1000))

    # 第3层：特定主题的入口点
    for topic in ['news', 'academic', 'ecommerce', 'government']:
        seeds.extend(load_topic_seeds(topic, count=500))

    # 第4层：已知的站点地图
    seeds.extend(load_sitemap_urls())

    # 去重并分配初始优先级
    return deduplicate_and_prioritize(seeds)
```

**起始点优先级排序：**

| 层级 | 来源                | 优先级  | 理由                               |
|------|---------------------|---------|-----------------------------------|
| 1    | 前 10K 域名         | 最高    | 最大外链覆盖                       |
| 2    | 国家 TLD 领先者     | 高      | 地理覆盖                           |
| 3    | 主题垂直领域        | 中      | 特定领域深度                       |
| 4    | 站点地图            | 中      | 直接 URL 发现                      |
| 5    | 重新抓取积压        | 可变    | 基于新鲜度需求                     |

---

### 3.2 URL Frontier

URL Frontier 是最关键的组件。它决定下一个抓取哪个 URL，同时平衡两个相互竞争的关注点：**优先级**（优先抓取重要页面）和**礼貌性**（不要压垮任何单个主机）。

#### 架构

```
                        Incoming URLs
                              |
                              v
                   +----------+----------+
                   |   Prioritizer       |
                   |  (PageRank, fresh-  |
                   |   ness, depth)      |
                   +----------+----------+
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
        +-----------+   +-----------+   +-----------+
        | Priority  |   | Priority  |   | Priority  |
        | Queue P1  |   | Queue P2  |   | Queue P3  |
        | (High)    |   | (Medium)  |   | (Low)     |
        +-----+-----+   +-----+-----+   +-----+-----+
              |               |               |
              +-------+-------+-------+-------+
                      |               |
                      v               v
               +------+------+  +-----+------+
               |  Selector   |  | Selector   |
               | (weighted   |  | (round     |
               |  random)    |  |  robin)    |
               +------+------+  +-----+------+
                      |               |
                      +-------+-------+
                              |
                              v
            +-----------------+-----------------+
            |        Politeness Router          |
            |  (assign URL to host queue)       |
            +-----------------+-----------------+
                              |
          +-------------------+-------------------+
          |         |         |         |         |
          v         v         v         v         v
     +--------+ +--------+ +--------+ +--------+ +--------+
     |host    | |host    | |host    | |host    | |host    |
     |queue   | |queue   | |queue   | |queue   | |queue   |
     |cnn.com | |bbc.com | |nyt.com | |*.edu   | |*.gov   |
     +---+----+ +---+----+ +---+----+ +---+----+ +---+----+
         |           |           |           |           |
         v           v           v           v           v
     +--------+ +--------+ +--------+ +--------+ +--------+
     |Timer   | |Timer   | |Timer   | |Timer   | |Timer   |
     |1s delay| |2s delay| |1s delay| |3s delay| |1s delay|
     +---+----+ +---+----+ +---+----+ +---+----+ +---+----+
         |           |           |           |           |
         +-----+-----+-----+-----+-----+-----+-----+----+
                                 |
                                 v
                        Worker Thread Pool
                        (HTML Downloaders)
```

#### 礼貌性队列实现

```python
class PolitenessQueue:
    """每主机 FIFO 队列，带速率限制。"""

    def __init__(self, host, crawl_delay=1.0):
        self.host = host
        self.crawl_delay = crawl_delay   # 请求之间的秒数
        self.queue = deque()
        self.last_access_time = 0

    def enqueue(self, url_entry):
        self.queue.append(url_entry)

    def can_dequeue(self):
        now = time.time()
        return (
            len(self.queue) > 0
            and (now - self.last_access_time) >= self.crawl_delay
        )

    def dequeue(self):
        if not self.can_dequeue():
            return None
        self.last_access_time = time.time()
        return self.queue.popleft()

    def size(self):
        return len(self.queue)
```

#### 优先级计算

```python
def calculate_priority(url, metadata):
    """
    计算抓取优先级分数（0-100，越高越重要）。
    """
    score = 0.0

    # 因素 1：域名权威度（0-30 分）
    domain_rank = get_domain_rank(url)  # 例如来自 Alexa
    if domain_rank <= 1000:
        score += 30
    elif domain_rank <= 10000:
        score += 20
    elif domain_rank <= 100000:
        score += 10

    # 因素 2：链接图中的 PageRank（0-25 分）
    pagerank = get_pagerank(url)
    score += min(pagerank * 25, 25)

    # 因素 3：新鲜度需求（0-25 分）
    if metadata.last_crawled is not None:
        hours_since_crawl = hours_since(metadata.last_crawled)
        change_rate = metadata.estimated_change_rate  # 每天变更次数
        staleness = hours_since_crawl * change_rate / 24.0
        score += min(staleness * 10, 25)
    else:
        score += 25  # 从未抓取过 = 高优先级

    # 因素 4：抓取深度（0-20 分，偏好浅层）
    depth = metadata.depth
    score += max(0, 20 - depth * 2)

    return min(score, 100)
```

#### Frontier 持久化

Frontier 必须能够在进程重启后恢复。两种常见方法：

```
方案 A：磁盘支持的队列（RocksDB / LevelDB）
  - 快速顺序写入
  - 可在崩溃后恢复
  - 单机 Frontier

方案 B：分布式消息队列（Kafka / RabbitMQ）
  - 多个 Frontier 分区
  - 分布式爬虫从 topic 消费
  - 内置持久化和重放功能
```

---

### 3.3 HTML 下载器

下载器负责通过 HTTP/HTTPS 获取网页。

#### 核心实现

```python
class HTMLDownloader:
    def __init__(self, config):
        self.timeout = config.get('timeout', 30)         # 秒
        self.max_retries = config.get('max_retries', 3)
        self.max_page_size = config.get('max_page_size', 10 * 1024 * 1024)  # 10MB
        self.user_agent = config.get('user_agent', 'MyCrawler/1.0')
        self.session = self._create_session()
        self.robots_cache = RobotsTxtCache()
        self.dns_cache = DNSCache()

    def _create_session(self):
        session = requests.Session()
        session.headers.update({
            'User-Agent': self.user_agent,
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate',
        })
        return session

    def download(self, url):
        # 步骤 1：检查 robots.txt 权限
        if not self.robots_cache.is_allowed(url, self.user_agent):
            return DownloadResult(url=url, status='ROBOTS_BLOCKED')

        # 步骤 2：解析 DNS（带缓存）
        try:
            ip = self.dns_cache.resolve(get_host(url))
        except DNSError:
            return DownloadResult(url=url, status='DNS_FAILED')

        # 步骤 3：带重试的下载
        for attempt in range(self.max_retries):
            try:
                response = self.session.get(
                    url,
                    timeout=self.timeout,
                    stream=True,
                    allow_redirects=True
                )

                # 下载正文前检查内容长度
                content_length = int(
                    response.headers.get('Content-Length', 0)
                )
                if content_length > self.max_page_size:
                    return DownloadResult(
                        url=url, status='TOO_LARGE'
                    )

                # 带大小限制的内容读取
                content = self._read_with_limit(response)

                return DownloadResult(
                    url=url,
                    final_url=response.url,
                    status_code=response.status_code,
                    content=content,
                    content_type=response.headers.get('Content-Type'),
                    headers=dict(response.headers),
                    status='SUCCESS'
                )

            except requests.Timeout:
                if attempt == self.max_retries - 1:
                    return DownloadResult(url=url, status='TIMEOUT')
            except requests.ConnectionError:
                if attempt == self.max_retries - 1:
                    return DownloadResult(url=url, status='CONN_ERROR')

            # 重试之间的指数退避
            time.sleep(2 ** attempt)

    def _read_with_limit(self, response):
        chunks = []
        total = 0
        for chunk in response.iter_content(chunk_size=8192):
            total += len(chunk)
            if total > self.max_page_size:
                raise ContentTooLargeError()
            chunks.append(chunk)
        return b''.join(chunks)
```

#### Robots.txt 解析和缓存

```python
class RobotsTxtCache:
    def __init__(self, ttl=86400):   # 24 小时缓存
        self.cache = {}              # domain -> (RobotFileParser, expiry)
        self.ttl = ttl

    def is_allowed(self, url, user_agent):
        domain = get_domain(url)

        # 检查缓存
        if domain in self.cache:
            parser, expiry = self.cache[domain]
            if time.time() < expiry:
                return parser.can_fetch(user_agent, url)

        # 获取并解析 robots.txt
        robots_url = f"https://{domain}/robots.txt"
        try:
            resp = requests.get(robots_url, timeout=10)
            parser = RobotFileParser()
            parser.parse(resp.text.splitlines())
        except Exception:
            # 如果 robots.txt 无法访问，假定允许
            parser = RobotFileParser()
            parser.allow_all = True

        self.cache[domain] = (parser, time.time() + self.ttl)
        return parser.can_fetch(user_agent, url)

    def get_crawl_delay(self, domain, user_agent):
        if domain in self.cache:
            parser, _ = self.cache[domain]
            delay = parser.crawl_delay(user_agent)
            return delay if delay else 1.0
        return 1.0
```

#### DNS 解析缓存

```python
class DNSCache:
    """
    本地 DNS 缓存以减少 DNS 查询延迟。
    DNS 查询可能需要 10-200ms；缓存可将其降低到 <1ms。
    """

    def __init__(self, ttl=3600, max_size=100000):
        self.cache = LRUCache(max_size)
        self.ttl = ttl

    def resolve(self, hostname):
        cached = self.cache.get(hostname)
        if cached and time.time() < cached['expiry']:
            return cached['ip']

        # 执行实际的 DNS 查询
        ip = socket.gethostbyname(hostname)
        self.cache.put(hostname, {
            'ip': ip,
            'expiry': time.time() + self.ttl
        })
        return ip
```

#### 重定向处理

```
HTTP 重定向可以形成链式跳转。下载器必须：
1. 跟随重定向直到最大深度（例如 10 次）
2. 记录所有重定向后的最终 URL
3. 将最终 URL 视为规范 URL
4. 检测重定向循环

常见的重定向模式：
  http://example.com  ->  https://example.com       （协议升级）
  https://example.com ->  https://www.example.com   （www 规范化）
  https://example.com/old -> https://example.com/new （内容迁移）
```

---

### 3.4 内容解析器

内容解析器从下载的页面中提取有用信息。

```python
class ContentParser:
    def __init__(self):
        self.html_parser = HTMLParser()
        self.link_extractor = LinkExtractor()
        self.content_extractor = ContentExtractor()

    def parse(self, download_result):
        content_type = download_result.content_type or ''

        if 'text/html' in content_type:
            return self._parse_html(download_result)
        elif 'application/pdf' in content_type:
            return self._parse_pdf(download_result)
        elif content_type.startswith('image/'):
            return self._parse_image(download_result)
        else:
            return ParseResult(
                url=download_result.url,
                content_type='unknown',
                links=[]
            )

    def _parse_html(self, result):
        soup = BeautifulSoup(result.content, 'lxml')

        # 提取文本内容
        text = self.content_extractor.extract_text(soup)

        # 提取元数据
        title = self._extract_title(soup)
        meta_desc = self._extract_meta(soup, 'description')
        canonical = self._extract_canonical(soup)

        # 提取所有链接
        links = self.link_extractor.extract(
            soup, base_url=result.final_url
        )

        return ParseResult(
            url=result.url,
            final_url=result.final_url,
            content_type='text/html',
            title=title,
            description=meta_desc,
            text_content=text,
            canonical_url=canonical,
            links=links,
            raw_html=result.content
        )

    def _extract_title(self, soup):
        tag = soup.find('title')
        return tag.get_text(strip=True) if tag else None

    def _extract_meta(self, soup, name):
        tag = soup.find('meta', attrs={'name': name})
        return tag.get('content', '') if tag else None

    def _extract_canonical(self, soup):
        tag = soup.find('link', attrs={'rel': 'canonical'})
        return tag.get('href') if tag else None
```

#### 链接提取和规范化

```python
class LinkExtractor:
    def extract(self, soup, base_url):
        links = []
        for anchor in soup.find_all('a', href=True):
            raw_href = anchor['href']

            # 解析相对 URL
            absolute_url = urljoin(base_url, raw_href)

            # 规范化 URL
            normalized = self.normalize_url(absolute_url)

            if normalized and self._is_crawlable(normalized):
                links.append(ExtractedLink(
                    url=normalized,
                    anchor_text=anchor.get_text(strip=True),
                    rel=anchor.get('rel', []),
                    is_nofollow='nofollow' in anchor.get('rel', [])
                ))

        return links

    def normalize_url(self, url):
        """
        URL 规范化规则：
        1. 将协议和主机名转为小写
        2. 移除默认端口（HTTP 的 80，HTTPS 的 443）
        3. 移除片段（#section）
        4. 移除尾部斜杠（根路径除外）
        5. 排序查询参数
        6. 移除跟踪参数（utm_*、fbclid 等）
        7. 在安全的情况下解码百分号编码字符
        """
        parsed = urlparse(url)

        # 只抓取 HTTP/HTTPS
        if parsed.scheme not in ('http', 'https'):
            return None

        scheme = parsed.scheme.lower()
        host = parsed.hostname.lower() if parsed.hostname else None
        if not host:
            return None

        # 移除默认端口
        port = parsed.port
        if (scheme == 'http' and port == 80) or \
           (scheme == 'https' and port == 443):
            port = None

        # 移除片段
        path = parsed.path or '/'

        # 移除尾部斜杠（根路径除外）
        if path != '/' and path.endswith('/'):
            path = path.rstrip('/')

        # 排序和过滤查询参数
        query_params = parse_qs(parsed.query, keep_blank_values=True)
        tracking_params = {
            'utm_source', 'utm_medium', 'utm_campaign',
            'utm_term', 'utm_content', 'fbclid', 'gclid',
            'ref', 'source'
        }
        filtered_params = {
            k: v for k, v in query_params.items()
            if k not in tracking_params
        }
        sorted_query = urlencode(filtered_params, doseq=True)

        # 重建 URL
        netloc = host
        if port:
            netloc = f"{host}:{port}"

        return urlunparse((scheme, netloc, path, '', sorted_query, ''))

    def _is_crawlable(self, url):
        """过滤不可抓取的 URL。"""
        skip_extensions = {
            '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico',
            '.css', '.js', '.woff', '.woff2', '.ttf',
            '.mp3', '.mp4', '.avi', '.mov', '.zip', '.tar',
            '.exe', '.dmg', '.rpm', '.deb'
        }
        parsed = urlparse(url)
        path_lower = parsed.path.lower()
        return not any(path_lower.endswith(ext) for ext in skip_extensions)
```

#### 处理 JavaScript 渲染的页面

许多现代网站依赖客户端 JavaScript 渲染。标准的 HTTP 抓取只会返回一个空壳 HTML 文档。对于这些站点，需要使用无头浏览器。

```python
class HeadlessBrowserDownloader:
    """
    使用无头浏览器（Playwright/Puppeteer）处理 JS 密集型站点。
    比 HTTP 抓取慢得多且资源消耗更大。
    仅对已知的 JS 渲染域名选择性使用。
    """

    def __init__(self):
        self.browser = None
        self.js_domains = load_js_domain_list()  # 预配置列表

    def should_use_headless(self, url):
        domain = get_domain(url)
        return domain in self.js_domains

    async def download(self, url):
        if not self.browser:
            self.browser = await launch_browser(headless=True)

        page = await self.browser.new_page()
        try:
            await page.goto(url, wait_until='networkidle', timeout=30000)

            # 等待动态内容加载
            await page.wait_for_timeout(2000)

            content = await page.content()
            final_url = page.url

            return DownloadResult(
                url=url,
                final_url=final_url,
                content=content,
                status='SUCCESS'
            )
        except Exception as e:
            return DownloadResult(url=url, status='JS_RENDER_FAILED')
        finally:
            await page.close()
```

---

### 3.5 URL 去重

#### Bloom Filter

Bloom filter 是一种空间高效的概率数据结构，用于测试元素是否属于集合。它可能产生假阳性但永远不会产生假阴性。

```
Bloom Filter 工作原理：

1. 初始化一个包含 m 位的位数组，所有位设为 0
2. 使用 k 个独立的哈希函数
3. 添加元素时：
   - 用每个 k 个哈希函数对元素进行哈希
   - 将对应的位位置设为 1
4. 查询元素时：
   - 用每个 k 个哈希函数对元素进行哈希
   - 如果所有对应位都是 1 -> "可能在集合中"
   - 如果任何位是 0 -> "肯定不在集合中"


用 k=3 个哈希函数添加 "url_A"：

  h1("url_A") = 2    h2("url_A") = 5    h3("url_A") = 9

  位数组 (m=12)：
  之前：[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

  之后：[0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0]
               ^           ^              ^
               h1          h2             h3

添加 "url_B"：
  h1("url_B") = 2    h2("url_B") = 7    h3("url_B") = 11

  之后：[0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1]
               ^           ^     ^     ^     ^
             h1(A,B)     h2(A) h2(B) h3(A) h3(B)

查询 "url_C"：
  h1("url_C") = 2    h2("url_C") = 5    h3("url_C") = 11

  检查：[0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1]
               ^           ^                 ^
               1           1                 1    -> 全部为 1！

  结果："可能在集合中"（假阳性 - url_C 从未被添加过）

查询 "url_D"：
  h1("url_D") = 0    h2("url_D") = 3    h3("url_D") = 8

  检查：[0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1]
         ^        ^              ^
         0        0              0    -> 至少有一个 0

  结果："肯定不在集合中"（正确）
```

#### 假阳性率计算

```
给定：
  n = 插入的元素数量
  m = 过滤器中的位数
  k = 哈希函数数量

假阳性概率：

  p = (1 - e^(-kn/m))^k

最优哈希函数数量：

  k_opt = (m/n) * ln(2) ≈ 0.693 * (m/n)

对于我们的网络爬虫：
  n = 1,000,000,000（10 亿个 URL）
  目标假阳性率：p = 1% = 0.01

每个元素所需的位数：
  m/n = -1.44 * log2(p) = -1.44 * log2(0.01) = -1.44 * (-6.644) = 9.57

  m = 9.57 * 1,000,000,000 = 95.7 亿位 ≈ 1.14 GB

最优哈希函数数量：
  k = 0.693 * 9.57 ≈ 7

+-------------------+----------+-----------+----------+
| 假阳性率          | 每元素   | 总大小    | 哈希函数 |
| (p)               | 位数     | (10亿)    | 数量     |
+-------------------+----------+-----------+----------+
| 10%   (0.1)       | 4.79     | 572 MB    | 3        |
| 5%    (0.05)      | 6.24     | 745 MB    | 4        |
| 1%    (0.01)      | 9.57     | 1.14 GB   | 7        |
| 0.1%  (0.001)     | 14.35    | 1.71 GB   | 10       |
| 0.01% (0.0001)    | 19.17    | 2.29 GB   | 13       |
+-------------------+----------+-----------+----------+
```

以 1.14 GB 存储 10 亿个 URL 且假阳性率为 1%，Bloom filter 比将所有 URL 存储在哈希集（约 50-100 GB）中高效得多。

#### Bloom Filter 实现

```python
import mmh3   # MurmurHash3
import math
from bitarray import bitarray

class BloomFilter:
    def __init__(self, expected_items, fp_rate=0.01):
        self.fp_rate = fp_rate
        self.size = self._optimal_size(expected_items, fp_rate)
        self.hash_count = self._optimal_hash_count(
            self.size, expected_items
        )
        self.bit_array = bitarray(self.size)
        self.bit_array.setall(0)
        self.count = 0

    def _optimal_size(self, n, p):
        """计算最优位数组大小。"""
        m = -(n * math.log(p)) / (math.log(2) ** 2)
        return int(m)

    def _optimal_hash_count(self, m, n):
        """计算最优哈希函数数量。"""
        k = (m / n) * math.log(2)
        return int(k)

    def _get_hash_values(self, item):
        """
        使用双重哈希技术生成 k 个哈希值。
        h_i(x) = h1(x) + i * h2(x)   (mod m)
        """
        h1 = mmh3.hash(item, 0) % self.size
        h2 = mmh3.hash(item, 1) % self.size
        return [
            (h1 + i * h2) % self.size
            for i in range(self.hash_count)
        ]

    def add(self, item):
        for idx in self._get_hash_values(item):
            self.bit_array[idx] = 1
        self.count += 1

    def might_contain(self, item):
        return all(
            self.bit_array[idx]
            for idx in self._get_hash_values(item)
        )
```

#### URL 规范化用于去重

在检查 Bloom filter 之前，URL 必须被规范化为其标准形式。不同的 URL 字符串可能指向相同的资源：

```
以下所有 URL 都指向同一个页面：
  http://Example.com/page
  http://example.com/page
  http://example.com/page/
  http://example.com/page?
  http://example.com/page#section
  http://example.com:80/page
  https://example.com/page?b=2&a=1
  https://example.com/page?a=1&b=2

规范化后，全部变为：
  https://example.com/page?a=1&b=2
```

---

### 3.6 内容去重

URL 去重可以捕获相同的 URL，但不同的 URL 可能提供相同或近似相同的内容（镜像站、聚合文章、不改变内容的 URL 参数）。内容去重解决这个问题。

#### SimHash 近似重复检测

SimHash 是一种局部敏感哈希技术。相似的文档会产生相似的哈希值，哈希值之间的汉明距离表示内容相似度。

```
SimHash 工作原理：

输入："the quick brown fox jumps over the lazy dog"

步骤 1：将文本分词为特征（shingle）
  特征：["the quick", "quick brown", "brown fox",
             "fox jumps", "jumps over", "over the",
             "the lazy", "lazy dog"]

步骤 2：对每个特征计算 64 位哈希值
  hash("the quick")   = 0b1010...0011  (64 位)
  hash("quick brown") = 0b0110...1101
  hash("brown fox")   = 0b1100...0010
  ... 等等。

步骤 3：对每个位位置，累加 +1（如果位=1）或 -1（如果位=0）

  位位置：         63  62  61  60  ...  1   0
  "the quick":     +1  -1  +1  -1       +1  +1
  "quick brown":   -1  +1  +1  -1       -1  +1
  "brown fox":     +1  +1  -1  -1       +1  -1
  ...（对所有特征求和）
  -------------------------------------------------
  累加和：         +3  -1  +5  -7       +1  +3

步骤 4：将累加和转换为位（正数 -> 1，负数 -> 0）
  SimHash:         1    0   1   0  ...   1   1

步骤 5：比较 SimHash 值
  两个文档是"近似重复"的，如果它们的 SimHash 值
  在 <= k 个位位置上不同（汉明距离 <= k）。

  通常对于 64 位 SimHash，k = 3。
```

#### SimHash 实现

```python
import hashlib
import struct

class SimHash:
    def __init__(self, hash_bits=64, shingle_size=3):
        self.hash_bits = hash_bits
        self.shingle_size = shingle_size

    def compute(self, text):
        tokens = text.lower().split()
        if len(tokens) < self.shingle_size:
            return self._simple_hash(text)

        # 创建 shingle
        shingles = [
            ' '.join(tokens[i:i + self.shingle_size])
            for i in range(len(tokens) - self.shingle_size + 1)
        ]

        # 初始化位投票计数器
        votes = [0] * self.hash_bits

        for shingle in shingles:
            h = self._hash_feature(shingle)
            for i in range(self.hash_bits):
                if h & (1 << i):
                    votes[i] += 1
                else:
                    votes[i] -= 1

        # 将投票转换为位
        fingerprint = 0
        for i in range(self.hash_bits):
            if votes[i] > 0:
                fingerprint |= (1 << i)

        return fingerprint

    def _hash_feature(self, feature):
        digest = hashlib.md5(feature.encode()).digest()
        return struct.unpack('<Q', digest[:8])[0]

    @staticmethod
    def hamming_distance(hash1, hash2):
        diff = hash1 ^ hash2
        return bin(diff).count('1')

    @staticmethod
    def is_near_duplicate(hash1, hash2, threshold=3):
        return SimHash.hamming_distance(hash1, hash2) <= threshold
```

#### MinHash 用于 Jaccard 相似度（替代方案）

MinHash 估算两个 shingle 集合之间的 Jaccard 相似度。

```
Jaccard 相似度：  J(A, B) = |A ∩ B| / |A ∪ B|

MinHash 近似：
  1. 创建 N 个随机哈希函数（例如 N=200）
  2. 对每个文档，计算所有 shingle 的 N 个最小哈希值
  3. 估算的 Jaccard = （匹配的最小哈希值数量）/ N

如果 Jaccard >= 0.8（80% 相似），则两个文档为近似重复。
```

---

## 4. 数据模型

### URL 元数据表

```sql
CREATE TABLE url_metadata (
    url_hash        BIGINT PRIMARY KEY,   -- 规范化 URL 的 64 位哈希
    url             TEXT NOT NULL,
    domain          VARCHAR(255) NOT NULL,
    status          ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED',
                         'FAILED', 'ROBOTS_BLOCKED') DEFAULT 'PENDING',
    http_status     SMALLINT,
    last_crawled    TIMESTAMP,
    next_crawl      TIMESTAMP,
    crawl_count     INT DEFAULT 0,
    priority        FLOAT DEFAULT 0.0,
    depth           SMALLINT DEFAULT 0,
    content_hash    BIGINT,               -- SimHash 指纹
    content_size    INT,
    content_type    VARCHAR(100),
    redirect_url    TEXT,
    error_message   TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_domain (domain),
    INDEX idx_status_priority (status, priority DESC),
    INDEX idx_next_crawl (next_crawl)
);
```

### 页面内容存储

```
存储策略：使用对象存储（S3 / HDFS）存放原始内容

对象键格式：
  s3://crawler-content/{year}/{month}/{day}/{url_hash}.html.gz

附带存储的元数据：
  {
    "url": "https://example.com/page",
    "url_hash": 1234567890,
    "crawl_timestamp": "2026-03-01T12:00:00Z",
    "http_status": 200,
    "content_type": "text/html",
    "content_length": 45230,
    "content_encoding": "gzip",
    "headers": { ... },
    "simhash": "0xABCDEF1234567890"
  }
```

### 链接图

```sql
-- Web 图的边列表表示
CREATE TABLE link_graph (
    source_url_hash   BIGINT NOT NULL,
    target_url_hash   BIGINT NOT NULL,
    anchor_text       TEXT,
    is_nofollow       BOOLEAN DEFAULT FALSE,
    discovered_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (source_url_hash, target_url_hash),
    INDEX idx_target (target_url_hash)
);
```

对于大规模的 PageRank 计算，链接图通常以分布式格式存储：

```
+--------------------+------------------------------------------+
| 存储选项           | 用例                                     |
+--------------------+------------------------------------------+
| 邻接表             | 基于 MapReduce 的 PageRank（HDFS 文件）  |
| 图数据库           | 实时图查询（Neo4j, JanusGraph）          |
| 邻接矩阵           | 内存中的 PageRank（稀疏矩阵）            |
| 边列表（Kafka）    | 流式图更新                               |
+--------------------+------------------------------------------+
```

---

## 5. 抓取策略

### BFS vs DFS

```
BFS（广度优先搜索）- 首选：
+------+
|Seed  | -> 第 0 层
+--+---+
   |
   +-----+-----+-----+
   |     |     |     |
   v     v     v     v
  [A]   [B]   [C]   [D]  -> 第 1 层
   |     |     |
   +--+  +--+  +--+
   |  |  |  |  |  |
   v  v  v  v  v  v
  [E][F][G][H][I][J]     -> 第 2 层

优点：
  - 首先发现重要页面（高价值页面通常从知名种子链接）
  - 避免陷入深层站点层级
  - 更适合广泛的网络覆盖
  - 天然适合基于优先级的抓取

DFS（深度优先搜索）- 不推荐用于通用抓取：
+------+
|Seed  |
+--+---+
   |
   v
  [A]
   |
   v
  [E] -> 在探索兄弟节点之前先深入
   |
   v
  [K]
   |
   ...（可能在一个站点上抓取数千个页面）

问题：
  - 可能陷入深层站点层级
  - 覆盖广度差
  - 容易受蜘蛛陷阱影响
  - 对其他域名不公平
```

### 路径上升抓取

当发现一个深层 URL 时（例如来自外部链接），同时抓取其父路径：

```
发现：https://example.com/a/b/c/page.html

路径上升生成：
  https://example.com/a/b/c/
  https://example.com/a/b/
  https://example.com/a/
  https://example.com/

原理：父页面通常包含导航和指向其他重要内容的链接，
这些内容不一定从原始的深层页面直接链接。
```

### 重新抓取策略

```python
def calculate_recrawl_interval(url_metadata):
    """
    基于历史变更率的自适应重新抓取间隔。

    使用变更检测的指数移动平均值。
    """
    if url_metadata.crawl_count < 2:
        return timedelta(days=7)  # 新 URL 的默认值

    # 从历史记录计算变更率
    change_rate = url_metadata.change_rate  # 每天变更次数

    if change_rate > 1.0:
        # 每天变更多次（新闻站点）
        return timedelta(hours=1)
    elif change_rate > 0.1:
        # 大约每周变更
        return timedelta(days=3)
    elif change_rate > 0.01:
        # 大约每月变更
        return timedelta(days=14)
    else:
        # 很少变更
        return timedelta(days=30)
```

### 每域名抓取预算

```
抓取预算 = 每个域名每天的最大抓取页面数

影响因素：
  1. 域名重要性（排名、流量）
  2. 服务器容量（响应时间、错误率）
  3. 内容新鲜度（站点更新频率）
  4. 内容质量（唯一内容 vs 重复内容）

+------------------+------------------+
| 域名层级         | 每日预算         |
+------------------+------------------+
| 第1层（前 1K）   | 100,000 页面     |
| 第2层（前 10K）  | 10,000 页面      |
| 第3层（前 100K） | 1,000 页面       |
| 第4层（其他）    | 100 页面         |
+------------------+------------------+
```

---

## 6. 边缘情况处理

### 蜘蛛陷阱

蜘蛛陷阱是能生成无限数量页面的 URL 模式：

```
常见陷阱类型：

1. 无限查询参数组合：
   /page?sort=asc&page=1&filter=new&tag=...
   （参数的组合爆炸）

2. 日历陷阱：
   /calendar/2026/03/01
   /calendar/2026/03/02
   /calendar/2026/03/03
   ...（无限的未来日期）

3. 会话 ID 陷阱：
   /page?sessionid=abc123
   /page?sessionid=def456
   （相同内容，不同的会话 ID）

4. 软 404：
   /nonexistent/page -> 返回 200 OK 带有"未找到"内容
   （爬虫认为找到了有效页面）

5. 动态生成的路径：
   /a/b/c/d/e/f/g/h/i/j/k/l/...
   （无限深度）
```

**检测和缓解：**

```python
class SpiderTrapDetector:
    def __init__(self):
        self.max_depth = 16
        self.max_params = 5
        self.max_pages_per_path_pattern = 1000
        self.path_pattern_counts = defaultdict(int)

    def is_trap(self, url, depth):
        parsed = urlparse(url)

        # 检查 1：最大抓取深度
        if depth > self.max_depth:
            return True

        # 检查 2：查询参数过多
        params = parse_qs(parsed.query)
        if len(params) > self.max_params:
            return True

        # 检查 3：重复的路径段
        segments = parsed.path.strip('/').split('/')
        if len(segments) != len(set(segments)):
            return True  # 重复的段表明可能是陷阱

        # 检查 4：路径模式频率
        pattern = self._extract_path_pattern(parsed.path)
        self.path_pattern_counts[pattern] += 1
        if self.path_pattern_counts[pattern] > self.max_pages_per_path_pattern:
            return True

        # 检查 5：URL 过长
        if len(url) > 2048:
            return True

        return False

    def _extract_path_pattern(self, path):
        """
        将数字段替换为 {N} 以检测模式。
        /blog/2026/03/01/post -> /blog/{N}/{N}/{N}/post
        """
        segments = path.strip('/').split('/')
        pattern_segments = []
        for seg in segments:
            if seg.isdigit():
                pattern_segments.append('{N}')
            elif len(seg) > 32:
                pattern_segments.append('{HASH}')
            else:
                pattern_segments.append(seg)
        return '/'.join(pattern_segments)
```

### 动态内容 / JavaScript 渲染

```
JS 渲染决策矩阵：

+----------------------------------+------------------+------------------+
| 信号                             | 使用 HTTP 抓取   | 使用无头浏览器   |
+----------------------------------+------------------+------------------+
| 静态 HTML（服务端渲染）          | 是               | 否               |
| 单页应用（SPA）                  | 否               | 是               |
| <body> 内容极少                  | 否               | 是               |
| data-reactroot / ng-app 属性     | 否               | 是               |
| 已知的 JS 密集型域名             | 否               | 是               |
| <noscript> 标签含完整内容        | 是               | 否               |
+----------------------------------+------------------+------------------+

策略：
  1. 首先尝试 HTTP 抓取
  2. 如果页面正文异常小（<1KB 文本）或包含
     JS 框架标记，使用无头浏览器重试
  3. 维护域名级别的"需要无头浏览器"决策缓存
```

### 超大页面

```
保护机制：
  1. 下载正文前检查 Content-Length 头
  2. 流式下载并设置字节限制（默认 10MB）
  3. 每页超时（30 秒）
  4. 丢弃超大页面并记录以供审查

处理方式：
  - 页面 > 10MB：完全跳过
  - 页面 > 1MB：下载但减少解析工作量
  - 页面 < 1MB：完整处理
```

### 畸形 HTML

```
解析器必须具备容错能力：
  - 使用宽容的解析器（BeautifulSoup 配合 lxml 或 html5lib）
  - 遇到畸形 HTML 时绝不崩溃
  - 尽可能提取内容，跳过无法处理的部分
  - 记录解析错误用于监控
```

### 非 HTML 内容

```
+---------------+------------------+----------------------------------+
| 内容类型      | 操作             | 说明                             |
+---------------+------------------+----------------------------------+
| text/html     | 完整解析         | 提取文本 + 链接                  |
| application/  | PDF 提取         | 使用 pdfminer/PyPDF2             |
|   pdf         |                  |                                  |
| text/plain    | 按原样存储       | 无链接提取                       |
| image/*       | 存储元数据       | 提取 EXIF，从引用页面            |
|               |                  | 获取 alt 文本                    |
| application/  | 解析 JSON        | 从值中提取 URL                   |
|   json        |                  |                                  |
| text/xml      | 解析站点地图     | 从站点地图中提取 URL             |
| 其他          | 跳过或存储       | 基于抓取配置                     |
+---------------+------------------+----------------------------------+
```

---

## 7. 分布式抓取

### 架构

```
                        +-------------------+
                        |  Coordination     |
                        |  Service          |
                        |  (ZooKeeper)      |
                        +--------+----------+
                                 |
              +------------------+------------------+
              |                  |                   |
              v                  v                   v
    +---------+------+  +--------+-------+  +--------+-------+
    | Crawler Node 1 |  | Crawler Node 2 |  | Crawler Node N |
    | (domains A-H)  |  | (domains I-P)  |  | (domains Q-Z)  |
    +-------+--------+  +-------+--------+  +-------+--------+
            |                    |                   |
            v                    v                   v
    +-------+--------+  +-------+--------+  +-------+--------+
    | Local Frontier  |  | Local Frontier  |  | Local Frontier  |
    | (per-domain    |  | (per-domain    |  | (per-domain    |
    |  queues)       |  |  queues)       |  |  queues)       |
    +-------+--------+  +-------+--------+  +-------+--------+
            |                    |                   |
            +--------------------+-------------------+
                                 |
                    +------------+------------+
                    |                         |
                    v                         v
           +-------+--------+       +--------+-------+
           | Shared Bloom   |       | Content Store  |
           | Filter Cluster |       | (S3 / HDFS)    |
           | (Redis)        |       |                |
           +----------------+       +----------------+
```

### URL 空间分区

```python
def assign_url_to_crawler(url, num_crawlers):
    """
    使用一致性哈希按域名分区 URL。
    同一域名的所有 URL 发送到同一个爬虫，
    确保礼貌性在本地执行。
    """
    domain = get_domain(url)
    domain_hash = hash(domain) % num_crawlers
    return domain_hash
```

### 一致性哈希用于爬虫分配

```
带虚拟节点的哈希环：

           Crawler 1 (v1)
               |
    Crawler 3 (v2)---+---Crawler 1 (v2)
         |                       |
         |       Hash Ring       |
         |                       |
    Crawler 2 (v2)---+---Crawler 3 (v1)
               |
           Crawler 2 (v1)

域名哈希 -> 最近的顺时针爬虫节点

优点：
  - 添加/移除爬虫只重新分配约 1/N 的域名
  - 虚拟节点确保均匀分布
  - 故障爬虫的域名自动重路由
```

### 爬虫间通信

当爬虫 A 发现属于爬虫 B 分区的 URL 时：

```
+-------------------+        URL 交换队列          +-------------------+
|   Crawler A       |  -----> (每个爬虫分区       |   Crawler B       |
|   发现属于 B      |         的 Kafka topic)      |   接收 URL        |
|   分区的 URL      |                              |   并加入本地      |
|                   |                              |   Frontier        |
+-------------------+                              +-------------------+

Kafka Topics:
  crawler-urls-partition-0   (Crawler 0 消费)
  crawler-urls-partition-1   (Crawler 1 消费)
  crawler-urls-partition-2   (Crawler 2 消费)
  ...
  crawler-urls-partition-N   (Crawler N 消费)
```

### 容错性

```
故障场景和恢复：

1. 爬虫节点崩溃：
   - ZooKeeper 检测到心跳丢失
   - 崩溃节点 Frontier 中的 URL 被重新分配
   - 其他爬虫接管受影响的域名分区

2. 网络分区：
   - 爬虫继续处理本地排队的 URL
   - 爬虫间 URL 交换在 Kafka 中缓冲
   - 连接恢复后进行协调

3. 存储故障：
   - 内容存储（S3/HDFS）有内置复制
   - Bloom filter 状态定期检查点保存
   - Frontier 状态持久化到磁盘（RocksDB）

4. DNS 故障：
   - 本地 DNS 缓存提供临时弹性
   - 回退到多个 DNS 解析器
   - DNS 失败的 URL 以退避方式重新入队
```

---

## 8. 礼貌性和伦理

### robots.txt 合规性

```
robots.txt 示例：

  User-agent: *
  Disallow: /admin/
  Disallow: /private/
  Crawl-delay: 2

  User-agent: MyCrawler
  Allow: /public/
  Disallow: /
  Crawl-delay: 5

  Sitemap: https://example.com/sitemap.xml

解释：
  - 所有爬虫：禁止访问 /admin/ 和 /private/，2 秒延迟
  - MyCrawler 特定：只允许访问 /public/，5 秒延迟
  - 提供了站点地图位置用于高效 URL 发现
```

### 速率限制策略

```python
class DomainRateLimiter:
    """
    每域名的令牌桶速率限制器。
    """

    def __init__(self, default_delay=1.0):
        self.default_delay = default_delay
        self.domain_states = {}

    def acquire(self, domain):
        """阻塞直到可以礼貌地抓取此域名。"""
        state = self.domain_states.get(domain)
        if state is None:
            state = {
                'last_request': 0,
                'delay': self.default_delay,
                'consecutive_errors': 0
            }
            self.domain_states[domain] = state

        now = time.time()
        wait_time = state['delay'] - (now - state['last_request'])

        if wait_time > 0:
            time.sleep(wait_time)

        state['last_request'] = time.time()

    def update_delay(self, domain, response_time, status_code):
        """基于服务器行为自适应调整延迟。"""
        state = self.domain_states[domain]

        if status_code == 429:  # Too Many Requests
            state['delay'] = min(state['delay'] * 2, 60)  # 退避
            state['consecutive_errors'] += 1
        elif status_code >= 500:
            state['delay'] = min(state['delay'] * 1.5, 30)
            state['consecutive_errors'] += 1
        else:
            state['consecutive_errors'] = 0
            # 如果服务器响应良好，逐渐减少延迟
            if response_time < 1.0 and state['delay'] > self.default_delay:
                state['delay'] = max(
                    state['delay'] * 0.9, self.default_delay
                )
```

### 道德抓取清单

```
+----+--------------------------------------------+
| #  | 实践                                       |
+----+--------------------------------------------+
| 1  | 始终使用描述性的 User-Agent 字符串         |
|    | 进行标识                                   |
| 2  | 在 User-Agent 中包含联系信息或             |
|    | 提供抓取信息页面                           |
| 3  | 遵守 robots.txt 指令                       |
| 4  | 遵守 Crawl-delay 头                        |
| 5  | 及时响应滥用投诉                           |
| 6  | 避免在站点高峰时段抓取                     |
|    | （如已知）                                 |
| 7  | 不要跟随 nofollow 链接来确定抓取            |
|    | 优先级（尊重发布者意图）                   |
| 8  | 识别并遵守 meta robots 标签                 |
|    | （noindex, nofollow）                      |
| 9  | 支持 If-Modified-Since 用于重新抓取         |
| 10 | 未经许可不存储或重新分发                    |
|    | 受版权保护的内容                           |
+----+--------------------------------------------+
```

### 法律考量

```
影响网络爬虫的主要法律框架：

1. 服务条款（ToS）
   - 许多站点明确禁止自动化访问
   - 违反 ToS 可能导致法律诉讼（hiQ v. LinkedIn）

2. CFAA（计算机欺诈和滥用法案）- 美国
   - "未经授权"访问计算机是联邦罪行
   - 法院对什么构成授权的解释各不相同

3. GDPR（通用数据保护条例）- 欧盟
   - 抓取的内容可能包含个人数据
   - 必须有合法的处理依据
   - 数据主体有权要求删除

4. 版权法
   - 抓取本身可能属于合理使用（用于索引目的）
   - 存储和重新分发内容可能违反版权
   - 安全港条款可能适用
```

---

## 9. 存储系统

### 存储层级

```
+-------------------+-----------------+------------------+------------------+
| 数据类型          | 存储系统        | 访问模式         | 保留期限         |
+-------------------+-----------------+------------------+------------------+
| 原始 HTML         | S3 / HDFS       | 写密集型，       | 6 个月           |
|                   |                 | 批量读取         | （压缩）         |
+-------------------+-----------------+------------------+------------------+
| 解析内容          | Elasticsearch   | 读密集型，       | 无限期           |
| （文本 + 元数据） |                 | 全文搜索         | （最新版本）     |
+-------------------+-----------------+------------------+------------------+
| URL 元数据        | Cassandra /     | 读写，           | 无限期           |
|                   | DynamoDB        | 键值查找         |                  |
+-------------------+-----------------+------------------+------------------+
| 链接图            | Neo4j /         | 图遍历，         | 无限期           |
|                   | HDFS（批处理）  | 批处理           | （快照）         |
+-------------------+-----------------+------------------+------------------+
| Bloom filter      | Redis / 内存    | 高频率           | 重启时重建       |
| （URL 已见）      |                 | 查找             |                  |
+-------------------+-----------------+------------------+------------------+
| Robots.txt 缓存   | 本地 + Redis    | 每域名           | 24 小时 TTL      |
|                   |                 | 查找             |                  |
+-------------------+-----------------+------------------+------------------+
| DNS 缓存          | 本地 + 共享     | 每域名           | 1 小时 TTL       |
|                   | (memcached)     | 查找             |                  |
+-------------------+-----------------+------------------+------------------+
```

### 原始 HTML 存储（S3/HDFS）

```
存储布局：

s3://crawler-raw/
  ├── 2026/
  │   ├── 03/
  │   │   ├── 01/
  │   │   │   ├── 00/   (小时)
  │   │   │   │   ├── abc123def456.html.gz
  │   │   │   │   ├── fed789cba012.html.gz
  │   │   │   │   └── ...
  │   │   │   ├── 01/
  │   │   │   └── ...
  │   │   ├── 02/
  │   │   └── ...
  │   └── ...
  └── ...

压缩：gzip（HTML 的典型压缩比为 5:1）
有效存储：500 TB/月 原始 -> ~100 TB/月 压缩后

生命周期策略：
  - 热层（< 7 天）：Standard S3
  - 温层（7-30 天）：S3 Infrequent Access
  - 冷层（30-180 天）：S3 Glacier
  - 180 天后删除（除非标记为存档）
```

### 解析内容存储（Elasticsearch）

```json
{
  "mappings": {
    "properties": {
      "url":            { "type": "keyword" },
      "url_hash":       { "type": "long" },
      "domain":         { "type": "keyword" },
      "title":          { "type": "text", "analyzer": "standard" },
      "description":    { "type": "text", "analyzer": "standard" },
      "body_text":      { "type": "text", "analyzer": "standard" },
      "language":       { "type": "keyword" },
      "content_length": { "type": "integer" },
      "crawl_time":     { "type": "date" },
      "simhash":        { "type": "long" },
      "outlink_count":  { "type": "integer" },
      "inlink_count":   { "type": "integer" }
    }
  }
}
```

### URL 元数据存储（分布式 KV 存储）

```
针对抓取操作优化的 Cassandra schema：

CREATE TABLE url_metadata (
    domain        TEXT,
    url_hash      BIGINT,
    url           TEXT,
    status        TEXT,
    http_status   INT,
    priority      FLOAT,
    depth         SMALLINT,
    last_crawled  TIMESTAMP,
    next_crawl    TIMESTAMP,
    content_hash  BIGINT,
    crawl_count   INT,
    error_count   INT,
    PRIMARY KEY ((domain), url_hash)
) WITH CLUSTERING ORDER BY (url_hash ASC);

-- 按域名分区的原因：
--   1. 高效的每域名查询（抓取预算）
--   2. 用于礼貌性执行的数据共置
--   3. 在 Cassandra 节点间均匀分布
```

---

## 10. 扩展性

### 爬虫的水平扩展

```
扩展公式：

  所需爬虫数 = (目标每秒页面数 * 平均延迟) / 每节点并发数

示例：
  目标：      400 页面/秒
  平均延迟：  2 秒/页面
  并发数：    100 连接/节点

  所需：(400 * 2) / 100 = 8 个爬虫节点

加上冗余（2倍）：16 个爬虫节点

扩展触发器：
  - 队列深度超过阈值
  - 抓取速率低于目标
  - 平均延迟增加

自动扩展策略：
  - 扩容：如果 crawl_rate < 0.8 * 目标持续 5 分钟
  - 缩容：如果 crawl_rate > 1.2 * 目标持续 15 分钟
  - 最小节点数：8（处理基准负载）
  - 最大节点数：64（成本上限）
```

### DNS 缓存集群

```
架构：

  Crawler Node  --(缓存未命中)-->  本地 DNS 缓存（LRU，100K 条目）
       |
       +--(缓存未命中)-->  共享 DNS 缓存（Memcached 集群）
       |
       +--(缓存未命中)-->  递归 DNS 解析器（Unbound）
       |
       +--(缓存未命中)-->  公共 DNS（8.8.8.8, 1.1.1.1）

缓存命中率：
  本地缓存：~85% 命中率
  共享缓存：~10%（本地未命中的比例）
  DNS 解析器：~4%
  公共 DNS：~1%

实际发送到外部服务器的 DNS 查询：
  400 页面/秒 * 1% = 4 查询/秒（可忽略不计）
```

### 分布式 URL Frontier（基于 Kafka）

```
基于 Kafka 的分布式抓取 Frontier：

生产者（URL 提取器）：
  - 从解析的页面中提取 URL
  - 对域名进行哈希以确定分区
  - 生产到 crawler-urls-partition-{N}

Kafka Topics:
  crawler-urls-high-priority    （按域名哈希分区）
  crawler-urls-medium-priority  （按域名哈希分区）
  crawler-urls-low-priority     （按域名哈希分区）

消费者（爬虫节点）：
  - 每个爬虫从其分配的分区消费
  - 维护本地每域名礼貌性队列
  - 成功抓取后提交偏移量

优点：
  - 内置持久化和重放
  - 通过添加分区进行水平扩展
  - 背压处理
  - 精确一次处理（使用幂等消费者）
```

### 存储分层

```
                     热路径                      冷路径
                   （实时）                     （批处理）
                       |                           |
                       v                           v
              +--------+--------+         +--------+--------+
              | Elasticsearch   |         | HDFS / S3       |
              | （解析内容，    |         | （原始 HTML，   |
              |  URL 元数据）   |         |  链接图）       |
              +--------+--------+         +--------+--------+
                       |                           |
                       v                           v
              +--------+--------+         +--------+--------+
              | SSD 支持的      |         | HDD / 对象      |
              | 节点            |         | 存储             |
              +-----------------+         +-----------------+

数据流：
  1. 抓取的页面 -> Kafka（缓冲）
  2. Kafka -> Elasticsearch（热层，可搜索）
  3. Kafka -> S3（冷层，归档）
  4. S3 -> Spark/MapReduce（批处理：PageRank、分析）
```

---

## 11. 部署架构

### 生产环境部署

```
                         +----------------------------+
                         |     Control Plane          |
                         |  +--------+ +-----------+  |
                         |  |ZooKeeper| |Monitoring |  |
                         |  |Cluster  | |(Prometheus|  |
                         |  |(coord)  | | + Grafana)|  |
                         |  +--------+ +-----------+  |
                         +-------------+--------------+
                                       |
          +----------------------------+----------------------------+
          |                            |                            |
          v                            v                            v
+---------+----------+  +--------------+-----------+  +-------------+----------+
|  Region: US-East   |  |  Region: EU-West        |  |  Region: AP-Southeast  |
|                    |  |                          |  |                        |
| +----------------+ |  | +----------------------+ |  | +--------------------+ |
| |Crawler Cluster | |  | |Crawler Cluster       | |  | |Crawler Cluster     | |
| |(8-16 nodes)    | |  | |(8-16 nodes)          | |  | |(8-16 nodes)        | |
| +-------+--------+ |  | +----------+-----------+ |  | +--------+-----------+ |
|         |          |  |            |              |  |          |             |
| +-------+--------+ |  | +----------+-----------+ |  | +--------+-----------+ |
| |Kafka Cluster   | |  | |Kafka Cluster         | |  | |Kafka Cluster       | |
| |(URL frontier)  | |  | |(URL frontier)        | |  | |(URL frontier)      | |
| +-------+--------+ |  | +----------+-----------+ |  | +--------+-----------+ |
|         |          |  |            |              |  |          |             |
| +-------+--------+ |  | +----------+-----------+ |  | +--------+-----------+ |
| |Redis Cluster   | |  | |Redis Cluster         | |  | |Redis Cluster       | |
| |(Bloom filter + | |  | |(Bloom filter +       | |  | |(Bloom filter +     | |
| | DNS cache)     | |  | | DNS cache)           | |  | | DNS cache)         | |
| +----------------+ |  | +----------------------+ |  | +--------------------+ |
+--------+-----------+  +------------+-------------+  +----------+-------------+
         |                           |                           |
         +---------------------------+---------------------------+
                                     |
                        +------------+------------+
                        |   Global Storage        |
                        |                         |
                        | +---------------------+ |
                        | | S3 / HDFS           | |
                        | | (raw HTML content)  | |
                        | +---------------------+ |
                        |                         |
                        | +---------------------+ |
                        | | Elasticsearch       | |
                        | | (parsed content)    | |
                        | +---------------------+ |
                        |                         |
                        | +---------------------+ |
                        | | Cassandra           | |
                        | | (URL metadata)      | |
                        | +---------------------+ |
                        +-------------------------+
```

### 多区域抓取优势

```
+------------------------+---------------------------------------------+
| 优势                   | 描述                                        |
+------------------------+---------------------------------------------+
| 更低延迟               | 从最近的区域抓取地理位置接近的站点          |
+------------------------+---------------------------------------------+
| 更好的覆盖             | 某些站点会屏蔽外国 IP 或按区域              |
|                        | 提供不同内容                                |
+------------------------+---------------------------------------------+
| 法律合规               | 遵守数据驻留要求                            |
|                        | （GDPR 要求欧盟数据留在欧盟）              |
+------------------------+---------------------------------------------+
| 故障隔离               | 区域性故障不会停止全局抓取                  |
+------------------------+---------------------------------------------+
| 带宽分布               | 将网络负载分散到各区域                      |
+------------------------+---------------------------------------------+
```

### 区域分配策略

```python
def assign_domain_to_region(domain):
    """
    将域名分配到最佳抓取区域。
    """
    tld = get_tld(domain)

    # 基于 TLD 的分配
    region_map = {
        '.us': 'us-east',    '.com': 'us-east',
        '.uk': 'eu-west',    '.de': 'eu-west',
        '.fr': 'eu-west',    '.eu': 'eu-west',
        '.cn': 'ap-southeast', '.jp': 'ap-southeast',
        '.kr': 'ap-southeast', '.au': 'ap-southeast',
    }

    if tld in region_map:
        return region_map[tld]

    # 基于 GeoIP 的回退
    ip = dns_resolve(domain)
    geo = geoip_lookup(ip)
    return closest_region(geo.latitude, geo.longitude)
```

---

## 12. 监控

### 关键指标仪表板

```
+--------------------------------------------------------------+
|                 网络爬虫监控仪表板                            |
+--------------------------------------------------------------+
|                                                              |
|  抓取速率               错误率                队列深度       |
|  +-----------+           +-----------+        +-----------+  |
|  |    /\     |           |           |        |      /\   |  |
|  |   /  \  / |           |  ___      |        |     /  \  |  |
|  |  /    \/  |           | /   \     |        |    /    \ |  |
|  | /         |           |/     \__  |        |   /      \|  |
|  |/          |           |          \|        |  /        |  |
|  +-----------+           +-----------+        +-----------+  |
|  目标：400/s             目标：<1%            告警：>1M      |
|  当前：387/s             当前：0.3%           当前：450K     |
|                                                              |
|  存储使用量              DNS 缓存命中          去重率        |
|  +-----------+           +-----------+        +-----------+  |
|  |       __/ |           |_________  |        |    ____   |  |
|  |     _/    |           |          ||        |   /    \  |  |
|  |   _/      |           |          ||        |  /      \ |  |
|  |  /        |           |          ||        | /        \|  |
|  |_/         |           |          ||        |/          |  |
|  +-----------+           +-----------+        +-----------+  |
|  已用 450 TB             命中：95.2%          URL：32%       |
|  容量：2 PB              未命中：4.8%         内容：8%       |
+--------------------------------------------------------------+
```

### 需要跟踪的指标

```
+---------------------------+------------------+------------------+
| 指标                      | 收集方式         | 告警阈值         |
+---------------------------+------------------+------------------+
| 抓取速率（页面/秒）      | 计数器           | < 300 页面/秒    |
| 抓取延迟（p50/p99）      | 直方图           | p99 > 10s        |
| HTTP 错误率               | 按状态码计数     | 5xx > 5%         |
| DNS 解析时间              | 直方图           | p99 > 500ms      |
| Robots.txt 拦截率         | 计数器           | > 20%（异常）    |
| 内容重复率                | 计数器           | > 50%（异常）    |
| URL 重复率                | 计数器           | > 80%（正常）    |
| 队列深度（Frontier）      | 仪表盘           | > 1000 万 URL    |
| 存储写入吞吐量            | 计数器           | < 100 MB/秒      |
| Bloom filter 假阳性率     | 采样计数器       | > 2%             |
| 爬虫节点 CPU              | 仪表盘           | > 80%            |
| 爬虫节点内存              | 仪表盘           | > 85%            |
| 网络带宽                  | 计数器           | > 80% 容量       |
| 蜘蛛陷阱检测              | 计数器           | > 100/小时       |
+---------------------------+------------------+------------------+
```

### 告警规则

```yaml
# Prometheus 告警规则（伪配置）

groups:
  - name: crawler_alerts
    rules:
      - alert: CrawlRateLow
        expr: rate(pages_crawled_total[5m]) < 300
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "抓取速率低于阈值"

      - alert: HighErrorRate
        expr: >
          rate(crawl_errors_total[5m])
          / rate(crawl_attempts_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "抓取错误率超过 5%"

      - alert: FrontierQueueOverflow
        expr: frontier_queue_depth > 10000000
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "URL Frontier 队列深度超过 1000 万"

      - alert: StorageNearCapacity
        expr: storage_used_bytes / storage_capacity_bytes > 0.9
        for: 1h
        labels:
          severity: critical
        annotations:
          summary: "存储容量达到 90%"

      - alert: BloomFilterHighFPRate
        expr: bloom_filter_false_positive_rate > 0.02
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Bloom filter 假阳性率超过 2%"
```

### 健康检查端点

```python
class CrawlerHealthCheck:
    def check(self):
        checks = {
            'frontier_accessible': self._check_frontier(),
            'storage_writable': self._check_storage(),
            'dns_resolving': self._check_dns(),
            'bloom_filter_loaded': self._check_bloom(),
            'kafka_connected': self._check_kafka(),
        }

        all_healthy = all(checks.values())
        return {
            'status': 'healthy' if all_healthy else 'degraded',
            'checks': checks,
            'metrics': {
                'pages_per_second': self.metrics.crawl_rate(),
                'queue_depth': self.frontier.total_size(),
                'error_rate': self.metrics.error_rate(),
                'uptime_seconds': self.metrics.uptime(),
            }
        }
```

---

## 13. 常见面试追问

### 如何抓取深层网络？

```
"深层网络"是指通过标准链接跟踪无法发现的内容：

1. 基于表单的内容：
   - 识别页面上的搜索表单
   - 从术语词典生成查询
   - 程序化提交表单并抓取结果

2. AJAX 加载的内容：
   - 使用无头浏览器触发动态加载
   - 拦截页面发出的 API 调用
   - 直接调用发现的 API

3. 需要登录的内容：
   - 公共爬虫通常不抓取
   - 对于内部爬虫：使用已认证的会话
   - 遵守 robots.txt 和服务条款

4. 数据库驱动的内容：
   - 从站点地图发现 URL 模式
   - 枚举已知的 ID 模式（/product/1, /product/2, ...）
   - 使用站点搜索功能发现内容

策略：
  表层网络抓取提供到深层网络入口点的链接。
  专门的"深层网络"爬虫专注于这些入口点，
  并使用特定领域的策略来发现隐藏内容。
```

### 如何处理 JavaScript 密集型站点？

```
分层渲染方案：

第 1 层：静态 HTML（90% 的页面）
  - 标准 HTTP 抓取
  - 快速且资源高效
  - 处理服务端渲染内容

第 2 层：延迟渲染（8% 的页面）
  - 先下载 HTML
  - 排队等待无头浏览器渲染
  - 更低优先级，更高资源成本

第 3 层：完整浏览器渲染（2% 的页面）
  - 实时无头浏览器（Playwright/Puppeteer）
  - 用于关键的 JS 密集型站点
  - 最昂贵，有限的吞吐量

实现：
  1. 首先使用 HTTP 客户端抓取
  2. 分析响应：检查 JS 框架标记、
     空 <body>、最少的文本内容
  3. 如果检测到 JS 密集型，路由到无头浏览器池
  4. 无头浏览器池：每个节点 10-20 个浏览器实例
  5. 缓存域名级别的渲染决策

每页成本比较：
  HTTP 抓取：      ~0.001 CPU 秒
  无头浏览器：     ~2-5 CPU 秒（贵 2000-5000 倍）
```

### 如何检测和避免爬虫陷阱？

```
检测策略：

1. URL 模式分析：
   - 跟踪每个域名的 URL 模式
   - 当某个模式生成 > N 个 URL 时发出警报
   - 示例：/calendar/YYYY/MM/DD 生成无限日期

2. 内容相似度：
   - 对同一域名内的页面进行 SimHash
   - 如果某个路径下 > 80% 的页面是近似重复的，
     很可能是陷阱

3. 深度限制：
   - 硬限制：永远不抓取超过深度 16 的页面
   - 软限制：对超过深度 8 的页面降低优先级

4. 页面与外链比率：
   - 正常页面：10-100 个外链
   - 陷阱页面：1000+ 个外链（自动生成的导航）

5. 循环检测：
   - 跟踪 URL 参数模式
   - 检测相同参数以不同顺序出现的情况

6. 响应分析：
   - 检测"软 404"（200 OK 带有"页面未找到"内容）
   - 检测重定向回自身的页面

避免方式：
  - 将已确认的陷阱模式加入每域名的黑名单
  - 对深层页面指数级降低优先级
  - 设置每域名页面预算
  - 对标记的域名进行人工审查
```

### 如何优先抓取重要页面？

```
多信号优先级评分：

信号 1：基于链接的重要性（PageRank）
  - 从链接图离线计算
  - 更高的 PageRank = 更重要的页面
  - 权重：30%

信号 2：域名权威度
  - 基于域名排名（Alexa、Majestic 等）
  - 权威域名上的所有页面获得加成
  - 权重：25%

信号 3：内容新鲜度需求
  - 新闻站点：每小时重新抓取
  - 博客：每天重新抓取
  - 静态页面：每月重新抓取
  - 权重：20%

信号 4：抓取深度
  - 较浅的页面（距种子跳数较少）更重要
  - 与深度成反比关系
  - 权重：15%

信号 5：用户参与度信号（如果可用）
  - 搜索结果的点击率
  - 页面停留时间
  - 社交分享
  - 权重：10%

综合得分：
  priority = 0.30 * pagerank_score
           + 0.25 * domain_authority_score
           + 0.20 * freshness_urgency_score
           + 0.15 * depth_score
           + 0.10 * engagement_score
```

### 如何实现增量抓取？

```
增量抓取避免重新下载未改变的页面。

技术 1：HTTP 条件请求
  请求：GET /page HTTP/1.1
            If-Modified-Since: Thu, 01 Jan 2026 00:00:00 GMT
            If-None-Match: "etag-abc123"

  响应：304 Not Modified（无正文，节省带宽）
   或：200 OK（新内容）

  存储每个响应的 ETag 和 Last-Modified。

技术 2：内容指纹
  - 计算上次抓取的 SimHash
  - 计算本次抓取的 SimHash
  - 如果汉明距离 = 0，页面未变更
  - 仅在内容实际变更时更新存储

技术 3：变更检测频率
  - 跟踪每个 URL 的变更历史
  - 拟合模型预测下次变更
  - 在预期变更前调度重新抓取

技术 4：站点地图变更跟踪
  - 许多站点在站点地图中发布 <lastmod>
  - 将 <lastmod> 与我们的最后抓取时间比较
  - 仅在 <lastmod> 更新时重新抓取

带宽节省：
  无增量抓取：500 TB/月（所有页面重新下载）
  有增量抓取：~100 TB/月（仅变更页面）
  节省：~80%
```

### 如何从抓取数据构建搜索索引？

```
抓取数据 -> 搜索索引管道：

+-----------+     +-------------+     +----------------+     +----------+
| Raw HTML  | --> | Text Extract| --> | Tokenize +     | --> | Inverted |
| (S3/HDFS) |     | + Clean     |     | Normalize      |     | Index    |
+-----------+     +-------------+     +----------------+     +----------+
                        |                    |                     |
                        v                    v                     v
                  +-----------+      +--------------+     +-----------+
                  | Language  |      | Stop word    |     | Posting   |
                  | Detection |      | Removal +    |     | Lists     |
                  +-----------+      | Stemming     |     +-----------+
                                     +--------------+

索引步骤：
  1. 从 HTML 中提取干净文本（移除脚本、样式、导航）
  2. 检测语言
  3. 分词
  4. 规范化：小写、词干提取、移除停用词
  5. 构建倒排索引：词项 -> [(doc_id, tf, positions), ...]
  6. 计算 TF-IDF 或 BM25 分数
  7. 存储到 Elasticsearch 或自定义搜索引擎

规模：
  10 亿文档 * 每文档约 1000 个唯一词项 = 1 万亿个 posting
  压缩后：倒排索引约 10-50 TB

用于排名的额外信号：
  - 链接图的 PageRank
  - 内容质量分数
  - 新鲜度时间戳
  - 域名权威度
  - 入链的锚文本
```

---

## 总结

### 架构决策记录

```
+-------------------------+--------------------+-----------------------------+
| 组件                    | 技术选择           | 理由                        |
+-------------------------+--------------------+-----------------------------+
| URL Frontier            | Kafka + RocksDB    | 持久化、分布式、            |
|                         |                    | 可水平扩展                  |
+-------------------------+--------------------+-----------------------------+
| URL 去重                | Bloom Filter       | 空间高效（10 亿 URL         |
|                         | （Redis 支持）     | 1% 假阳性率仅 1.14 GB）    |
+-------------------------+--------------------+-----------------------------+
| 内容去重                | SimHash（64 位）   | 快速近似重复检测            |
+-------------------------+--------------------+-----------------------------+
| 原始内容存储            | S3 带生命周期策略  | 廉价、持久、分层            |
+-------------------------+--------------------+-----------------------------+
| URL 元数据              | Cassandra          | 高写入吞吐量，              |
|                         |                    | 按域名分区                  |
+-------------------------+--------------------+-----------------------------+
| 搜索索引                | Elasticsearch      | 全文搜索、实时              |
+-------------------------+--------------------+-----------------------------+
| 链接图                  | HDFS（批处理）+    | PageRank 计算 +             |
|                         | Neo4j（查询）      | 实时遍历                    |
+-------------------------+--------------------+-----------------------------+
| DNS 缓存                | 本地 LRU +         | 多层缓存实现                |
|                         | Memcached          | 低延迟查询                  |
+-------------------------+--------------------+-----------------------------+
| 协调                    | ZooKeeper          | 领导者选举、配置、          |
|                         |                    | 健康监控                    |
+-------------------------+--------------------+-----------------------------+
| 监控                    | Prometheus +       | 指标、告警、                |
|                         | Grafana            | 仪表板                      |
+-------------------------+--------------------+-----------------------------+
```

### 关键权衡

```
1. 广度 vs 深度
   广泛抓取覆盖更多域名；深度抓取捕获每个域名更多页面。
   通过特定域名的抓取预算来平衡。

2. 新鲜度 vs 覆盖
   重新抓取现有页面与发现新页面竞争。
   分配约 70% 预算给新 URL，约 30% 给重新抓取。

3. 礼貌性 vs 速度
   激进的抓取能更快获得结果，但有被封禁的风险。
   始终倾向于保持礼貌。

4. 存储 vs 计算
   存储原始 HTML 用于重新处理，还是只存储解析内容？
   原始 HTML 允许后续使用改进的解析器重新处理。

5. 准确性 vs 空间（Bloom Filter）
   更低的假阳性率需要更多内存。
   10 亿 URL 以 1.14 GB 达到 1% 假阳性率是合理的权衡。

6. HTTP 抓取 vs 无头浏览器
   HTTP 比无头渲染便宜 2000-5000 倍。
   仅对已确认的 JS 密集型站点使用无头浏览器。
```
