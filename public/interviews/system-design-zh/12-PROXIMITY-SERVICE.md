# 设计附近搜索服务 (Yelp / Nearby Search)

附近搜索服务为 Yelp、Google Maps、Uber 和 DoorDash 等应用中的"查找附近"功能提供支持。给定用户的位置和搜索半径，它会返回按距离、相关性或评分排序的商家或兴趣点 (POI)。

本指南深入介绍地理空间索引算法、系统架构、缓存、扩展以及常见面试追问。

---

## 1. 需求澄清

### 1.1 功能需求

| 需求               | 描述                                                       |
|--------------------|------------------------------------------------------------|
| **附近搜索**       | 根据位置 (lat/lng) + 半径搜索商家                           |
| **商家详情**       | 查看详细信息（名称、地址、营业时间、照片、评价）             |
| **商家 CRUD**      | 商家所有者可以添加、更新、删除商家列表                       |
| **筛选**           | 按类别筛选（餐厅、加油站、酒店等）                           |
| **排序**           | 按距离、评分、热门度或相关性排序                             |
| **自动补全**       | 用户输入时建议商家（此处不在范围内）                         |

### 1.2 非功能需求

| 需求                  | 目标                                                 |
|-----------------------|------------------------------------------------------|
| **延迟**              | 搜索 < 200ms (p99)                                   |
| **可用性**            | 99.99% 正常运行时间                                   |
| **一致性**            | 商家更新的最终一致性可接受                             |
| **可扩展性**          | 处理每天数十亿次查询                                   |
| **准确性**            | 在搜索半径内准确计算距离                               |

### 1.3 规模估算

```
商家总数:              200,000,000 (200M)
日活跃用户 (DAU):      500,000,000 (500M)
每用户每日搜索次数:    5
总搜索 QPS:            500M * 5 / 86,400 ~ 29,000 QPS
峰值 QPS (3倍平均值):  ~87,000 QPS

商家数据大小:
  - 平均记录大小:      ~1 KB（名称、纬度、经度、类别、元数据）
  - 商家数据总量:      200M * 1 KB = 200 GB

地理空间索引大小:
  - 每条记录 (id + geohash): ~50 bytes
  - 索引总量:               200M * 50 B = 10 GB（可放入内存！）

读写比:                ~1000:1（读密集型）
每日商家更新:          ~100,000（新增 + 编辑）
```

### 1.4 关键观察

1. 系统**压倒性地以读为主** -- 针对搜索进行优化。
2. 地理空间索引（~10 GB）**可放入单机内存**。
3. 商家数据变化不频繁 -- 非常适合缓存。
4. 位置数据具有内在的**空间局部性**（用户搜索附近区域）。

---

## 2. API 设计

### 2.1 搜索附近商家

```
GET /v1/search/nearby
```

**查询参数：**

| 参数         | 类型   | 必填     | 描述                                  |
|-------------|--------|----------|---------------------------------------|
| `lat`       | float  | 是       | 搜索中心的纬度                         |
| `lng`       | float  | 是       | 搜索中心的经度                         |
| `radius`    | int    | 否       | 搜索半径（米，默认 5000）               |
| `category`  | string | 否       | 商家类别筛选                           |
| `sort_by`   | string | 否       | distance, rating, popularity           |
| `page`      | int    | 否       | 页码（默认 1）                         |
| `page_size` | int    | 否       | 每页结果数（默认 20，最大 50）          |

**响应：**

```json
{
  "success": true,
  "data": {
    "businesses": [
      {
        "id": "biz_abc123",
        "name": "Joe's Pizza",
        "lat": 40.7580,
        "lng": -73.9855,
        "distance_meters": 234,
        "category": "restaurant",
        "rating": 4.5,
        "review_count": 1203,
        "price_level": 2,
        "is_open": true,
        "thumbnail_url": "https://cdn.example.com/biz_abc123/thumb.jpg"
      }
    ],
    "total": 145
  },
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 145,
    "has_next": true
  }
}
```

### 2.2 获取商家详情

```
GET /v1/businesses/{business_id}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "biz_abc123",
    "name": "Joe's Pizza",
    "lat": 40.7580,
    "lng": -73.9855,
    "address": "123 Broadway, New York, NY 10001",
    "phone": "+1-212-555-0123",
    "category": "restaurant",
    "subcategories": ["pizza", "italian"],
    "rating": 4.5,
    "review_count": 1203,
    "price_level": 2,
    "hours": {
      "monday": { "open": "10:00", "close": "23:00" },
      "tuesday": { "open": "10:00", "close": "23:00" }
    },
    "photos": ["url1", "url2"],
    "attributes": { "outdoor_seating": true, "delivery": true }
  }
}
```

### 2.3 商家 CRUD

```
POST   /v1/businesses              -- 创建新商家
PUT    /v1/businesses/{id}         -- 更新商家信息
DELETE /v1/businesses/{id}         -- 删除商家
GET    /v1/businesses/{id}/reviews -- 获取商家评价
POST   /v1/businesses/{id}/reviews -- 添加评价
```

---

## 3. 地理空间索引算法（深入分析）

核心挑战是：**给定一个点 (lat, lng) 和半径 r，找到距离 r 以内的所有商家。** 扫描所有 200M 商家的朴素方法是每次查询 O(n)，这太慢了。我们需要空间索引。

### 3.1 Geohash

#### Geohash 工作原理

Geohash 通过递归地二分坐标空间并交错比特位，将 2D 坐标（纬度、经度）编码为 1D 字符串。

**逐步编码 (37.7749, -122.4194)：**

```
经度范围: [-180, 180]
纬度范围: [-90, 90]

步骤 1 (经度): -122.4194 在 [-180, 0] 中?  是 -> bit 0
步骤 2 (纬度):  37.7749  在 [0, 90] 中?    是 -> bit 1
步骤 3 (经度): -122.4194 在 [-180, -90] 中? 否 -> bit 1
步骤 4 (纬度):  37.7749  在 [45, 90] 中?   否  -> bit 0
步骤 5 (经度): -122.4194 在 [-135, -90] 中? 是, [-135,-112.5]?
  -122.4194 在 [-90, -45] 中? ... (继续二分)

二进制结果: 0 1 1 0 0 1 0 0 1 1 1 1 1 1 0 0 0 0 1 0 ...
             ^L ^l ^L ^l ^L ^l ^L ^l ^L ^l
             (L=经度位, l=纬度位)

分成 5 位一组并映射到 base-32:
01100 = 12 -> 'c'  (非标准 base32，使用 0-9 b-z 排除 a,i,l,o)
10011 = 19 -> 'q'
11110 = 30 -> 'w'
...

结果: "9q8yy..." (旧金山)
```

#### Geohash 网格层级

每增加一个字符，网格单元就会缩小：

```
精度 1: "9"
+-----------------------------------------------+
|                                               |
|                                               |
|          覆盖 ~5,000 km x 5,000 km            |
|                                               |
|                                               |
+-----------------------------------------------+

精度 2: "9q"
+-------------------+
|                   |
|  ~1,250 x 625 km |
|                   |
+-------------------+

精度 4: "9q8y"              精度 6: "9q8yyk"
+--------+                       +--+
| ~40 km |                       |1 | ~1.2 km x 0.6 km
| x 20km |                       +--+
+--------+

精度 8: "9q8yykbv"
+--+
|  | ~38 m x 19 m
+--+
```

#### 精度级别表

| 精度  | 单元宽度    | 单元高度    | 用途                          |
|-------|-------------|-------------|-------------------------------|
| 1     | ~5,000 km   | ~5,000 km   | 大陆级别                      |
| 2     | ~1,250 km   | ~625 km     | 大型国家区域                  |
| 3     | ~156 km     | ~156 km     | 州/省                         |
| 4     | ~39 km      | ~19.5 km    | 城市级别                      |
| 5     | ~4.9 km     | ~4.9 km     | 区/街道                       |
| 6     | ~1.2 km     | ~0.6 km     | 街道级别（~1 km 半径）         |
| 7     | ~153 m      | ~153 m      | 建筑群                        |
| 8     | ~38 m       | ~19 m       | 单个建筑                      |

#### 半径到 Geohash 精度的映射

```
搜索半径    -> Geohash 精度
  500 m     -> 6 (单元 ~1.2 km)
  1 km      -> 5 (单元 ~4.9 km)
  5 km      -> 5 (单元 ~4.9 km)
  20 km     -> 4 (单元 ~39 km)
```

#### 边界问题

一个关键问题：两个距离很近的点如果跨越了单元边界，可能会有完全不同的 geohash。

```
    Geohash "9q8y"        Geohash "9q8z"
  +-----------------++-----------------+
  |                 ||                 |
  |            A *  || * B             |
  |                 ||                 |
  +-----------------++-----------------+

  A 和 B 相距 50 米，但在不同的 geohash 单元中。
  只搜索 "9q8y" 会遗漏 B！
```

**解决方案：搜索中心单元和所有 8 个相邻单元。**

```
  +--------+--------+--------+
  | 西北   | 北     | 东北   |
  | 9q8x   | 9q8z   | 9q90   |
  +--------+--------+--------+
  | 西     | 中心   | 东     |
  | 9q8v   | 9q8y   | 9q91   |
  +--------+--------+--------+
  | 西南   | 南     | 东南   |
  | 9q8t   | 9q8w   | 9q92   |
  +--------+--------+--------+

  查询: SELECT * FROM businesses
        WHERE geohash IN ('9q8y', '9q8z', '9q8x', '9q90',
                          '9q8v', '9q91', '9q8t', '9q8w', '9q92')
        -- 然后按精确距离后过滤
```

#### Geohash 前缀匹配进行范围查询

所有以相同前缀开头的 geohash 都在同一区域内。这个特性使得使用 B-tree 索引进行高效范围查询成为可能：

```sql
-- 所有以 "9q8y" 开头的单元中的商家
SELECT * FROM businesses
WHERE geohash LIKE '9q8y%'

-- 等价的范围扫描（更高效）：
SELECT * FROM businesses
WHERE geohash >= '9q8y' AND geohash < '9q8z'
```

这就是为什么 geohash 在标准数据库中表现出色 -- 它将 2D 空间查询转换为 B-tree 索引上的 1D 范围扫描。

#### Geohash 实现（伪代码）

```python
BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

def encode_geohash(lat, lng, precision=6):
    lat_range = (-90.0, 90.0)
    lng_range = (-180.0, 180.0)
    is_longitude = True
    bits = 0
    count = 0
    geohash = []

    while len(geohash) < precision:
        if is_longitude:
            mid = (lng_range[0] + lng_range[1]) / 2
            if lng >= mid:
                bits = bits * 2 + 1
                lng_range = (mid, lng_range[1])
            else:
                bits = bits * 2
                lng_range = (lng_range[0], mid)
        else:
            mid = (lat_range[0] + lat_range[1]) / 2
            if lat >= mid:
                bits = bits * 2 + 1
                lat_range = (mid, lat_range[1])
            else:
                bits = bits * 2
                lat_range = (lat_range[0], mid)

        is_longitude = not is_longitude
        count += 1

        if count == 5:
            geohash.append(BASE32[bits])
            bits = 0
            count = 0

    return ''.join(geohash)

# 示例:
# encode_geohash(37.7749, -122.4194, 6) -> "9q8yyk"
```

---

### 3.2 Quadtree

#### Quadtree 工作原理

Quadtree 递归地将 2D 空间划分为四个象限。每个节点要么：
- 包含点（叶节点），要么
- 恰好有四个子节点（内部节点）

当节点超过容量阈值（如 100 个商家）时进行分裂。

```
  世界 (根节点)
  +-------------------------------------------+
  |                     |                      |
  |        西北         |         东北          |
  |    (稀疏, 叶节点)   |   (密集, 已分裂)      |
  |                     |   +--------+------+  |
  |                     |   | 西北(10)|东北(8)|  |
  |                     |   +--------+------+  |
  |                     |   | 西南(95)|东南(12)|  |
  |---------------------+---+--------+------+  |
  |                     |                      |
  |        西南         |         东南          |
  |    (稀疏, 叶节点)   |    (稀疏, 叶节点)     |
  |                     |                      |
  +-------------------------------------------+

  密集的城市区域 -> 更深的树（更多分裂）
  稀疏的农村区域 -> 更浅的树（更少分裂）
```

#### Quadtree 节点结构

```
                      [根: 世界]
                     /    |    |    \
                   /      |    |      \
                 /        |    |        \
    [西北: 叶]  [东北: 内部节点]  [西南: 叶]  [东南: 叶]
     15 商家     继续分裂          3 商家      22 商家
                /    |    |    \
              西北  东北  西南   东南
             10商家 8商家 95商家 12商家
                         |
                      (如果 >100 则分裂)
```

#### 构建 Quadtree（伪代码）

```python
class Point:
    def __init__(self, lat, lng, business_id):
        self.lat = lat
        self.lng = lng
        self.business_id = business_id

class BoundingBox:
    def __init__(self, min_lat, max_lat, min_lng, max_lng):
        self.min_lat = min_lat
        self.max_lat = max_lat
        self.min_lng = min_lng
        self.max_lng = max_lng

    def contains(self, point):
        return (self.min_lat <= point.lat <= self.max_lat and
                self.min_lng <= point.lng <= self.max_lng)

    def intersects_circle(self, center_lat, center_lng, radius):
        # 检查边界框是否与搜索圆相交
        closest_lat = clamp(center_lat, self.min_lat, self.max_lat)
        closest_lng = clamp(center_lng, self.min_lng, self.max_lng)
        return haversine(center_lat, center_lng, closest_lat, closest_lng) <= radius

class QuadTreeNode:
    MAX_CAPACITY = 100

    def __init__(self, boundary):
        self.boundary = boundary
        self.points = []        # 商家位置
        self.children = None    # [西北, 东北, 西南, 东南] 或 None
        self.is_leaf = True

    def insert(self, point):
        if not self.boundary.contains(point):
            return False

        if self.is_leaf:
            self.points.append(point)
            if len(self.points) > self.MAX_CAPACITY:
                self._subdivide()
            return True

        # 内部节点：委托给子节点
        for child in self.children:
            if child.insert(point):
                return True
        return False

    def _subdivide(self):
        mid_lat = (self.boundary.min_lat + self.boundary.max_lat) / 2
        mid_lng = (self.boundary.min_lng + self.boundary.max_lng) / 2
        b = self.boundary

        self.children = [
            QuadTreeNode(BoundingBox(mid_lat, b.max_lat, b.min_lng, mid_lng)),  # 西北
            QuadTreeNode(BoundingBox(mid_lat, b.max_lat, mid_lng, b.max_lng)),  # 东北
            QuadTreeNode(BoundingBox(b.min_lat, mid_lat, b.min_lng, mid_lng)),  # 西南
            QuadTreeNode(BoundingBox(b.min_lat, mid_lat, mid_lng, b.max_lng)),  # 东南
        ]
        self.is_leaf = False

        # 将点重新分配给子节点
        for point in self.points:
            for child in self.children:
                if child.insert(point):
                    break
        self.points = []

    def query_range(self, center_lat, center_lng, radius):
        """查找中心点半径范围内的所有点。"""
        results = []

        if not self.boundary.intersects_circle(center_lat, center_lng, radius):
            return results

        if self.is_leaf:
            for point in self.points:
                dist = haversine(center_lat, center_lng, point.lat, point.lng)
                if dist <= radius:
                    results.append((point, dist))
            return results

        for child in self.children:
            results.extend(child.query_range(center_lat, center_lng, radius))

        return results
```

#### Quadtree 内存估算

```
200M 商家，每个叶节点最多 100 个：

叶节点:    ~200M / 100 = 2M 叶节点
内部节点:  ~2M / 3 = ~670K（每个内部节点有 4 个子节点）
总节点数:  ~2.67M

每个叶节点:
  - 边界: 4 个浮点数 * 8 字节 = 32 字节
  - 点数组: 100 * (8+8+8) 字节 = 2,400 字节（纬度、经度、id）
  - 开销: ~50 字节
  总计: ~2,500 字节

每个内部节点:
  - 边界: 32 字节
  - 4 个子指针: 32 字节
  - 开销: ~50 字节
  总计: ~114 字节

总内存:
  叶节点:   2M * 2,500 B = 5.0 GB
  内部节点: 670K * 114 B = 76.4 MB
  总计:     ~5.1 GB

这可以轻松放入单台服务器的 RAM 中（通常 64-128 GB）。
```

#### 动态与静态 Quadtree

| 方面           | 静态 Quadtree            | 动态 Quadtree             |
|---------------|--------------------------|---------------------------|
| 构建时间       | 批量（离线）              | 增量（在线）               |
| 更新           | 需要完整重建              | O(log n) 插入/删除         |
| 平衡性         | 构建时最优                | 可能变得不平衡             |
| 用途           | 不常变化的数据            | 频繁变化的数据             |
| 我们的选择     | **首选**（200M 商家，    | 用于移动对象               |
|               | 不频繁更新）              | 如 Uber 司机              |

---

### 3.3 S2 Geometry（Google 的方案）

#### Hilbert 曲线映射

S2 Geometry 由 Google 开发，将地球表面投影到一个立方体上，然后使用 **Hilbert 空间填充曲线**将 2D 区域映射到 1D 区间。

```
  Hilbert 曲线 (级别 3):

  +--+  +--+  +--+--+
  |  |  |  |  |     |
  +  +--+  +  +  +--+
  |        |  |  |
  +--+  +--+  +--+  +
     |  |        |  |
  +--+  +--+--+--+  +
  |                  |
  +--+--+--+--+--+--+

  关键洞察：曲线上接近的点在 2D 空间中也接近。
  （不像 Z-order / Morton 编码有不连续性）
```

#### S2 Cell 和级别

S2 将地球划分为层级结构的 cell：

```
级别 0:  6 个面 cell（立方体投影）
级别 1:  24 个 cell
级别 2:  96 个 cell
...
级别 12: 每个 cell ~1.3 km^2（适合城市级搜索）
级别 14: 每个 cell ~80,000 m^2
级别 16: 每个 cell ~5,000 m^2
...
级别 30: 每个 cell ~1 cm^2（最大分辨率）

Cell ID 是 64 位整数 -> 高效存储和比较
```

#### 为什么 S2 强大

1. **可变大小覆盖**：S2 可以用不同级别的 cell 集合覆盖任意形状，最小化过度获取。

```
  搜索半径：以用户为中心的圆

  Geohash 方式:            S2 方式:
  (固定大小网格)           (可变大小 cell)

  +---+---+---+              +---+---+
  |   | X |   |              | L | L |
  +---+---+---+              +---+---+---+
  | X |*U*| X |              | L |*S*|*S*| S |
  +---+---+---+              +---+*S*|*S*|---+
  |   | X |   |              | L | L |
  +---+---+---+              +---+---+

  Geohash: 9 个固定 cell     S2: 混合大小，更紧密贴合
  过度获取更多               过度获取更少
```

2. **在极点或反子午线处没有边界不连续性**。
3. **包含和相交**在 cell ID 上是 O(1) 操作。
4. **被 Google Maps 使用**，Google S2 库是开源的。

---

### 3.4 R-tree

#### 包围矩形方法

R-tree 使用**最小包围矩形 (MBR)** 组织空间数据。内部节点存储包围其子节点的 MBR。叶节点包含实际数据条目。

```
  R-tree 结构:

                     [根 MBR]
                    /          \
           [MBR A]              [MBR B]
          /   |   \            /   |   \
       [r1] [r2] [r3]      [r4] [r5] [r6]

  MBR A:                     MBR B:
  +------------------+       +------------------+
  |  +---+           |       |       +------+   |
  |  | r1|  +----+   |       |       |  r5  |   |
  |  +---+  | r2 |   |       |  +--+ +------+   |
  |         +----+   |       |  |r4|    +----+   |
  |    +------+      |       |  +--+    | r6 |   |
  |    |  r3  |      |       |          +----+   |
  |    +------+      |       |                   |
  +------------------+       +------------------+
```

#### 何时使用 R-tree

| 场景                                  | 最佳索引        |
|---------------------------------------|-----------------|
| 矩形区域查询                          | **R-tree**      |
| 点在多边形内查询                      | R-tree 或 S2    |
| 半径搜索（我们的用例）                | Geohash 或 S2   |
| 空间连接（重叠区域）                  | **R-tree**      |
| 使用 PostGIS 的数据库                 | R-tree (GiST)   |
| 内存分布式系统                        | Geohash 或 Quadtree |

R-tree 在 PostGIS（PostgreSQL + GIS 扩展）中表现优异，是大多数关系数据库中的默认空间索引。对于自定义内存系统，geohash 或 quadtree 实现更简单、更易分片。

---

### 3.5 对比表

| 特性               | Geohash          | Quadtree          | S2 Geometry        | R-tree            |
|--------------------|------------------|-------------------|--------------------|-------------------|
| **类型**           | 空间填充         | 树（内存）         | 空间填充           | 平衡树            |
|                    | 曲线 + 哈希      |                   | 曲线 (Hilbert)     |                   |
| **维度**           | 2D -> 1D 字符串  | 2D 细分           | 球面 -> 1D 整数    | nD 包围矩形       |
| **存储**           | 字符串列         | 内存树            | 64 位整数          | 磁盘树            |
| **数据库友好**     | 非常（B-tree）   | 否（自定义）       | 是（整数范围）     | 是 (GiST/R*)     |
| **精度**           | 每级固定         | 自适应            | 自适应             | 自适应            |
| **边界问题**       | 有（需要 8      | 无（树自然         | 无（Hilbert 曲线   | 无（MBR 重叠）    |
|                    | 个邻居）         | 处理）            | 连续性）           |                   |
| **更新成本**       | O(1) 重新哈希    | O(log n) 或       | O(1) 重新计算      | O(log n) 再平衡   |
|                    |                  | 完整重建           |                    |                   |
| **分片**           | 容易（前缀）     | 困难              | 容易（cell 范围）  | 困难              |
| **复杂度**         | 简单             | 中等              | 复杂               | 中等              |
| **使用者**         | Redis, Elastic   | 自定义 (Uber)     | Google Maps        | PostGIS, MongoDB  |
| **最适合**         | 简单附近         | 密集/稀疏         | 全球规模           | 多边形/区域       |
|                    | 搜索             | 自适应需求         | 可变覆盖           | 查询              |

**本系统推荐：Geohash** -- 最简单，兼容标准数据库，易于分片，对基于半径的搜索足够用。如需 Google 级别的全球覆盖需求可使用 S2。

---

## 4. 高层架构

```
                              +-----------+
                              |   客户端   |
                              | (移动端/  |
                              |   Web)    |
                              +-----+-----+
                                    |
                                    v
                             +------+------+
                             |    CDN /    |
                             | API Gateway |
                             |   + 认证    |
                             +------+------+
                                    |
                    +---------------+---------------+
                    |                               |
                    v                               v
        +-----------+----------+       +-----------+-----------+
        |  基于位置的服务       |       |   商家服务             |
        |  (LBS)               |       |   (CRUD 操作)          |
        |  (只读, 高            |       |   (低 QPS, 写操作)     |
        |   QPS, 无状态)        |       |                       |
        +-----------+----------+       +-----------+-----------+
                    |                               |
          +---------+---------+                     |
          |                   |                     v
          v                   v             +-------+-------+
  +-------+-------+  +-------+------+      |   商家        |
  | 地理空间       |  | 商家         |      |   数据库      |
  | 索引           |  | 缓存         |      |   (主库)      |
  | (Redis 中的    |  | (Redis)      |      |  (MySQL /     |
  |  Geohash 或    |  |              |      |   PostgreSQL) |
  |  内存)         |  +--------------+      +-------+-------+
  +---------------+                                |
                                                   v
                                           +-------+-------+
                                           |  只读副本     |
                                           |  (用于 LBS    |
                                           |   查询)       |
                                           +---------------+
```

### 架构原则

```
+----------------------------------------------------------------------+
|                         关键设计决策                                   |
+----------------------------------------------------------------------+
|                                                                      |
|  1. 分离读写路径                                                      |
|     - LBS 处理搜索（高 QPS，只读）                                    |
|     - 商家服务处理 CRUD（低 QPS，写操作）                              |
|     - 独立扩展                                                       |
|                                                                      |
|  2. LBS 无状态                                                       |
|     - 易于水平扩展                                                    |
|     - 负载均衡器均匀分配                                              |
|     - 地理空间索引加载到每个 LBS 服务器内存中                          |
|       或通过 Redis 集群共享                                           |
|                                                                      |
|  3. 地理空间索引在内存中                                              |
|     - 10 GB 索引适合放入 RAM                                         |
|     - 亚毫秒级查找                                                    |
|     - 跨 LBS 节点复制                                                |
|                                                                      |
|  4. 商家数据最终一致性                                                |
|     - 新商家需要几分钟才能出现在搜索结果中                             |
|     - 对此用例可接受                                                  |
|                                                                      |
+----------------------------------------------------------------------+
```

---

## 5. 数据模型

### 5.1 商家表（主数据库）

```sql
CREATE TABLE businesses (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    lat             DECIMAL(10, 7) NOT NULL,
    lng             DECIMAL(10, 7) NOT NULL,
    geohash         VARCHAR(12) NOT NULL,        -- 预计算的 geohash
    address         VARCHAR(500),
    city            VARCHAR(100),
    state           VARCHAR(50),
    country         VARCHAR(50),
    zip_code        VARCHAR(20),
    phone           VARCHAR(20),
    category_id     INT NOT NULL,
    owner_id        BIGINT NOT NULL,
    rating          DECIMAL(2, 1) DEFAULT 0.0,
    review_count    INT DEFAULT 0,
    price_level     TINYINT,                     -- 1-4 ($-$$$$)
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),

    INDEX idx_geohash (geohash),
    INDEX idx_category (category_id),
    INDEX idx_geohash_category (geohash, category_id)
);
```

### 5.2 地理空间索引结构

**选项 A：MySQL/PostgreSQL 中的 Geohash（简单）**

带有 B-tree 索引的 `geohash` 列支持前缀范围扫描：

```sql
-- 在 geohash 单元及其邻居中查找商家
SELECT id, name, lat, lng, rating
FROM businesses
WHERE geohash LIKE '9q8yy%'
   OR geohash LIKE '9q8yz%'
   OR geohash LIKE '9q8yx%'
   -- ... (8 个邻居)
AND is_active = TRUE
AND category_id = 42;
```

**选项 B：Redis 地理空间索引（高性能）**

```
GEOADD businesses:restaurant -122.4194 37.7749 "biz_abc123"
GEOADD businesses:restaurant -122.4089 37.7837 "biz_def456"

GEORADIUS businesses:restaurant -122.4194 37.7749 5 km
  COUNT 20 ASC
```

**选项 C：内存 Geohash HashMap（自定义）**

```
HashMap<String, List<BusinessId>>:
  "9q8yyk" -> [biz_001, biz_002, biz_045, ...]
  "9q8yym" -> [biz_003, biz_017, ...]
  "9q8yys" -> [biz_008, biz_023, biz_099, ...]
```

### 5.3 辅助表

```sql
CREATE TABLE categories (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    name            VARCHAR(100) NOT NULL,
    parent_id       INT,
    icon_url        VARCHAR(500),

    INDEX idx_parent (parent_id)
);

CREATE TABLE reviews (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    business_id     BIGINT NOT NULL,
    user_id         BIGINT NOT NULL,
    rating          TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    content         TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),

    INDEX idx_business (business_id),
    INDEX idx_user (user_id),
    FOREIGN KEY (business_id) REFERENCES businesses(id)
);

CREATE TABLE business_photos (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    business_id     BIGINT NOT NULL,
    url             VARCHAR(500) NOT NULL,
    caption         VARCHAR(255),
    uploaded_at     TIMESTAMP DEFAULT NOW(),

    INDEX idx_business (business_id)
);
```

### 5.4 为什么同时需要 SQL 和地理空间索引？

```
+-------------------------------------------+-------------------------------------------+
|        SQL 数据库 (MySQL/Postgres)         |      地理空间索引 (Redis/内存)              |
+-------------------------------------------+-------------------------------------------+
| 商家数据的真实来源                         | 为空间查询优化                              |
| 复杂查询（连接、聚合）                     | 亚毫秒级附近查找                            |
| 写操作的 ACID 事务                         | 最终一致的副本                              |
| 丰富的商家详情                             | 最少数据（id、纬度、经度、geohash）          |
| 评价、照片、营业时间                       | 完全放入内存                                |
| 低 QPS（写操作）                           | 高 QPS（读操作）                            |
+-------------------------------------------+-------------------------------------------+

流程: SQL 数据库 --(异步同步)--> 地理空间索引
      (写路径)                    (读路径)
```

---

## 6. 详细设计

### 6.1 读路径（搜索流程）

```
 客户端                 LBS                  地理索引          缓存           数据库
   |                      |                      |                  |             |
   |  GET /search/nearby  |                      |                  |             |
   |  lat, lng, radius    |                      |                  |             |
   |--------------------->|                      |                  |             |
   |                      |                      |                  |             |
   |                 [1. 将半径转换              |                  |             |
   |                  为 geohash 精度]           |                  |             |
   |                      |                      |                  |             |
   |                 [2. 计算中心 geohash         |                  |             |
   |                  + 8 个邻居 geohash]         |                  |             |
   |                      |                      |                  |             |
   |                      |  查询 geohash 单元    |                  |             |
   |                      |--------------------->|                  |             |
   |                      |                      |                  |             |
   |                      |  单元中的商家 ID      |                  |             |
   |                      |<---------------------|                  |             |
   |                      |                      |                  |             |
   |                 [3. 后过滤:                 |                  |             |
   |                  精确 haversine 距离]        |                  |             |
   |                      |                      |                  |             |
   |                      |  获取商家详情         |                  |             |
   |                      |------------------------------------>|             |
   |                      |                      |     缓存命中     |             |
   |                      |<------------------------------------|             |
   |                      |                      |                  |             |
   |                      |  (缓存未命中)         |  查询数据库      |             |
   |                      |------------------------------------------------------>|
   |                      |                      |                  |             |
   |                      |<------------------------------------------------------|
   |                      |  [填充缓存]           |                  |             |
   |                      |------------------------------------>|             |
   |                      |                      |                  |             |
   |                 [4. 结果排名:               |                  |             |
   |                  距离 + 评分 + 等]           |                  |             |
   |                      |                      |                  |             |
   |                 [5. 分页并返回]              |                  |             |
   |  JSON 响应           |                      |                  |             |
   |<---------------------|                      |                  |             |
```

#### 逐步分解

**步骤 1：将半径转换为 Geohash 精度**

```python
def radius_to_precision(radius_meters):
    """将搜索半径映射到最优 geohash 精度。"""
    if radius_meters <= 50:
        return 8    # ~38m 单元
    elif radius_meters <= 400:
        return 7    # ~153m 单元
    elif radius_meters <= 2000:
        return 6    # ~1.2km 单元
    elif radius_meters <= 10000:
        return 5    # ~4.9km 单元
    elif radius_meters <= 50000:
        return 4    # ~39km 单元
    else:
        return 3    # ~156km 单元
```

**步骤 2：计算中心 + 邻居 Geohash**

```python
def get_search_geohashes(lat, lng, radius_meters):
    precision = radius_to_precision(radius_meters)
    center_hash = encode_geohash(lat, lng, precision)
    neighbors = get_8_neighbors(center_hash)  # 库函数
    return [center_hash] + neighbors  # 共 9 个 geohash 单元
```

**步骤 3：查询和后过滤**

```python
def search_nearby(lat, lng, radius_meters, category=None):
    geohashes = get_search_geohashes(lat, lng, radius_meters)

    # 从地理空间索引获取候选商家
    candidates = []
    for gh in geohashes:
        business_ids = geo_index.get_businesses_by_geohash(gh)
        candidates.extend(business_ids)

    # 按精确距离后过滤（haversine 公式）
    results = []
    for biz_id in candidates:
        biz = cache.get(biz_id) or db.get(biz_id)
        distance = haversine(lat, lng, biz.lat, biz.lng)
        if distance <= radius_meters:
            if category is None or biz.category == category:
                results.append((biz, distance))

    return results
```

**步骤 4：Haversine 距离公式**

```python
import math

def haversine(lat1, lng1, lat2, lng2):
    """计算地球上两点之间的距离（米）。"""
    R = 6_371_000  # 地球半径（米）

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)

    a = (math.sin(delta_phi / 2) ** 2 +
         math.cos(phi1) * math.cos(phi2) *
         math.sin(delta_lambda / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c  # 距离（米）
```

**步骤 5：结果排名**

```python
def rank_results(results, sort_by='relevance'):
    if sort_by == 'distance':
        return sorted(results, key=lambda x: x[1])  # (商家, 距离)

    if sort_by == 'rating':
        return sorted(results, key=lambda x: -x[0].rating)

    # 默认：相关性分数（加权组合）
    def relevance_score(biz, distance):
        distance_score = 1.0 / (1.0 + distance / 1000)   # 随距离衰减
        rating_score = biz.rating / 5.0                    # 归一化 0-1
        popularity_score = min(biz.review_count / 1000, 1) # 上限 1000 条评价
        recency_score = recency_factor(biz.updated_at)     # 新鲜度

        return (0.35 * distance_score +
                0.30 * rating_score +
                0.20 * popularity_score +
                0.15 * recency_score)

    return sorted(results, key=lambda x: -relevance_score(x[0], x[1]))
```

### 6.2 写路径（商家 CRUD）

```
 所有者             API Gateway        商家服务              数据库           异步 Worker
   |                     |                    |                  |                |
   |  POST /businesses   |                    |                  |                |
   |  {name, lat, lng..} |                    |                  |                |
   |-------------------->|                    |                  |                |
   |                     |  认证 + 校验       |                  |                |
   |                     |------------------->|                  |                |
   |                     |                    |                  |                |
   |                     |               [从 lat/lng            |                |
   |                     |                计算 geohash]          |                |
   |                     |                    |                  |                |
   |                     |                    |  INSERT 商家     |                |
   |                     |                    |----------------->|                |
   |                     |                    |  成功             |                |
   |                     |                    |<-----------------|                |
   |                     |                    |                  |                |
   |                     |                    |  发布事件         |                |
   |                     |                    |  到消息队列       |                |
   |                     |                    |-------------------------------> |
   |                     |                    |                  |                |
   |  201 Created        |                    |                  |    更新        |
   |<--------------------|                    |                  |    地理空间    |
   |                     |                    |                  |    索引        |
   |                     |                    |                  |                |
   |                     |                    |                  |    使缓存      |
   |                     |                    |                  |    失效        |
```

#### 索引重建策略

```
+------------------------------------------------------------------+
|                  索引更新策略                                      |
+------------------------------------------------------------------+
|                                                                  |
|  选项 1：实时（事件驱动）                                         |
|  - 商家写入 -> Kafka 事件 -> 索引更新器                           |
|  - 延迟：秒级                                                    |
|  - 复杂度：中等                                                   |
|  - 适用于：需要接近实时的新鲜度时                                 |
|                                                                  |
|  选项 2：定期批量重建                                             |
|  - Cron 作业每 N 分钟从数据库重建索引                             |
|  - 延迟：分钟级                                                   |
|  - 复杂度：低                                                    |
|  - 适用于：数据不常变化时（我们的情况！）                         |
|                                                                  |
|  选项 3：混合方式                                                 |
|  - 定期完整重建 + 实时增量更新                                    |
|  - 两全其美                                                      |
|  - 复杂度：高                                                    |
|  - 适用于：大规模混合更新模式                                     |
|                                                                  |
|  推荐：选项 1（通过 Kafka 的实时事件）                             |
|  - 简单消费者更新 geohash 索引                                    |
|  - 传播延迟 < 5 秒                                               |
|  - 完整重建作为后备（每日）                                       |
|                                                                  |
+------------------------------------------------------------------+
```

### 6.3 排名

#### 多因素排名系统

```
                    +------------------+
                    |  原始候选项      |
                    |  (来自地理索引)  |
                    +--------+---------+
                             |
                             v
                    +--------+---------+
                    |  距离过滤        |  <-- 精确 haversine
                    |  (在半径内)      |
                    +--------+---------+
                             |
                             v
                    +--------+---------+
                    |  评分引擎        |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
              v              v              v
        +-----+----+  +-----+----+  +------+-----+
        | 距离      |  | 质量     |  | 商家       |
        | 分数      |  | 分数     |  | 加权       |
        | (35%)     |  | (45%)    |  | (20%)      |
        +-----------+  +----------+  +------------+
              |              |              |
              |    +----+    |    +----+    |    +----+
              +--->|    |<---+--->|    |<---+--->|    |
                   +--+-+        +--+-+        +--+-+
                      |             |             |
                      v             v             v
                   +--+-------------+-------------+--+
                   |       加权最终分数                |
                   +----------------+-----------------+
                                    |
                                    v
                           +--------+--------+
                           |  排序和分页      |
                           +-----------------+

距离分数:
  - 反向距离衰减: 1 / (1 + d/1000)
  - 越近 = 分数越高

质量分数:
  - 评分（归一化）:       rating / 5.0         * 0.5
  - 评价数量（对数）:     log(review_count+1)/10 * 0.3
  - 照片数量:             min(photos/10, 1)    * 0.1
  - 回复率:               response_rate         * 0.1

商家加权:
  - 赞助（付费）:         +0.2 加权（标记"广告"）
  - 最近更新:             +0.05 加权
  - 已认领并验证:         +0.05 加权
  - 类别匹配:             +0.1 如果精确类别匹配
```

---

## 7. 缓存策略

### 7.1 缓存架构

```
                  +-------------------------------------------+
                  |              缓存层                        |
                  +-------------------------------------------+
                  |                                           |
                  |  第 1 层: CDN / 边缘缓存                   |
                  |  - 静态资源（照片、图标）                   |
                  |  - 热门搜索结果（按区域）                   |
                  |  - TTL: 5 分钟                             |
                  |                                           |
                  |  第 2 层: 应用缓存 (Redis)                  |
                  |  - 按 ID 的商家详情                         |
                  |  - 按 geohash+类别的搜索结果                |
                  |  - TTL: 15-60 分钟                          |
                  |                                           |
                  |  第 3 层: 地理空间索引（内存）               |
                  |  - Geohash -> 商家 ID 映射                  |
                  |  - 通过事件流更新                           |
                  |  - 始终在内存中（并非真正的"缓存"）          |
                  |                                           |
                  +-------------------------------------------+
```

### 7.2 缓存键设计

```
商家详情缓存:
  键:    "biz:{business_id}"
  值:    商家详情的 JSON 数据
  TTL:   60 分钟
  示例:  "biz:abc123" -> {"name": "Joe's Pizza", ...}

搜索结果缓存:
  键:    "search:{geohash}:{category}:{sort}"
  值:    商家 ID 列表（预排序）
  TTL:   15 分钟
  示例:  "search:9q8yyk:restaurant:distance" -> [id1, id2, id3, ...]

Geohash 单元缓存:
  键:    "geo:{geohash_prefix}"
  值:    该单元中的商家 ID 集合
  TTL:   无（事件驱动的失效）
  示例:  "geo:9q8yyk" -> {id1, id2, id3, ...}
```

### 7.3 缓存失效

```
商家已更新
       |
       v
+------+-------+
| 发布事件      |
| 到 Kafka      |
+------+-------+
       |
       +-------------------+-------------------+
       |                   |                   |
       v                   v                   v
+------+-------+  +--------+------+  +--------+------+
| 使            |  | 更新地理     |  | 使            |
| biz:{id}     |  | 索引条目     |  | search:*      |
| 缓存键失效   |  | (如果位置    |  | 缓存键失效    |
|              |  |  发生变化     |  | 对受影响的    |
|              |  |  则重新计算   |  | geohash 单元  |
|              |  |  geohash)    |  |               |
+--------------+  +---------------+  +---------------+
```

### 7.4 Redis 地理空间命令

Redis 原生支持地理空间索引，可以同时作为地理索引和缓存使用：

```redis
-- 添加带坐标的商家
GEOADD businesses -122.4194 37.7749 "biz_001"
GEOADD businesses -122.4089 37.7837 "biz_002"
GEOADD businesses -122.3940 37.7895 "biz_003"

-- 查找某点 5 km 范围内的商家
GEOSEARCH businesses FROMLONLAT -122.4194 37.7749 BYRADIUS 5 km
  ASC COUNT 20
-- 返回: ["biz_001", "biz_002", "biz_003"]

-- 获取两个商家之间的距离
GEODIST businesses "biz_001" "biz_002" km
-- 返回: "1.2345"

-- 获取商家的 geohash
GEOHASH businesses "biz_001"
-- 返回: ["9q8yyk0000"]

-- 按类别的索引
GEOADD biz:restaurant -122.4194 37.7749 "biz_001"
GEOADD biz:hotel      -122.4089 37.7837 "biz_002"

-- 按类别搜索
GEOSEARCH biz:restaurant FROMLONLAT -122.4194 37.7749 BYRADIUS 2 km ASC
```

---

## 8. 扩展

### 8.1 数据库分片

```
策略: 按 geohash 前缀分片（前 2-3 个字符）

  分片 1: geohash 00-3f  (北美西部)
  分片 2: geohash 40-7f  (北美东部 + 南美)
  分片 3: geohash 80-bf  (欧洲 + 非洲)
  分片 4: geohash c0-ff  (亚洲 + 大洋洲)

  +----------+    +----------+    +----------+    +----------+
  | 分片 1   |    | 分片 2   |    | 分片 3   |    | 分片 4   |
  | 北美西部 |    | 北美东部 |    | 欧洲+非洲|    | 亚洲     |
  | 50M 商家 |    | 30M 商家 |    | 60M 商家 |    | 60M 商家 |
  +----------+    +----------+    +----------+    +----------+

  问题: 分布不均（曼哈顿 vs 撒哈拉沙漠）
  解决方案: 虚拟分片 + 基于 geohash 前缀的一致性哈希
```

### 8.2 处理密集与稀疏区域

```
  曼哈顿（密集）:                蒙大拿农村（稀疏）:

  Geohash "dr5ru" 一个单元中    Geohash "c80" 整个区域
  有 50,000 个商家              只有 5 个商家

  解决方案:                     解决方案:
  - 使用更高精度 (7-8)          - 使用更低精度 (3-4)
  - 更多索引条目                - 更少索引条目
  - 可能需要子分片              - 单次查询覆盖整个区域

  自适应精度算法:

  def get_adaptive_precision(lat, lng, base_precision):
      count = estimate_density(lat, lng, base_precision)
      if count > 10000:
          return base_precision + 1  # 密集区域更精确
      elif count < 10:
          return base_precision - 1  # 稀疏区域更粗略
      return base_precision
```

### 8.3 只读副本架构

```
                     +------------------+
                     |   主数据库       |
                     |   (仅写操作)     |
                     +--------+---------+
                              |
                   复制流      |
                              |
            +-----------------+-----------------+
            |                 |                 |
            v                 v                 v
   +--------+------+  +------+--------+  +-----+---------+
   | 只读副本 1    |  | 只读副本 2    |  | 只读副本 3    |
   | (LBS 查询)   |  | (LBS 查询)   |  | (分析)        |
   +---------------+  +---------------+  +---------------+

   - LBS 从副本读取（不影响写性能）
   - 复制延迟 < 1 秒（对我们的一致性模型可接受）
   - 分析副本用于报表（与生产读取隔离）
```

### 8.4 地理空间索引扩展

```
  选项 A: 复制方式（我们对 200M 商家的选择）

  +----------+    +----------+    +----------+
  | LBS-1    |    | LBS-2    |    | LBS-3    |
  | +------+ |    | +------+ |    | +------+ |
  | |索引  | |    | |索引  | |    | |索引  | |
  | |副本 1| |    | |副本 2| |    | |副本 3| |
  | +------+ |    | +------+ |    | +------+ |
  +----------+    +----------+    +----------+

  每个 LBS 拥有索引的完整副本（~5-10 GB）
  通过 Kafka 消费者独立更新


  选项 B: 分片 Redis 集群（更大规模时）

  +--------------------+
  | Redis 集群         |
  | +------+ +------+  |
  | |分片1 | |分片2 |  |
  | |geo:0*| |geo:4*|  |
  | +------+ +------+  |
  | +------+ +------+  |
  | |分片3 | |分片4 |  |
  | |geo:8*| |geo:c*|  |
  | +------+ +------+  |
  +--------------------+

  按 geohash 前缀分片
  每个分片处理一个地理区域
```

### 8.5 负载均衡考量

```
  方式 1: 轮询（简单，忽略局部性）

  方式 2: 地理感知路由（最优）

  纽约的用户 -----> us-east-1 的 LBS 实例
  东京的用户 ----> ap-northeast-1 的 LBS 实例
  伦敦的用户 ---> eu-west-1 的 LBS 实例

  优势:
  - 更低延迟（更近的服务器）
  - 缓存局部性（同区域用户共享缓存）
  - 减少跨区域数据传输
```

---

## 9. 实时位置更新

### 9.1 静态与移动商家

```
  静态商家 (99%):             移动商家 (1%):
  - 餐厅                     - 餐车
  - 酒店                     - 快闪店
  - 加油站                   - 配送车辆（Uber, DoorDash）
  - 医院                     - 移动摊贩

  静态: 在罕见的位置编辑时更新 geohash
  移动: 高频率的持续位置流
```

### 9.2 实时位置管道（移动对象）

```
  餐车              位置服务              流              索引
  GPS 设备          (WebSocket)         处理器           更新器
      |                     |                      |                  |
      | 每 5 秒 lat/lng     |                      |                  |
      |-------------------->|                      |                  |
      |                     | 发布到 Kafka         |                  |
      |                     |--------------------->|                  |
      |                     |                      |                  |
      |                     |                 [计算新 geohash]        |
      |                     |                 [与旧的比较]            |
      |                     |                      |                  |
      |                     |                 [如果 geohash 变了:]    |
      |                     |                      |  更新索引        |
      |                     |                      |----------------->|
      |                     |                      |                  |
      |                     |                 [如果 geohash 没变:]    |
      |                     |                      |  无操作（跳过）   |
      |                     |                      |                  |

  优化: 仅当 geohash 单元发生变化时才更新索引。
  在同一 geohash 单元内移动的餐车不需要索引更新。

  示例: 在精度 6 下，一个单元约 1.2 km 宽。
  缓慢移动的餐车可能在同一单元中停留 10 分钟以上。
```

### 9.3 地理围栏

```
  定义一个地理边界，当对象进入或离开时触发事件。

  +-------------------------------------------+
  |                                           |
  |     配送区域（多边形）                     |
  |                                           |
  |        +----+                             |
  |        |    |  <-- 餐厅                   |
  |        +----+                             |
  |                    * <-- 司机进入          |
  |                         触发: "司机       |
  |                         接近餐厅"          |
  |                                           |
  +-------------------------------------------+

  使用 geohash 实现:
  1. 预计算与地理围栏多边形重叠的 geohash
  2. 当对象的 geohash 匹配其中任何一个单元时，进行精细的
     点在多边形内检查
  3. 如果在多边形内，触发地理围栏事件

  用途: 当用户在商家附近时发送推送通知
```

---

## 10. 部署架构

### 10.1 多区域部署

```
                          +-------------------+
                          |    全局 DNS       |
                          | (GeoDNS 路由)     |
                          +--------+----------+
                                   |
                 +-----------------+-----------------+
                 |                 |                 |
                 v                 v                 v
        +--------+------+  +------+--------+  +-----+---------+
        |  美国区域     |  |  欧洲区域     |  | 亚太区域      |
        |  us-east-1    |  |  eu-west-1    |  | ap-northeast-1|
        +--------+------+  +------+--------+  +-----+---------+
                 |                 |                 |
           +-----+-----+    +-----+-----+    +-----+-----+
           |           |    |           |    |           |
           v           v    v           v    v           v
      +----+---+  +---+----+---+  +---+----+---+  +---+----+
      |  LBS   |  | 商家   |  |  |  LBS   |  |  |  LBS   |
      | 集群   |  | 服务   |  |  | 集群   |  |  | 集群   |
      +----+---+  +---+----+  |  +---+----+  |  +---+----+
           |           |      |      |        |      |
           v           v      |      v        |      v
      +----+---+  +---+----+  | +---+----+   | +---+----+
      | Redis  |  |  MySQL  |  | | Redis  |   | | Redis  |
      | 集群   |  | 主库    |  | | 集群   |   | | 集群   |
      +--------+  +---+----+  | +--------+   | +--------+
                       |       |              |
                  复制         |         复制
                       |       |              |
                       v       v              v
                  +----+-------+----+   +-----+------+
                  | MySQL 只读       |   | MySQL 只读 |
                  | 副本 (欧洲)      |   | 副本       |
                  +-----------------+   | (亚太)     |
                                        +------------+
```

### 10.2 热门地点的边缘缓存

```
  热门地点检测:

  1. 按 geohash 单元跟踪搜索查询频率
  2. 识别"热门"单元（时代广场、涩谷等）
  3. 为热门单元预热边缘缓存

  缓存预热管道:

  分析         热门单元         CDN 边缘
  系统         检测器           节点
     |               |               |
     | 查询日志      |               |
     |-------------->|               |
     |               |               |
     |          [识别查询量          |
     |           前 1% 的            |
     |           geohash 单元]       |
     |               |               |
     |               | 推送结果      |
     |               | 到边缘缓存   |
     |               |-------------->|
     |               |               |
     |               |          [在边缘 PoP
     |               |           缓存热门
     |               |           单元的搜索
     |               |           结果]
     |               |               |

  结果: 时代广场的搜索从边缘服务 (< 50ms)
  而不是命中 LBS 后端 (< 200ms)
```

---

## 11. 融会贯通 -- 端到端示例

### 用户在旧金山搜索 "pizza near me"

```
步骤 1: 客户端发送请求
  GET /v1/search/nearby?lat=37.7749&lng=-122.4194&radius=2000&category=restaurant

步骤 2: API Gateway 认证、限流、路由到 LBS

步骤 3: LBS 计算 geohash
  中心: encode(37.7749, -122.4194, precision=6) -> "9q8yyk"
  邻居: ["9q8yym", "9q8yyh", "9q8yys", "9q8yye",
          "9q8yy7", "9q8yyt", "9q8yyj", "9q8yyn"]

步骤 4: 查询地理空间索引
  对 9 个 geohash 中的每一个，获取商家 ID:
  "9q8yyk" -> [biz_001, biz_045, biz_089, ...]
  "9q8yym" -> [biz_003, biz_067, ...]
  ... 总候选数: 340 个商家

步骤 5: 按精确距离后过滤
  对每个候选项计算 haversine 距离。
  只保留 2000m 以内的。
  结果: 半径内 187 个商家。

步骤 6: 应用类别过滤
  只筛选餐厅。
  结果: 89 家餐厅。

步骤 7: 从缓存/数据库获取商家详情
  批量获取: MGET biz:biz_001 biz:biz_045 ...
  缓存命中: 72 / 89 (81% 命中率)
  剩余 17: 查询只读副本，然后填充缓存。

步骤 8: 结果排名
  按相关性分数排序 = 0.35*距离 + 0.30*评分 + 0.20*热门度 + 0.15*新鲜度
  排名第一: "Joe's Pizza" (距离=234m, 评分=4.5, 1203 条评价)

步骤 9: 分页并返回
  返回前 20 个结果（第 1 页，共 5 页）。
  总延迟: ~80ms（远低于 200ms SLA）。
```

---

## 12. 常见面试追问

### Q1: 如何处理"边移动边搜索"（实时更新）？

```
方式: 客户端防抖 + 服务端流式传输

1. 客户端每 3-5 秒发送位置更新
2. 防抖: 只有当用户从上次搜索中心移动超过 100m 时才触发搜索
3. Server-sent events (SSE) 或 WebSocket 用于流式传输结果

客户端伪代码:
  let lastSearchCenter = null
  onLocationUpdate(newLocation) {
    if (!lastSearchCenter ||
        distance(lastSearchCenter, newLocation) > 100) {
      lastSearchCenter = newLocation
      fetchNearbyResults(newLocation)
    }
  }

优化: 增量差异
  - 服务端追踪用户上次的结果集
  - 只发送差异（新增/移除的商家）而非完整结果
  - 对于小范围移动显著减少带宽
```

### Q2: 如何实现"驾车距离内的商家"（非直线距离）？

```
问题: Haversine 给出直线距离，而非驾车距离。
       直线 1 km 的商家实际驾车距离可能是 5 km。

分层解决方案:

第 1 层: 用 haversine 快速过滤（宽松半径）
  - 用所需驾车距离的 2 倍作为 haversine 半径搜索
  - 这给出候选项的超集

第 2 层: 驾车距离计算
  - 对每个候选项，调用路由引擎（OSRM, Google Directions）
  - 获取实际驾车距离和预计行程时间
  - 按实际驾车距离/时间过滤

第 3 层: 缓存驾车距离
  - 缓存 (origin_geohash, dest_geohash) -> driving_distance
  - 在 geohash 精度 7 (~153m) 下，缓存复用率很高

  +----------+                +------------+
  | 候选项   | -- haversine   | 路由       |
  | 过滤     |   < 2x 半径    | 引擎       |
  | (快速)   |--------------->| (OSRM)     |
  | 500 商家 |                | 驾车距离   |
  +----------+                +-----+------+
                                    |
                              +-----+------+
                              | 180 商家   |
                              | 10 分钟    |
                              | 驾车范围内 |
                              +------------+
```

### Q3: 如何处理地图上不同的缩放级别？

```
缩放级别直接映射到 geohash 精度:

  缩放 3-5  (大陆)    -> Geohash 精度 1-2 (显示集群)
  缩放 6-8  (国家)    -> Geohash 精度 3   (显示区域)
  缩放 9-11 (城市)    -> Geohash 精度 4   (显示街区)
  缩放 12-14 (区域)   -> Geohash 精度 5-6 (显示单个标记)
  缩放 15+  (街道)    -> Geohash 精度 7+  (显示所有详情)

聚类策略:
  在低缩放级别，将商家聚合为集群:

  缩放 5 (查看加利福尼亚):
  +---------------------------+
  |                           |
  |   [旧金山: 45K]          |
  |                           |
  |        [圣何塞: 28K]     |
  |                           |
  |   [洛杉矶: 72K]         |
  |                           |
  +---------------------------+

  缩放 12 (查看一个街区):
  +---------------------------+
  |  * 披萨店                 |
  |        * 咖啡店           |
  |     * 书店                |
  |  * 健身房                 |
  |            * 银行         |
  +---------------------------+

预计算的集群计数:
  - 对每个精度级别的每个 geohash，存储商家数量
  - "9q" -> 145,000 个商家 (精度 2)
  - "9q8" -> 23,000 个商家 (精度 3)
  - "9q8y" -> 3,200 个商家 (精度 4)
```

### Q4: 如何实现商家推荐？

```
  推荐系统架构:

  +------------------+     +------------------+     +------------------+
  | 用户画像         |     | 协同过滤         |     | 基于内容的       |
  | - 过去的搜索     |     |                  |     | 过滤             |
  | - 过去的访问     |---->| "和你类似的用户  |     | "与你喜欢的      |
  | - 给出的评分     |     |  也喜欢..."      |     |  相似的商家..."  |
  | - 类别           |     +--------+---------+     +--------+---------+
  +------------------+              |                        |
                                    |                        |
                                    v                        v
                           +--------+------------------------+---------+
                           |           推荐混合器                       |
                           |  - 组合协同过滤 + 内容分数                 |
                           |  - 应用位置加权（偏好附近的）              |
                           |  - 应用多样性（避免全是同类型）            |
                           |  - 应用新鲜度（新商家加权）               |
                           +-------------------+-----------------------+
                                               |
                                               v
                                    +----------+---------+
                                    | 个性化             |
                                    | 排名结果           |
                                    +--------------------+

  每个商家的特征向量:
  [类别, 价格等级, 平均评分, 评价数量, 距离,
   菜系类型, 是否有户外座位, 是否提供配送, ...]

  实时信号:
  - 时段（早餐 vs 晚餐餐厅）
  - 星期几（工作日 vs 周末活动）
  - 天气（雨天推荐室内活动）
  - 当前事件（比赛日推荐体育场周边餐厅）
```

### Q5: 如何处理位置精度问题？

```
  问题: GPS 精度从 3m（开阔天空）到 100m+（城市峡谷）不等

  解决方案:

  1. 按精度余量扩大搜索半径
     effective_radius = user_radius + gps_accuracy
     如果用户想要 1km 且 GPS 精度为 50m:
     用 1050m 半径搜索

  2. 位置平滑（针对移动用户）
     - Kalman 滤波器平滑噪声 GPS 读数
     - 拒绝突然跳跃（> 100 km/h 的移动速度）
     - 使用 Wi-Fi / 基站三角定位作为后备

  3. 吸附到已知位置
     - 如果用户在已知地点（办公室、家），使用该坐标
     - 在很多情况下比原始 GPS 更准确

  4. 客户端精度上报
     - 移动操作系统在每次读数中提供精度估计
     - API 接受可选的 "accuracy" 参数
     - 服务端相应调整搜索策略

     GET /v1/search/nearby?lat=37.7749&lng=-122.4194
         &radius=2000&accuracy=50
```

### Q6: Uber 如何查找附近的司机（移动对象）？

```
  与静态商家的关键区别: 司机持续移动。

  架构:

  1. 司机位置摄入（高写入吞吐量）
     - 100 万活跃司机每 3 秒发送 GPS
     - ~333K 写/秒到位置服务
     - 使用 Kafka 进行摄入缓冲

  2. 内存空间索引（不是数据库）
     - 内存中的 Quadtree 或 geohash（更新代价低）
     - 按城市/区域分区
     - 每个分区服务器处理一个地理区域

  3. 匹配流程:
     乘客请求 -> 查找 geohash 单元 -> 获取单元及邻居中的司机
     -> 按距离过滤 -> 按可用性过滤
     -> 按预计到达时间排名 -> 派单给最佳司机

  4. 关键优化:
     - S2 cell 用于可变大小覆盖（城市中小 cell，郊区大 cell）
     - 每个司机的环形缓冲区（最近 30 秒的位置）
     - 如果司机没有跨越单元边界则跳过索引更新
     - 预测性定位（司机 2 分钟后会在哪里？）

  规模对比:
  +------------------+------------------+------------------+
  |                  | Yelp (静态)      | Uber (移动)      |
  +------------------+------------------+------------------+
  | 对象             | 200M 商家        | 5M 司机          |
  | 更新频率         | 极少             | 每 3 秒          |
  | 索引更新/秒      | ~1/s             | ~500K/s          |
  | 搜索 QPS         | ~30K/s           | ~10K/s           |
  | 索引类型         | Geohash (数据库) | Quadtree (内存)  |
  | 一致性           | 最终一致         | 实时             |
  +------------------+------------------+------------------+
```

---

## 13. 总结 -- 面试关键要点

```
+------------------------------------------------------------------------+
|                     面试速查表                                          |
+------------------------------------------------------------------------+
|                                                                        |
|  1. 算法选择                                                           |
|     - Geohash: 最简单，数据库友好，大多数面试中使用                     |
|     - Quadtree: 自适应密度，适合内存索引                                |
|     - S2: Google 级别规模，可变大小 cell，提及可加分                     |
|     - R-tree: PostGIS 默认，多边形查询                                  |
|                                                                        |
|  2. 核心洞察: 2D 空间查询 -> 1D 范围扫描                                |
|     Geohash 将 (lat, lng) 转换为可排序字符串。                          |
|     同一 geohash 单元中的所有商家共享相同前缀。                          |
|     标准 B-tree 索引高效处理前缀范围扫描。                              |
|                                                                        |
|  3. 架构模式                                                           |
|     - 分离读 (LBS) 和写 (商家服务) 路径                                 |
|     - 地理空间索引放入内存（200M 商家 10 GB）                           |
|     - 最终一致性可接受                                                  |
|     - 通过 Kafka 的事件驱动索引更新                                     |
|                                                                        |
|  4. 边界问题                                                           |
|     务必提及: 搜索中心单元 + 8 个邻居。                                 |
|     务必提及: 用 haversine 后过滤获取精确距离。                          |
|                                                                        |
|  5. 缓存优势                                                           |
|     - 空间局部性: 同区域用户命中相同缓存键                              |
|     - 按 geohash 前缀 + 类别缓存                                       |
|     - Redis GEOSEARCH 结合缓存 + 地理索引                               |
|                                                                        |
|  6. 扩展策略                                                           |
|     - 按 geohash 前缀分片数据库（地理分区）                             |
|     - 将完整地理索引复制到每个 LBS 服务器                               |
|     - 使用 GeoDNS 路由的多区域部署                                      |
|     - 密集与稀疏区域的自适应精度                                        |
|                                                                        |
|  7. 需要记住的数字                                                     |
|     - 200M 商家 * 50 字节 = 10 GB 索引（放入 RAM）                      |
|     - Geohash 精度 6 ~ 1.2 km 单元（适合 ~1 km 半径）                   |
|     - 搜索 9 个 geohash 单元（中心 + 8 个邻居）                         |
|     - 用 haversine 公式后过滤候选项                                     |
|     - 目标: < 200ms p99 延迟                                            |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 参考资料

- *System Design Interview* by Alex Xu, 第 13 章: 设计附近搜索服务
- Google S2 Geometry 库: https://s2geometry.io/
- Redis 地理空间命令: https://redis.io/docs/data-types/geospatial/
- Geohash 浏览器: https://geohash.softeng.co/
- Uber H3 六边形层级空间索引: https://h3geo.org/
- PostGIS 文档: https://postgis.net/documentation/
