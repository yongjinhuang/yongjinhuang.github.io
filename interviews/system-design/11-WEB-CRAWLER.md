# Design a Web Crawler

A web crawler (also called a spider or bot) systematically browses the World Wide Web to
discover and download web pages. It is a foundational component of search engines, data
mining pipelines, and web archiving systems.

---

## 1. Requirements Clarification

### Functional Requirements

| Requirement              | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| Crawl web pages          | Download HTML content from billions of URLs                  |
| Store content            | Persist raw HTML and parsed content for downstream consumers |
| Extract links            | Parse downloaded pages and discover new URLs                 |
| Detect duplicate URLs    | Avoid re-crawling the same URL                               |
| Detect duplicate content | Identify near-duplicate pages (mirrors, syndication)         |
| Respect robots.txt       | Honor crawl rules declared by site owners                    |
| Handle content types     | Process HTML, PDF, images, and other media                   |
| Incremental crawling     | Re-crawl pages based on change frequency                     |
| URL normalization        | Canonicalize URLs to avoid redundant fetches                 |

### Non-Functional Requirements

| Requirement     | Target                                                         |
| --------------- | -------------------------------------------------------------- |
| Scalability     | 1 billion pages per month                                      |
| Politeness      | Respect per-domain rate limits, crawl-delay, robots.txt        |
| Robustness      | Handle spider traps, malformed HTML, timeouts, server errors   |
| Extensibility   | Plugin architecture for new content types and extraction logic |
| Freshness       | Re-crawl important pages within hours of change                |
| Fault tolerance | No single point of failure; resume after crashes               |

### Scale Estimation

```
Target:           1,000,000,000 pages / month
Days per month:   30
Pages per day:    1B / 30 = ~33,333,333 pages/day
Pages per second: 33.3M / 86,400 = ~386 pages/sec

Average page size:       500 KB (HTML + embedded resources)
Raw storage per month:   1B * 500 KB = 500 TB / month
Raw storage per year:    500 TB * 12 = 6 PB / year

Bandwidth required:      386 pages/sec * 500 KB = ~193 MB/sec = ~1.54 Gbps

DNS lookups per second:  ~386 (cached reduces to ~40/sec with 90% hit rate)

Metadata per URL:        ~500 bytes (URL, status, timestamps, priority)
URL metadata storage:    1B * 500 bytes = 500 GB / month
```

### Back-of-Envelope Summary

```
+-----------------------------+-------------------+
| Metric                      | Value             |
+-----------------------------+-------------------+
| Pages per second            | ~400              |
| Bandwidth                   | ~1.5 Gbps        |
| Raw storage per month       | 500 TB            |
| URL metadata per month      | 500 GB            |
| DNS lookups per second      | ~400 (pre-cache)  |
| Crawler instances needed    | 50-100            |
| Avg crawl latency per page  | ~2-3 seconds      |
+-----------------------------+-------------------+
```

With ~400 pages/sec and each fetch taking ~2 seconds, we need at least 800 concurrent
connections spread across multiple crawler machines to sustain throughput.

---

## 2. High-Level Architecture

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

### Data Flow Summary

```
1. Seed URLs initialize the URL Frontier
2. Frontier selects next URL (respecting priority + politeness)
3. Check robots.txt cache for crawl permission
4. Resolve domain via DNS cache
5. Download page via HTTP client
6. Parse HTML content and extract links
7. Check content for near-duplicates (SimHash)
8. Store unique content to blob storage
9. Normalize extracted URLs
10. Filter URLs (scope, blacklist)
11. Check URL deduplication (Bloom filter)
12. Enqueue new URLs back to Frontier
13. Repeat
```

---

## 3. Core Components Deep Dive

### 3.1 Seed URLs

Seed URLs bootstrap the crawl. The choice of seeds dramatically affects coverage and
efficiency.

**Domain-Based Seeds:**

```
- Top sites from Alexa/Similarweb rankings (top 10K domains)
- Country-specific top domains (.uk, .de, .jp)
- Known high-quality directories (DMOZ, Wikipedia)
```

**Topic-Based Seeds:**

```
- Curated lists per vertical (news, e-commerce, academic)
- Sitemaps from major sites (sitemap.xml)
- Feeds from content aggregators (RSS, Atom)
```

**Seed Selection Strategy:**

```python
def generate_seeds():
    seeds = []

    # Tier 1: Major hubs with high outlink density
    seeds.extend(load_top_sites(count=10000))

    # Tier 2: Country-specific entry points
    for country_tld in ['.uk', '.de', '.fr', '.jp', '.cn', '.br']:
        seeds.extend(load_top_sites_for_tld(country_tld, count=1000))

    # Tier 3: Topic-specific entry points
    for topic in ['news', 'academic', 'ecommerce', 'government']:
        seeds.extend(load_topic_seeds(topic, count=500))

    # Tier 4: Known sitemaps
    seeds.extend(load_sitemap_urls())

    # Deduplicate and assign initial priorities
    return deduplicate_and_prioritize(seeds)
```

**Prioritization of Starting Points:**

| Tier | Source              | Priority | Rationale                       |
| ---- | ------------------- | -------- | ------------------------------- |
| 1    | Top 10K domains     | Highest  | Maximum outlink coverage        |
| 2    | Country TLD leaders | High     | Geographic coverage             |
| 3    | Topic verticals     | Medium   | Domain-specific depth           |
| 4    | Sitemaps            | Medium   | Direct URL discovery            |
| 5    | Re-crawl backlog    | Variable | Based on freshness requirements |

---

### 3.2 URL Frontier

The URL Frontier is the most critical component. It determines which URL to crawl next
while balancing two competing concerns: **priority** (crawl important pages first) and
**politeness** (do not overwhelm any single host).

#### Architecture

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

#### Politeness Queue Implementation

```python
class PolitenessQueue:
    """Per-host FIFO queue with rate limiting."""

    def __init__(self, host, crawl_delay=1.0):
        self.host = host
        self.crawl_delay = crawl_delay   # seconds between requests
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

#### Priority Calculation

```python
def calculate_priority(url, metadata):
    """
    Compute crawl priority score (0-100, higher = more important).
    """
    score = 0.0

    # Factor 1: Domain authority (0-30 points)
    domain_rank = get_domain_rank(url)  # e.g., from Alexa
    if domain_rank <= 1000:
        score += 30
    elif domain_rank <= 10000:
        score += 20
    elif domain_rank <= 100000:
        score += 10

    # Factor 2: PageRank from link graph (0-25 points)
    pagerank = get_pagerank(url)
    score += min(pagerank * 25, 25)

    # Factor 3: Freshness need (0-25 points)
    if metadata.last_crawled is not None:
        hours_since_crawl = hours_since(metadata.last_crawled)
        change_rate = metadata.estimated_change_rate  # changes per day
        staleness = hours_since_crawl * change_rate / 24.0
        score += min(staleness * 10, 25)
    else:
        score += 25  # never crawled = high priority

    # Factor 4: Crawl depth (0-20 points, prefer shallow)
    depth = metadata.depth
    score += max(0, 20 - depth * 2)

    return min(score, 100)
```

#### Frontier Persistence

The frontier must survive process restarts. Two common approaches:

```
Option A: Disk-backed queues (RocksDB / LevelDB)
  - Fast sequential writes
  - Survives crashes
  - Single-machine frontier

Option B: Distributed message queue (Kafka / RabbitMQ)
  - Multiple frontier partitions
  - Distributed crawlers consume from topics
  - Built-in persistence and replay
```

---

### 3.3 HTML Downloader

The downloader is responsible for fetching web pages over HTTP/HTTPS.

#### Core Implementation

```python
class HTMLDownloader:
    def __init__(self, config):
        self.timeout = config.get('timeout', 30)         # seconds
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
        # Step 1: Check robots.txt permission
        if not self.robots_cache.is_allowed(url, self.user_agent):
            return DownloadResult(url=url, status='ROBOTS_BLOCKED')

        # Step 2: Resolve DNS (cached)
        try:
            ip = self.dns_cache.resolve(get_host(url))
        except DNSError:
            return DownloadResult(url=url, status='DNS_FAILED')

        # Step 3: Download with retry
        for attempt in range(self.max_retries):
            try:
                response = self.session.get(
                    url,
                    timeout=self.timeout,
                    stream=True,
                    allow_redirects=True
                )

                # Check content length before downloading body
                content_length = int(
                    response.headers.get('Content-Length', 0)
                )
                if content_length > self.max_page_size:
                    return DownloadResult(
                        url=url, status='TOO_LARGE'
                    )

                # Read content with size limit
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

            # Exponential backoff between retries
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

#### Robots.txt Parsing and Caching

```python
class RobotsTxtCache:
    def __init__(self, ttl=86400):   # 24-hour cache
        self.cache = {}              # domain -> (RobotFileParser, expiry)
        self.ttl = ttl

    def is_allowed(self, url, user_agent):
        domain = get_domain(url)

        # Check cache
        if domain in self.cache:
            parser, expiry = self.cache[domain]
            if time.time() < expiry:
                return parser.can_fetch(user_agent, url)

        # Fetch and parse robots.txt
        robots_url = f"https://{domain}/robots.txt"
        try:
            resp = requests.get(robots_url, timeout=10)
            parser = RobotFileParser()
            parser.parse(resp.text.splitlines())
        except Exception:
            # If robots.txt unreachable, assume allowed
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

#### DNS Resolution Caching

```python
class DNSCache:
    """
    Local DNS cache to reduce DNS lookup latency.
    DNS lookups can take 10-200ms; caching reduces this to <1ms.
    """

    def __init__(self, ttl=3600, max_size=100000):
        self.cache = LRUCache(max_size)
        self.ttl = ttl

    def resolve(self, hostname):
        cached = self.cache.get(hostname)
        if cached and time.time() < cached['expiry']:
            return cached['ip']

        # Perform actual DNS lookup
        ip = socket.gethostbyname(hostname)
        self.cache.put(hostname, {
            'ip': ip,
            'expiry': time.time() + self.ttl
        })
        return ip
```

#### Redirect Handling

```
HTTP redirects can form chains. The downloader must:
1. Follow redirects up to a maximum depth (e.g., 10)
2. Record the final URL after all redirects
3. Treat the final URL as the canonical URL
4. Detect redirect loops

Common redirect patterns:
  http://example.com  ->  https://example.com       (protocol upgrade)
  https://example.com ->  https://www.example.com   (www canonicalization)
  https://example.com/old -> https://example.com/new (content moved)
```

---

### 3.4 Content Parser

The content parser extracts useful information from downloaded pages.

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

        # Extract text content
        text = self.content_extractor.extract_text(soup)

        # Extract metadata
        title = self._extract_title(soup)
        meta_desc = self._extract_meta(soup, 'description')
        canonical = self._extract_canonical(soup)

        # Extract all links
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

#### Link Extraction and Normalization

```python
class LinkExtractor:
    def extract(self, soup, base_url):
        links = []
        for anchor in soup.find_all('a', href=True):
            raw_href = anchor['href']

            # Resolve relative URLs
            absolute_url = urljoin(base_url, raw_href)

            # Normalize the URL
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
        URL normalization rules:
        1. Lowercase the scheme and host
        2. Remove default ports (80 for HTTP, 443 for HTTPS)
        3. Remove fragment (#section)
        4. Remove trailing slash (except root)
        5. Sort query parameters
        6. Remove tracking parameters (utm_*, fbclid, etc.)
        7. Decode percent-encoded characters where safe
        """
        parsed = urlparse(url)

        # Only crawl HTTP/HTTPS
        if parsed.scheme not in ('http', 'https'):
            return None

        scheme = parsed.scheme.lower()
        host = parsed.hostname.lower() if parsed.hostname else None
        if not host:
            return None

        # Remove default ports
        port = parsed.port
        if (scheme == 'http' and port == 80) or \
           (scheme == 'https' and port == 443):
            port = None

        # Remove fragment
        path = parsed.path or '/'

        # Remove trailing slash (except root)
        if path != '/' and path.endswith('/'):
            path = path.rstrip('/')

        # Sort and filter query parameters
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

        # Reconstruct
        netloc = host
        if port:
            netloc = f"{host}:{port}"

        return urlunparse((scheme, netloc, path, '', sorted_query, ''))

    def _is_crawlable(self, url):
        """Filter out non-crawlable URLs."""
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

#### Handling JavaScript-Rendered Pages

Many modern websites rely on client-side JavaScript rendering. A standard HTTP fetch
returns only a shell HTML document. For these sites, a headless browser is required.

```python
class HeadlessBrowserDownloader:
    """
    Uses a headless browser (Playwright/Puppeteer) for JS-heavy sites.
    Much slower and more resource-intensive than HTTP fetching.
    Use selectively for known JS-rendered domains.
    """

    def __init__(self):
        self.browser = None
        self.js_domains = load_js_domain_list()  # pre-configured list

    def should_use_headless(self, url):
        domain = get_domain(url)
        return domain in self.js_domains

    async def download(self, url):
        if not self.browser:
            self.browser = await launch_browser(headless=True)

        page = await self.browser.new_page()
        try:
            await page.goto(url, wait_until='networkidle', timeout=30000)

            # Wait for dynamic content to load
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

### 3.5 URL Deduplication

#### Bloom Filters

A Bloom filter is a space-efficient probabilistic data structure that tests whether an
element is a member of a set. It can produce false positives but never false negatives.

```
How a Bloom Filter Works:

1. Initialize a bit array of m bits, all set to 0
2. Use k independent hash functions
3. To ADD an element:
   - Hash the element with each of k hash functions
   - Set the corresponding bit positions to 1
4. To QUERY an element:
   - Hash the element with each of k hash functions
   - If ALL corresponding bits are 1 -> "probably in set"
   - If ANY bit is 0 -> "definitely not in set"


Adding "url_A" with k=3 hash functions:

  h1("url_A") = 2    h2("url_A") = 5    h3("url_A") = 9

  Bit array (m=12):
  Before: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

  After:  [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0]
                 ^           ^              ^
                 h1          h2             h3

Adding "url_B":
  h1("url_B") = 2    h2("url_B") = 7    h3("url_B") = 11

  After:  [0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1]
                 ^           ^     ^     ^     ^
               h1(A,B)     h2(A) h2(B) h3(A) h3(B)

Query "url_C":
  h1("url_C") = 2    h2("url_C") = 5    h3("url_C") = 11

  Check:  [0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1]
                 ^           ^                 ^
                 1           1                 1    -> All 1s!

  Result: "Probably in set" (FALSE POSITIVE - url_C was never added)

Query "url_D":
  h1("url_D") = 0    h2("url_D") = 3    h3("url_D") = 8

  Check:  [0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1]
           ^        ^              ^
           0        0              0    -> At least one 0

  Result: "Definitely not in set" (CORRECT)
```

#### False Positive Rate Calculation

```
Given:
  n = number of elements inserted
  m = number of bits in the filter
  k = number of hash functions

False positive probability:

  p = (1 - e^(-kn/m))^k

Optimal number of hash functions:

  k_opt = (m/n) * ln(2) ≈ 0.693 * (m/n)

For our web crawler:
  n = 1,000,000,000 (1 billion URLs)
  Target false positive rate: p = 1% = 0.01

Required bits per element:
  m/n = -1.44 * log2(p) = -1.44 * log2(0.01) = -1.44 * (-6.644) = 9.57

  m = 9.57 * 1,000,000,000 = 9.57 billion bits ≈ 1.14 GB

Optimal hash functions:
  k = 0.693 * 9.57 ≈ 7

+-------------------+----------+-----------+----------+
| False Positive    | Bits per | Total     | Hash     |
| Rate (p)          | Element  | Size (1B) | Functions|
+-------------------+----------+-----------+----------+
| 10%   (0.1)       | 4.79     | 572 MB    | 3        |
| 5%    (0.05)      | 6.24     | 745 MB    | 4        |
| 1%    (0.01)      | 9.57     | 1.14 GB   | 7        |
| 0.1%  (0.001)     | 14.35    | 1.71 GB   | 10       |
| 0.01% (0.0001)    | 19.17    | 2.29 GB   | 13       |
+-------------------+----------+-----------+----------+
```

At 1.14 GB for 1 billion URLs with a 1% false positive rate, a Bloom filter is vastly
more efficient than storing all URLs in a hash set (~50-100 GB).

#### Bloom Filter Implementation

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
        """Calculate optimal bit array size."""
        m = -(n * math.log(p)) / (math.log(2) ** 2)
        return int(m)

    def _optimal_hash_count(self, m, n):
        """Calculate optimal number of hash functions."""
        k = (m / n) * math.log(2)
        return int(k)

    def _get_hash_values(self, item):
        """
        Generate k hash values using double hashing technique.
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

#### URL Normalization for Deduplication

Before checking the Bloom filter, URLs must be normalized to their canonical form.
Different URL strings can point to the same resource:

```
All of these refer to the same page:
  http://Example.com/page
  http://example.com/page
  http://example.com/page/
  http://example.com/page?
  http://example.com/page#section
  http://example.com:80/page
  https://example.com/page?b=2&a=1
  https://example.com/page?a=1&b=2

After normalization, all become:
  https://example.com/page?a=1&b=2
```

---

### 3.6 Content Deduplication

URL deduplication catches identical URLs, but different URLs can serve identical or
near-identical content (mirrors, syndicated articles, URL parameters that do not change
content). Content deduplication addresses this.

#### SimHash for Near-Duplicate Detection

SimHash is a locality-sensitive hashing technique. Similar documents produce similar
hash values, and the Hamming distance between hashes indicates content similarity.

```
How SimHash Works:

Input: "the quick brown fox jumps over the lazy dog"

Step 1: Tokenize into features (shingles)
  Features: ["the quick", "quick brown", "brown fox",
             "fox jumps", "jumps over", "over the",
             "the lazy", "lazy dog"]

Step 2: Hash each feature to a 64-bit value
  hash("the quick")   = 0b1010...0011  (64 bits)
  hash("quick brown") = 0b0110...1101
  hash("brown fox")   = 0b1100...0010
  ... etc.

Step 3: For each bit position, sum +1 (if bit=1) or -1 (if bit=0)

  Bit position:    63  62  61  60  ...  1   0
  "the quick":     +1  -1  +1  -1       +1  +1
  "quick brown":   -1  +1  +1  -1       -1  +1
  "brown fox":     +1  +1  -1  -1       +1  -1
  ... (sum all features)
  -------------------------------------------------
  Running sum:     +3  -1  +5  -7       +1  +3

Step 4: Convert sums to bits (positive -> 1, negative -> 0)
  SimHash:         1    0   1   0  ...   1   1

Step 5: Compare SimHash values
  Two documents are "near-duplicates" if their SimHash values
  differ in <= k bit positions (Hamming distance <= k).

  Typically k = 3 for 64-bit SimHash.
```

#### SimHash Implementation

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

        # Create shingles
        shingles = [
            ' '.join(tokens[i:i + self.shingle_size])
            for i in range(len(tokens) - self.shingle_size + 1)
        ]

        # Initialize bit vote counters
        votes = [0] * self.hash_bits

        for shingle in shingles:
            h = self._hash_feature(shingle)
            for i in range(self.hash_bits):
                if h & (1 << i):
                    votes[i] += 1
                else:
                    votes[i] -= 1

        # Convert votes to bits
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

#### MinHash for Jaccard Similarity (Alternative)

MinHash estimates the Jaccard similarity between two sets of shingles.

```
Jaccard Similarity:  J(A, B) = |A ∩ B| / |A ∪ B|

MinHash Approximation:
  1. Create N random hash functions (e.g., N=200)
  2. For each document, compute N minimum hash values
     across all shingles
  3. Estimated Jaccard = (# matching min-hash values) / N

Two documents are near-duplicates if Jaccard >= 0.8 (80% similar).
```

---

## 4. Data Model

### URL Metadata Table

```sql
CREATE TABLE url_metadata (
    url_hash        BIGINT PRIMARY KEY,   -- 64-bit hash of normalized URL
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
    content_hash    BIGINT,               -- SimHash fingerprint
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

### Page Content Storage

```
Storage Strategy: Object storage (S3 / HDFS) for raw content

Object key format:
  s3://crawler-content/{year}/{month}/{day}/{url_hash}.html.gz

Metadata stored alongside:
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

### Link Graph

```sql
-- Edge list representation for the web graph
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

For PageRank computation at scale, the link graph is typically stored in a distributed
format:

```
+--------------------+------------------------------------------+
| Storage Option     | Use Case                                 |
+--------------------+------------------------------------------+
| Adjacency list     | MapReduce-based PageRank (HDFS files)    |
| Graph database     | Real-time graph queries (Neo4j, JanusGraph)|
| Adjacency matrix   | In-memory PageRank (sparse matrix)       |
| Edge list (Kafka)  | Streaming graph updates                  |
+--------------------+------------------------------------------+
```

---

## 5. Crawling Strategy

### BFS vs DFS

```
BFS (Breadth-First Search) - PREFERRED:
+------+
|Seed  | -> Level 0
+--+---+
   |
   +-----+-----+-----+
   |     |     |     |
   v     v     v     v
  [A]   [B]   [C]   [D]  -> Level 1
   |     |     |
   +--+  +--+  +--+
   |  |  |  |  |  |
   v  v  v  v  v  v
  [E][F][G][H][I][J]     -> Level 2

Advantages:
  - Discovers important pages first (high-value pages are typically
    linked from well-known seeds)
  - Avoids getting trapped in deep site hierarchies
  - Better for broad web coverage
  - Natural fit for priority-based crawling

DFS (Depth-First Search) - NOT PREFERRED for general crawling:
+------+
|Seed  |
+--+---+
   |
   v
  [A]
   |
   v
  [E] -> goes deep before exploring siblings
   |
   v
  [K]
   |
   ...  (may crawl thousands of pages on one site)

Problems:
  - Can get stuck in deep site hierarchies
  - Poor coverage breadth
  - Susceptible to spider traps
  - Unfair to other domains
```

### Path-Ascending Crawling

When a deep URL is discovered (e.g., from an external link), crawl the parent paths too:

```
Discovered: https://example.com/a/b/c/page.html

Path-ascending generates:
  https://example.com/a/b/c/
  https://example.com/a/b/
  https://example.com/a/
  https://example.com/

Rationale: parent pages often contain navigation and links to other
important content not directly linked from the original deep page.
```

### Re-Crawl Strategy

```python
def calculate_recrawl_interval(url_metadata):
    """
    Adaptive re-crawl interval based on historical change rate.

    Uses exponential moving average of change detection.
    """
    if url_metadata.crawl_count < 2:
        return timedelta(days=7)  # Default for new URLs

    # Calculate change rate from history
    change_rate = url_metadata.change_rate  # changes per day

    if change_rate > 1.0:
        # Changes multiple times per day (news sites)
        return timedelta(hours=1)
    elif change_rate > 0.1:
        # Changes roughly weekly
        return timedelta(days=3)
    elif change_rate > 0.01:
        # Changes roughly monthly
        return timedelta(days=14)
    else:
        # Rarely changes
        return timedelta(days=30)
```

### Crawl Budget Per Domain

```
Crawl Budget = Maximum pages to crawl per domain per day

Factors:
  1. Domain importance (rank, traffic)
  2. Server capacity (response times, error rates)
  3. Content freshness (how often the site updates)
  4. Content quality (unique vs duplicate content)

+------------------+------------------+
| Domain Tier      | Daily Budget     |
+------------------+------------------+
| Tier 1 (top 1K)  | 100,000 pages   |
| Tier 2 (top 10K) | 10,000 pages    |
| Tier 3 (top 100K)| 1,000 pages     |
| Tier 4 (others)  | 100 pages       |
+------------------+------------------+
```

---

## 6. Handling Edge Cases

### Spider Traps

Spider traps are URL patterns that generate an infinite number of pages:

```
Common trap types:

1. Infinite query parameter combinations:
   /page?sort=asc&page=1&filter=new&tag=...
   (combinatorial explosion of parameters)

2. Calendar traps:
   /calendar/2026/03/01
   /calendar/2026/03/02
   /calendar/2026/03/03
   ... (infinite future dates)

3. Session ID traps:
   /page?sessionid=abc123
   /page?sessionid=def456
   (same content, different session IDs)

4. Soft 404s:
   /nonexistent/page -> returns 200 OK with "not found" content
   (crawler thinks it found a valid page)

5. Dynamically generated paths:
   /a/b/c/d/e/f/g/h/i/j/k/l/...
   (infinite depth)
```

**Detection and Mitigation:**

```python
class SpiderTrapDetector:
    def __init__(self):
        self.max_depth = 16
        self.max_params = 5
        self.max_pages_per_path_pattern = 1000
        self.path_pattern_counts = defaultdict(int)

    def is_trap(self, url, depth):
        parsed = urlparse(url)

        # Check 1: Maximum crawl depth
        if depth > self.max_depth:
            return True

        # Check 2: Too many query parameters
        params = parse_qs(parsed.query)
        if len(params) > self.max_params:
            return True

        # Check 3: Repeating path segments
        segments = parsed.path.strip('/').split('/')
        if len(segments) != len(set(segments)):
            return True  # Repeating segments suggest a trap

        # Check 4: Path pattern frequency
        pattern = self._extract_path_pattern(parsed.path)
        self.path_pattern_counts[pattern] += 1
        if self.path_pattern_counts[pattern] > self.max_pages_per_path_pattern:
            return True

        # Check 5: Very long URLs
        if len(url) > 2048:
            return True

        return False

    def _extract_path_pattern(self, path):
        """
        Replace numeric segments with {N} to detect patterns.
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

### Dynamic Content / JavaScript Rendering

```
Decision matrix for JS rendering:

+----------------------------------+------------------+------------------+
| Signal                           | Use HTTP Fetch   | Use Headless     |
+----------------------------------+------------------+------------------+
| Static HTML (server-rendered)    | Yes              | No               |
| Single Page Application (SPA)    | No               | Yes              |
| Minimal <body> content           | No               | Yes              |
| data-reactroot / ng-app attrs    | No               | Yes              |
| Known JS-heavy domain            | No               | Yes              |
| <noscript> tag with full content | Yes              | No               |
+----------------------------------+------------------+------------------+

Strategy:
  1. First attempt with HTTP fetch
  2. If page body is suspiciously small (<1KB text) or contains
     JS framework markers, retry with headless browser
  3. Maintain a domain-level cache of "needs headless" decisions
```

### Very Large Pages

```
Protection mechanisms:
  1. Content-Length header check before downloading body
  2. Streaming download with byte limit (10MB default)
  3. Timeout per page (30 seconds)
  4. Drop oversized pages and log for review

Handling:
  - Pages > 10MB: skip entirely
  - Pages > 1MB: download but reduce parsing effort
  - Pages < 1MB: full processing
```

### Broken HTML

```
The parser must be fault-tolerant:
  - Use lenient parsers (BeautifulSoup with lxml or html5lib)
  - Never crash on malformed HTML
  - Extract what is possible, skip what is not
  - Log parsing errors for monitoring
```

### Non-HTML Content

```
+---------------+------------------+----------------------------------+
| Content Type  | Action           | Notes                            |
+---------------+------------------+----------------------------------+
| text/html     | Full parse       | Extract text + links             |
| application/  | PDF extraction   | Use pdfminer/PyPDF2              |
|   pdf         |                  |                                  |
| text/plain    | Store as-is      | No link extraction               |
| image/*       | Store metadata   | Extract EXIF, alt text from      |
|               |                  | referring page                   |
| application/  | Parse JSON       | Extract URLs from values         |
|   json        |                  |                                  |
| text/xml      | Parse sitemap    | Extract URLs from sitemaps       |
| Other         | Skip or store    | Based on crawl configuration     |
+---------------+------------------+----------------------------------+
```

---

## 7. Distributed Crawling

### Architecture

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

### URL Space Partitioning

```python
def assign_url_to_crawler(url, num_crawlers):
    """
    Partition URLs by domain using consistent hashing.
    All URLs from the same domain go to the same crawler,
    ensuring politeness is enforced locally.
    """
    domain = get_domain(url)
    domain_hash = hash(domain) % num_crawlers
    return domain_hash
```

### Consistent Hashing for Crawler Assignment

```
Hash ring with virtual nodes:

           Crawler 1 (v1)
               |
    Crawler 3 (v2)---+---Crawler 1 (v2)
         |                       |
         |       Hash Ring       |
         |                       |
    Crawler 2 (v2)---+---Crawler 3 (v1)
               |
           Crawler 2 (v1)

Domain hash -> nearest clockwise crawler node

Benefits:
  - Adding/removing crawlers only redistributes ~1/N of domains
  - Virtual nodes ensure even distribution
  - Failed crawler's domains automatically reroute
```

### Cross-Crawler Communication

When Crawler A discovers a URL that belongs to Crawler B's partition:

```
+-------------------+        URL Exchange Queue        +-------------------+
|   Crawler A       |  -----> (Kafka topic per       |   Crawler B       |
|   discovers       |         crawler partition)      |   receives URL    |
|   url for B's     |                                 |   and enqueues    |
|   partition       |                                 |   in local        |
+-------------------+                                 |   frontier        |
                                                      +-------------------+

Kafka Topics:
  crawler-urls-partition-0   (Crawler 0 consumes)
  crawler-urls-partition-1   (Crawler 1 consumes)
  crawler-urls-partition-2   (Crawler 2 consumes)
  ...
  crawler-urls-partition-N   (Crawler N consumes)
```

### Fault Tolerance

```
Failure Scenarios and Recovery:

1. Crawler node crashes:
   - ZooKeeper detects heartbeat loss
   - URLs in crashed node's frontier are reassigned
   - Other crawlers take over affected domain partitions

2. Network partition:
   - Crawler continues with locally queued URLs
   - Cross-crawler URL exchange buffers in Kafka
   - Reconciles when connectivity restored

3. Storage failure:
   - Content store (S3/HDFS) has built-in replication
   - Bloom filter state periodically checkpointed
   - Frontier state persisted to disk (RocksDB)

4. DNS failure:
   - Local DNS cache provides temporary resilience
   - Fallback to multiple DNS resolvers
   - URLs with DNS failures re-queued with backoff
```

---

## 8. Politeness and Ethics

### robots.txt Compliance

```
Example robots.txt:

  User-agent: *
  Disallow: /admin/
  Disallow: /private/
  Crawl-delay: 2

  User-agent: MyCrawler
  Allow: /public/
  Disallow: /
  Crawl-delay: 5

  Sitemap: https://example.com/sitemap.xml

Interpretation:
  - All crawlers: blocked from /admin/ and /private/, 2s delay
  - MyCrawler specifically: only allowed /public/, 5s delay
  - Sitemap location provided for efficient URL discovery
```

### Rate Limiting Strategy

```python
class DomainRateLimiter:
    """
    Token bucket rate limiter per domain.
    """

    def __init__(self, default_delay=1.0):
        self.default_delay = default_delay
        self.domain_states = {}

    def acquire(self, domain):
        """Block until it is polite to crawl this domain."""
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
        """Adapt delay based on server behavior."""
        state = self.domain_states[domain]

        if status_code == 429:  # Too Many Requests
            state['delay'] = min(state['delay'] * 2, 60)  # back off
            state['consecutive_errors'] += 1
        elif status_code >= 500:
            state['delay'] = min(state['delay'] * 1.5, 30)
            state['consecutive_errors'] += 1
        else:
            state['consecutive_errors'] = 0
            # Gradually reduce delay if server is responsive
            if response_time < 1.0 and state['delay'] > self.default_delay:
                state['delay'] = max(
                    state['delay'] * 0.9, self.default_delay
                )
```

### Ethical Crawling Checklist

```
+----+--------------------------------------------+
| #  | Practice                                   |
+----+--------------------------------------------+
| 1  | Always identify with a descriptive         |
|    | User-Agent string                          |
| 2  | Include contact info in User-Agent or      |
|    | provide a crawl info page                  |
| 3  | Respect robots.txt directives              |
| 4  | Honor Crawl-delay headers                  |
| 5  | Respond to abuse complaints promptly       |
| 6  | Avoid crawling during site peak hours       |
|    | (if known)                                 |
| 7  | Do not follow nofollow links for crawling   |
|    | priority (respect publisher intent)         |
| 8  | Identify and honor meta robots tags         |
|    | (noindex, nofollow)                        |
| 9  | Support If-Modified-Since for re-crawls     |
| 10 | Do not store or redistribute copyrighted    |
|    | content without permission                 |
+----+--------------------------------------------+
```

### Legal Considerations

```
Key legal frameworks affecting web crawlers:

1. Terms of Service (ToS)
   - Many sites explicitly prohibit automated access
   - Violating ToS can lead to legal action (hiQ v. LinkedIn)

2. CFAA (Computer Fraud and Abuse Act) - US
   - Accessing a computer "without authorization" is a federal crime
   - Court interpretations vary on what constitutes authorization

3. GDPR (General Data Protection Regulation) - EU
   - Crawled content may contain personal data
   - Must have a lawful basis for processing
   - Data subjects have the right to erasure

4. Copyright Law
   - Crawling itself may be fair use (for indexing purposes)
   - Storing and redistributing content may violate copyright
   - Safe harbor provisions may apply
```

---

## 9. Storage System

### Storage Tiers

```
+-------------------+-----------------+------------------+------------------+
| Data Type         | Storage System  | Access Pattern   | Retention        |
+-------------------+-----------------+------------------+------------------+
| Raw HTML          | S3 / HDFS       | Write-heavy,     | 6 months         |
|                   |                 | batch read       | (compressed)     |
+-------------------+-----------------+------------------+------------------+
| Parsed content    | Elasticsearch   | Read-heavy,      | Indefinite       |
| (text + metadata) |                 | full-text search | (latest version) |
+-------------------+-----------------+------------------+------------------+
| URL metadata      | Cassandra /     | Read-write,      | Indefinite       |
|                   | DynamoDB        | key-value lookup |                  |
+-------------------+-----------------+------------------+------------------+
| Link graph        | Neo4j /         | Graph traversal, | Indefinite       |
|                   | HDFS (batch)    | batch processing | (snapshot)       |
+-------------------+-----------------+------------------+------------------+
| Bloom filter      | Redis / In-mem  | High-frequency   | Rebuilt on       |
| (URL seen)        |                 | lookups          | restart          |
+-------------------+-----------------+------------------+------------------+
| Robots.txt cache  | Local + Redis   | Per-domain       | 24h TTL          |
|                   |                 | lookups          |                  |
+-------------------+-----------------+------------------+------------------+
| DNS cache         | Local + shared  | Per-domain       | 1h TTL           |
|                   | (memcached)     | lookups          |                  |
+-------------------+-----------------+------------------+------------------+
```

### Raw HTML Storage (S3/HDFS)

```
Storage layout:

s3://crawler-raw/
  ├── 2026/
  │   ├── 03/
  │   │   ├── 01/
  │   │   │   ├── 00/   (hour)
  │   │   │   │   ├── abc123def456.html.gz
  │   │   │   │   ├── fed789cba012.html.gz
  │   │   │   │   └── ...
  │   │   │   ├── 01/
  │   │   │   └── ...
  │   │   ├── 02/
  │   │   └── ...
  │   └── ...
  └── ...

Compression:  gzip (typical 5:1 ratio for HTML)
Effective storage: 500 TB/month raw -> ~100 TB/month compressed

Lifecycle policy:
  - Hot tier (< 7 days):   Standard S3
  - Warm tier (7-30 days): S3 Infrequent Access
  - Cold tier (30-180 days): S3 Glacier
  - Delete after 180 days (unless flagged for archival)
```

### Parsed Content Storage (Elasticsearch)

```json
{
  "mappings": {
    "properties": {
      "url": { "type": "keyword" },
      "url_hash": { "type": "long" },
      "domain": { "type": "keyword" },
      "title": { "type": "text", "analyzer": "standard" },
      "description": { "type": "text", "analyzer": "standard" },
      "body_text": { "type": "text", "analyzer": "standard" },
      "language": { "type": "keyword" },
      "content_length": { "type": "integer" },
      "crawl_time": { "type": "date" },
      "simhash": { "type": "long" },
      "outlink_count": { "type": "integer" },
      "inlink_count": { "type": "integer" }
    }
  }
}
```

### URL Metadata Storage (Distributed KV Store)

```
Cassandra schema optimized for crawl operations:

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

-- Partition by domain for:
--   1. Efficient per-domain queries (crawl budget)
--   2. Co-located data for politeness enforcement
--   3. Even distribution across Cassandra nodes
```

---

## 10. Scaling

### Horizontal Scaling of Crawlers

```
Scaling formula:

  Required crawlers = (target_pages_per_sec * avg_latency) / concurrency_per_node

Example:
  Target:    400 pages/sec
  Avg latency: 2 seconds per page
  Concurrency: 100 connections per node

  Required:  (400 * 2) / 100 = 8 crawler nodes

With headroom (2x):  16 crawler nodes

Scaling triggers:
  - Queue depth exceeding threshold
  - Crawl rate below target
  - Average latency increasing

Auto-scaling policy:
  - Scale up:   if crawl_rate < 0.8 * target for 5 minutes
  - Scale down: if crawl_rate > 1.2 * target for 15 minutes
  - Min nodes:  8 (handle baseline load)
  - Max nodes:  64 (cost ceiling)
```

### DNS Cache Cluster

```
Architecture:

  Crawler Node  --(cache miss)-->  Local DNS Cache (LRU, 100K entries)
       |
       +--(cache miss)-->  Shared DNS Cache (Memcached cluster)
       |
       +--(cache miss)-->  Recursive DNS Resolver (Unbound)
       |
       +--(cache miss)-->  Public DNS (8.8.8.8, 1.1.1.1)

Cache hit rates:
  Local cache:    ~85% hit rate
  Shared cache:   ~10% (of misses from local)
  DNS resolver:   ~4%
  Public DNS:     ~1%

Effective DNS lookups to external servers:
  400 pages/sec * 1% = 4 lookups/sec (negligible)
```

### Distributed URL Frontier (Kafka-Based)

```
Kafka-based frontier for distributed crawling:

Producer (URL Extractor):
  - Extracts URLs from parsed pages
  - Hashes domain to determine partition
  - Produces to crawler-urls-partition-{N}

Kafka Topics:
  crawler-urls-high-priority    (partition by domain hash)
  crawler-urls-medium-priority  (partition by domain hash)
  crawler-urls-low-priority     (partition by domain hash)

Consumer (Crawler Node):
  - Each crawler consumes from its assigned partitions
  - Maintains local per-domain politeness queues
  - Commits offsets after successful crawl

Benefits:
  - Built-in persistence and replay
  - Horizontal scaling by adding partitions
  - Back-pressure handling
  - Exactly-once processing (with idempotent consumers)
```

### Storage Tiering

```
                     Hot Path                    Cold Path
                   (real-time)                  (batch)
                       |                           |
                       v                           v
              +--------+--------+         +--------+--------+
              | Elasticsearch   |         | HDFS / S3       |
              | (parsed content,|         | (raw HTML,      |
              |  URL metadata)  |         |  link graph)    |
              +--------+--------+         +--------+--------+
                       |                           |
                       v                           v
              +--------+--------+         +--------+--------+
              | SSD-backed      |         | HDD / Object    |
              | nodes           |         | storage         |
              +-----------------+         +-----------------+

Data flow:
  1. Crawled page -> Kafka (buffer)
  2. Kafka -> Elasticsearch (hot, searchable)
  3. Kafka -> S3 (cold, archival)
  4. S3 -> Spark/MapReduce (batch processing: PageRank, analytics)
```

---

## 11. Deployment Architecture

### Production Deployment

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

### Multi-Region Crawling Benefits

```
+------------------------+---------------------------------------------+
| Benefit                | Description                                 |
+------------------------+---------------------------------------------+
| Lower latency          | Crawl geographically close sites from       |
|                        | the nearest region                          |
+------------------------+---------------------------------------------+
| Better coverage        | Some sites block foreign IPs or serve       |
|                        | different content by region                 |
+------------------------+---------------------------------------------+
| Legal compliance       | Respect data residency requirements         |
|                        | (GDPR requires EU data stays in EU)         |
+------------------------+---------------------------------------------+
| Fault isolation        | Regional outage does not stop global crawl   |
+------------------------+---------------------------------------------+
| Bandwidth distribution | Spread network load across regions          |
+------------------------+---------------------------------------------+
```

### Region Assignment Strategy

```python
def assign_domain_to_region(domain):
    """
    Assign a domain to the best crawling region.
    """
    tld = get_tld(domain)

    # TLD-based assignment
    region_map = {
        '.us': 'us-east',    '.com': 'us-east',
        '.uk': 'eu-west',    '.de': 'eu-west',
        '.fr': 'eu-west',    '.eu': 'eu-west',
        '.cn': 'ap-southeast', '.jp': 'ap-southeast',
        '.kr': 'ap-southeast', '.au': 'ap-southeast',
    }

    if tld in region_map:
        return region_map[tld]

    # GeoIP-based fallback
    ip = dns_resolve(domain)
    geo = geoip_lookup(ip)
    return closest_region(geo.latitude, geo.longitude)
```

---

## 12. Monitoring

### Key Metrics Dashboard

```
+--------------------------------------------------------------+
|                 Web Crawler Monitoring Dashboard              |
+--------------------------------------------------------------+
|                                                              |
|  Crawl Rate              Error Rate           Queue Depth    |
|  +-----------+           +-----------+        +-----------+  |
|  |    /\     |           |           |        |      /\   |  |
|  |   /  \  / |           |  ___      |        |     /  \  |  |
|  |  /    \/  |           | /   \     |        |    /    \ |  |
|  | /         |           |/     \__  |        |   /      \|  |
|  |/          |           |          \|        |  /        |  |
|  +-----------+           +-----------+        +-----------+  |
|  Target: 400/s           Target: <1%          Alert: >1M     |
|  Current: 387/s          Current: 0.3%        Current: 450K  |
|                                                              |
|  Storage Used            DNS Cache Hit        Dedup Rate     |
|  +-----------+           +-----------+        +-----------+  |
|  |       __/ |           |_________  |        |    ____   |  |
|  |     _/    |           |          ||        |   /    \  |  |
|  |   _/      |           |          ||        |  /      \ |  |
|  |  /        |           |          ||        | /        \|  |
|  |_/         |           |          ||        |/          |  |
|  +-----------+           +-----------+        +-----------+  |
|  450 TB used             Hit: 95.2%           URL: 32%       |
|  Capacity: 2 PB          Miss: 4.8%           Content: 8%   |
+--------------------------------------------------------------+
```

### Metrics to Track

```
+---------------------------+------------------+------------------+
| Metric                    | Collection       | Alert Threshold  |
+---------------------------+------------------+------------------+
| Crawl rate (pages/sec)    | Counter          | < 300 pages/sec  |
| Crawl latency (p50/p99)   | Histogram        | p99 > 10s        |
| HTTP error rate            | Counter by code  | 5xx > 5%         |
| DNS resolution time        | Histogram        | p99 > 500ms      |
| Robots.txt block rate      | Counter          | > 20% (unusual)  |
| Content duplicate rate     | Counter          | > 50% (unusual)  |
| URL duplicate rate         | Counter          | > 80% (normal)   |
| Queue depth (frontier)     | Gauge            | > 10M URLs       |
| Storage write throughput   | Counter          | < 100 MB/sec     |
| Bloom filter FP rate       | Sampled counter  | > 2%             |
| Crawler node CPU           | Gauge            | > 80%            |
| Crawler node memory        | Gauge            | > 85%            |
| Network bandwidth          | Counter          | > 80% capacity   |
| Spider trap detections     | Counter          | > 100/hour       |
+---------------------------+------------------+------------------+
```

### Alerting Rules

```yaml
# Prometheus alerting rules (pseudo-config)

groups:
  - name: crawler_alerts
    rules:
      - alert: CrawlRateLow
        expr: rate(pages_crawled_total[5m]) < 300
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: 'Crawl rate below threshold'

      - alert: HighErrorRate
        expr: >
          rate(crawl_errors_total[5m])
          / rate(crawl_attempts_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: 'Crawl error rate exceeds 5%'

      - alert: FrontierQueueOverflow
        expr: frontier_queue_depth > 10000000
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: 'URL frontier queue depth exceeding 10M'

      - alert: StorageNearCapacity
        expr: storage_used_bytes / storage_capacity_bytes > 0.9
        for: 1h
        labels:
          severity: critical
        annotations:
          summary: 'Storage at 90% capacity'

      - alert: BloomFilterHighFPRate
        expr: bloom_filter_false_positive_rate > 0.02
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: 'Bloom filter false positive rate exceeds 2%'
```

### Health Check Endpoints

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

## 13. Common Interview Follow-ups

### How to crawl the deep web?

```
The "deep web" refers to content not discoverable through standard link following:

1. Form-based content:
   - Identify search forms on pages
   - Generate queries from a dictionary of terms
   - Submit forms programmatically and crawl results

2. AJAX-loaded content:
   - Use headless browser to trigger dynamic loading
   - Intercept API calls made by the page
   - Directly call discovered APIs

3. Login-required content:
   - Not typically crawled by public crawlers
   - For internal crawlers: use authenticated sessions
   - Respect robots.txt and ToS

4. Database-driven content:
   - Discover URL patterns from sitemaps
   - Enumerate known ID patterns (/product/1, /product/2, ...)
   - Use site search features to discover content

Strategy:
  Surface web crawling provides links to deep web entry points.
  Specialized "deep web" crawlers focus on these entry points and
  use domain-specific strategies to discover hidden content.
```

### How to handle JavaScript-heavy sites?

```
Tiered rendering approach:

Tier 1: Static HTML (90% of pages)
  - Standard HTTP fetch
  - Fast and resource-efficient
  - Handles server-rendered content

Tier 2: Deferred rendering (8% of pages)
  - Download HTML first
  - Queue for headless browser rendering
  - Lower priority, higher resource cost

Tier 3: Full browser rendering (2% of pages)
  - Real-time headless browser (Playwright/Puppeteer)
  - For critical JS-heavy sites
  - Most expensive, limited throughput

Implementation:
  1. Fetch with HTTP client first
  2. Analyze response: check for JS framework markers,
     empty <body>, minimal text content
  3. If JS-heavy detected, route to headless browser pool
  4. Headless browser pool: 10-20 browser instances per node
  5. Cache domain-level rendering decisions

Cost comparison (per page):
  HTTP fetch:       ~0.001 CPU-seconds
  Headless browser: ~2-5 CPU-seconds (2000-5000x more expensive)
```

### How to detect and avoid crawler traps?

```
Detection strategies:

1. URL pattern analysis:
   - Track URL patterns per domain
   - Alert when a pattern generates > N URLs
   - Example: /calendar/YYYY/MM/DD generates infinite dates

2. Content similarity:
   - SimHash pages within the same domain
   - If > 80% of pages from a path are near-duplicates,
     likely a trap

3. Depth limiting:
   - Hard limit: never crawl beyond depth 16
   - Soft limit: reduce priority for pages beyond depth 8

4. Page-to-outlink ratio:
   - Normal page: 10-100 outlinks
   - Trap page: 1000+ outlinks (auto-generated navigation)

5. Cycle detection:
   - Track URL parameter patterns
   - Detect when same parameters appear in different orders

6. Response analysis:
   - Detect "soft 404s" (200 OK with "page not found" content)
   - Detect pages that redirect back to themselves

Avoidance:
  - Blacklist confirmed trap patterns per domain
  - Exponentially decrease priority for deep pages
  - Set per-domain page budget
  - Human review for flagged domains
```

### How to prioritize important pages?

```
Multi-signal priority scoring:

Signal 1: Link-based importance (PageRank)
  - Compute offline from link graph
  - Higher PageRank = more important page
  - Weight: 30%

Signal 2: Domain authority
  - Based on domain rank (Alexa, Majestic, etc.)
  - All pages on authoritative domains get a boost
  - Weight: 25%

Signal 3: Content freshness requirement
  - News sites: re-crawl every hour
  - Blogs: re-crawl every day
  - Static pages: re-crawl every month
  - Weight: 20%

Signal 4: Crawl depth
  - Shallower pages (fewer hops from seed) are more important
  - Inverse relationship with depth
  - Weight: 15%

Signal 5: User engagement signals (if available)
  - Click-through rate from search results
  - Time on page
  - Social shares
  - Weight: 10%

Combined score:
  priority = 0.30 * pagerank_score
           + 0.25 * domain_authority_score
           + 0.20 * freshness_urgency_score
           + 0.15 * depth_score
           + 0.10 * engagement_score
```

### How to implement incremental crawling?

```
Incremental crawling avoids re-downloading unchanged pages.

Technique 1: HTTP Conditional Requests
  Request:  GET /page HTTP/1.1
            If-Modified-Since: Thu, 01 Jan 2026 00:00:00 GMT
            If-None-Match: "etag-abc123"

  Response: 304 Not Modified  (no body, saves bandwidth)
       or:  200 OK (new content)

  Store ETag and Last-Modified from every response.

Technique 2: Content fingerprinting
  - Compute SimHash of previous crawl
  - Compute SimHash of new crawl
  - If Hamming distance = 0, page unchanged
  - Only update storage if content actually changed

Technique 3: Change detection frequency
  - Track change history per URL
  - Fit a model to predict next change
  - Schedule re-crawl just before expected change

Technique 4: Sitemap change tracking
  - Many sites publish <lastmod> in sitemaps
  - Compare <lastmod> with our last crawl time
  - Only re-crawl if <lastmod> is newer

Bandwidth savings:
  Without incremental: 500 TB/month (all pages re-downloaded)
  With incremental:    ~100 TB/month (only changed pages)
  Savings: ~80%
```

### How to build a search index from crawled data?

```
Crawled Data -> Search Index Pipeline:

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

Indexing steps:
  1. Extract clean text from HTML (remove scripts, styles, nav)
  2. Detect language
  3. Tokenize into terms
  4. Normalize: lowercase, stem, remove stop words
  5. Build inverted index: term -> [(doc_id, tf, positions), ...]
  6. Compute TF-IDF or BM25 scores
  7. Store in Elasticsearch or custom search engine

Scale:
  1B documents * ~1000 unique terms per document = 1 trillion postings
  With compression: ~10-50 TB for the inverted index

Additional signals for ranking:
  - PageRank from link graph
  - Content quality score
  - Freshness timestamp
  - Domain authority
  - Anchor text from incoming links
```

---

## Summary

### Architecture Decision Record

```
+-------------------------+--------------------+-----------------------------+
| Component               | Technology Choice  | Rationale                   |
+-------------------------+--------------------+-----------------------------+
| URL Frontier            | Kafka + RocksDB    | Durable, distributed,       |
|                         |                    | horizontally scalable       |
+-------------------------+--------------------+-----------------------------+
| URL Deduplication       | Bloom Filter       | Space-efficient (1.14 GB    |
|                         | (Redis-backed)     | for 1B URLs at 1% FP)      |
+-------------------------+--------------------+-----------------------------+
| Content Deduplication   | SimHash (64-bit)   | Fast near-duplicate         |
|                         |                    | detection                   |
+-------------------------+--------------------+-----------------------------+
| Raw Content Store       | S3 with lifecycle  | Cheap, durable, tiered      |
+-------------------------+--------------------+-----------------------------+
| URL Metadata            | Cassandra          | High write throughput,      |
|                         |                    | partition by domain         |
+-------------------------+--------------------+-----------------------------+
| Search Index            | Elasticsearch      | Full-text search, real-time |
+-------------------------+--------------------+-----------------------------+
| Link Graph              | HDFS (batch) +     | PageRank computation +      |
|                         | Neo4j (queries)    | real-time traversal         |
+-------------------------+--------------------+-----------------------------+
| DNS Cache               | Local LRU +        | Multi-tier caching for      |
|                         | Memcached          | low-latency lookups         |
+-------------------------+--------------------+-----------------------------+
| Coordination            | ZooKeeper          | Leader election, config,    |
|                         |                    | health monitoring           |
+-------------------------+--------------------+-----------------------------+
| Monitoring              | Prometheus +       | Metrics, alerting,          |
|                         | Grafana            | dashboards                  |
+-------------------------+--------------------+-----------------------------+
```

### Key Trade-offs

```
1. Breadth vs Depth
   Broad crawling covers more domains; deep crawling captures more
   pages per domain. Balance with domain-specific crawl budgets.

2. Freshness vs Coverage
   Re-crawling existing pages competes with discovering new pages.
   Allocate ~70% budget to new URLs, ~30% to re-crawls.

3. Politeness vs Speed
   Aggressive crawling gets faster results but risks being blocked.
   Always err on the side of politeness.

4. Storage vs Compute
   Store raw HTML for reprocessing, or only store parsed content?
   Raw HTML enables reprocessing with improved parsers later.

5. Accuracy vs Space (Bloom Filter)
   Lower false positive rate requires more memory.
   1% FP at 1.14 GB is a reasonable trade-off for 1B URLs.

6. HTTP Fetch vs Headless Browser
   HTTP is 2000-5000x cheaper than headless rendering.
   Use headless only for confirmed JS-heavy sites.
```
