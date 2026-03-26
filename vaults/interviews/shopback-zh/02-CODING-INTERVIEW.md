# 第二轮：技术评估 - 实时编程

## 形式

- **时长**：1 小时，HackerRank（实时，有面试官）
- **难度**：LeetCode 简单到中等（评级 2.8-3.0/5.0）
- **语言**：自选（推荐 TypeScript/JavaScript，与 ShopBack 技术栈一致）
- **方式**：边解题边解释思路

## 面试策略

### 时间管理（60 分钟）

```
0-5 分钟   → 阅读题目，提出澄清问题
5-10 分钟  → 与面试官讨论解题思路
10-40 分钟 → 实现解决方案
40-50 分钟 → 用边界情况测试
50-60 分钟 → 如有需要进行优化，讨论复杂度
```

### 沟通技巧

- **边想边说**：编码时解释你的推理过程
- **提出澄清问题**：输入规模？边界情况？可以用内置方法吗？
- **从简单开始**：先暴力解法，再优化
- **测试代码**：逐行走查示例

---

## ShopBack 历年真题

### 1. O(1) 时间插入、删除和获取随机元素

**题目**：设计一个支持 `insert`、`remove` 和 `getRandom` 均为 O(1) 的数据结构。

```typescript
class RandomizedSet {
  private map: Map<number, number>; // 值 -> 索引
  private list: number[];

  constructor() {
    this.map = new Map();
    this.list = [];
  }

  insert(val: number): boolean {
    if (this.map.has(val)) return false;
    this.map.set(val, this.list.length);
    this.list.push(val);
    return true;
  }

  remove(val: number): boolean {
    if (!this.map.has(val)) return false;
    const idx = this.map.get(val)!;
    const last = this.list[this.list.length - 1];
    // 与最后一个元素交换
    this.list[idx] = last;
    this.map.set(last, idx);
    // 移除最后一个元素
    this.list.pop();
    this.map.delete(val);
    return true;
  }

  getRandom(): number {
    const idx = Math.floor(Math.random() * this.list.length);
    return this.list[idx];
  }
}
```

**关键思路**：使用数组 + 哈希表组合。与末尾交换的技巧实现 O(1) 删除。

**LeetCode**：[380. O(1) 时间插入、删除和获取随机元素](https://leetcode.com/problems/insert-delete-getrandom-o1/)

---

### 2. 打乱数组

**题目**：给定一个整数数组，实现 `reset`（返回原始数组）和 `shuffle`（随机排列）。

```typescript
class Solution {
  private original: number[];

  constructor(nums: number[]) {
    this.original = [...nums];
  }

  reset(): number[] {
    return [...this.original];
  }

  shuffle(): number[] {
    const arr = [...this.original];
    // Fisher-Yates 洗牌算法
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
```

**关键思路**：Fisher-Yates 洗牌算法保证 O(n) 时间内均匀随机排列。

**LeetCode**：[384. 打乱数组](https://leetcode.com/problems/shuffle-an-array/)

---

### 3. 交换数组元素使两数组之和相等

**题目**：给定两个整数数组，交换元素使两个数组之和相等。返回最小交换次数。

```typescript
function minSwaps(arr1: number[], arr2: number[]): number {
  const sum1 = arr1.reduce((a, b) => a + b, 0);
  const sum2 = arr2.reduce((a, b) => a + b, 0);
  const totalSum = sum1 + sum2;

  // 总和必须是偶数才能平均分配
  if (totalSum % 2 !== 0) return -1;

  const target = totalSum / 2;
  let diff = sum1 - target; // arr1 需要减少的量

  if (diff === 0) return 0;

  // 对于每次可能的交换（arr1 中的 a，arr2 中的 b）：
  // new_sum1 = sum1 - a + b，所以变化量 = a - b
  // 我们需要变化量 = diff，即 a - b = diff

  const set2 = new Set(arr2);
  // 排序 arr1 以优先尝试最大差值
  const sorted1 = [...arr1].sort((a, b) => b - a);

  let swaps = 0;
  for (const a of sorted1) {
    if (diff === 0) break;
    const needed_b = a - diff;
    if (set2.has(needed_b)) {
      set2.delete(needed_b);
      diff -= a - needed_b;
      swaps++;
    }
  }

  return diff === 0 ? swaps : -1;
}
```

---

### 4. 最大利润

**题目**：给定数量和价格数组，返回最大利润。

```typescript
function maxProfit(prices: number[]): number {
  let minPrice = Infinity;
  let maxProfit = 0;

  for (const price of prices) {
    minPrice = Math.min(minPrice, price);
    maxProfit = Math.max(maxProfit, price - minPrice);
  }

  return maxProfit;
}
```

**LeetCode**：[121. 买卖股票的最佳时机](https://leetcode.com/problems/best-time-to-buy-and-sell-stock/)

---

## 高优先级复习模式

基于历年真题和电商领域的相关性：

### 模式 1：哈希表（最常见）

```typescript
// 两数之和 - 经典哈希表模式
function twoSum(nums: number[], target: number): number[] {
  const seen = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (seen.has(complement)) {
      return [seen.get(complement)!, i];
    }
    seen.set(nums[i], i);
  }
  return [];
}
```

**练习**：LeetCode 1, 49, 128, 380, 347

### 模式 2：数组与排序

```typescript
// 合并区间 - 在排期/优惠系统中常见
function merge(intervals: number[][]): number[][] {
  intervals.sort((a, b) => a[0] - b[0]);
  const result: number[][] = [intervals[0]];

  for (let i = 1; i < intervals.length; i++) {
    const last = result[result.length - 1];
    if (intervals[i][0] <= last[1]) {
      last[1] = Math.max(last[1], intervals[i][1]);
    } else {
      result.push(intervals[i]);
    }
  }

  return result;
}
```

**练习**：LeetCode 56, 57, 435, 452

### 模式 3：滑动窗口

```typescript
// 大小为 k 的最大子数组和
function maxSumSubarray(arr: number[], k: number): number {
  let windowSum = 0;
  let maxSum = -Infinity;

  for (let i = 0; i < arr.length; i++) {
    windowSum += arr[i];
    if (i >= k - 1) {
      maxSum = Math.max(maxSum, windowSum);
      windowSum -= arr[i - k + 1];
    }
  }

  return maxSum;
}
```

**练习**：LeetCode 3, 76, 239, 567

### 模式 4：贪心算法

```typescript
// 活动选择（相关：优惠/促销排期）
function maxActivities(start: number[], end: number[]): number {
  const activities = start
    .map((s, i) => ({ start: s, end: end[i] }))
    .sort((a, b) => a.end - b.end);

  let count = 1;
  let lastEnd = activities[0].end;

  for (let i = 1; i < activities.length; i++) {
    if (activities[i].start >= lastEnd) {
      count++;
      lastEnd = activities[i].end;
    }
  }

  return count;
}
```

**练习**：LeetCode 55, 45, 134, 763

### 模式 5：字符串操作

```typescript
// 字母异位词分组
function groupAnagrams(strs: string[]): string[][] {
  const map = new Map<string, string[]>();

  for (const s of strs) {
    const key = [...s].sort().join('');
    const group = map.get(key) || [];
    map.set(key, [...group, s]);
  }

  return [...map.values()];
}
```

**练习**：LeetCode 49, 242, 5, 647

---

## 电商领域相关题目

鉴于 ShopBack 的业务，可能出现以下题目：

### 阶梯式返现计算

```typescript
interface CashbackTier {
  minSpend: number;
  rate: number; // 百分比
}

function calculateCashback(amount: number, tiers: CashbackTier[]): number {
  // 按最低消费降序排列，找到最高适用档位
  const sorted = [...tiers].sort((a, b) => b.minSpend - a.minSpend);
  const tier = sorted.find((t) => amount >= t.minSpend);
  return tier ? amount * (tier.rate / 100) : 0;
}

// 示例：
// tiers = [{minSpend: 0, rate: 1}, {minSpend: 50, rate: 2}, {minSpend: 100, rate: 5}]
// calculateCashback(120, tiers) → 6.0（120 的 5%）
```

### 最佳优惠选择（背包问题变体）

```typescript
// 给定预算和优惠（成本、返现），最大化总返现
function bestDeals(
  budget: number,
  costs: number[],
  cashbacks: number[]
): number {
  const n = costs.length;
  const dp = new Array(budget + 1).fill(0);

  for (let i = 0; i < n; i++) {
    for (let w = budget; w >= costs[i]; w--) {
      dp[w] = Math.max(dp[w], dp[w - costs[i]] + cashbacks[i]);
    }
  }

  return dp[budget];
}
```

---

## LeetCode 练习清单（按优先级排序）

### 必做（前 15 题）

1. 两数之和（#1）
2. 买卖股票的最佳时机（#121）
3. 存在重复元素（#217）
4. 字母异位词分组（#49）
5. 前 K 个高频元素（#347）
6. O(1) 时间插入、删除和获取随机元素（#380）
7. 合并区间（#56）
8. 三数之和（#15）
9. 无重复字符的最长子串（#3）
10. 有效的括号（#20）
11. 除自身以外数组的乘积（#238）
12. 最大子数组和（#53）
13. 打乱数组（#384）
14. LRU 缓存（#146）
15. 跳跃游戏（#55）

### 应做（接下来 10 题）

16. 零钱兑换（#322）
17. 单词拆分（#139）
18. 子集（#78）
19. 电话号码的字母组合（#17）
20. 搜索旋转排序数组（#33）
21. 寻找旋转排序数组中的最小值（#153）
22. 最长回文子串（#5）
23. 盛最多水的容器（#11）
24. 任务调度器（#621）
25. 设计哈希映射（#706）

---

## HackerRank 环境提示

- **熟悉环境**：创建一个免费的 HackerRank 账号并在他们的 IDE 中练习
- **自动补全**：HackerRank 有基本的自动补全，但没有 VS Code 级别的 IntelliSense
- **测试用例**：提交前可以添加自定义测试用例
- **标准输入/输出**：部分题目使用标准输入/输出格式（非函数签名）
- **时间限制**：通常比较宽松，但 n > 1000 时避免 O(n³) 解法

## 常见错误提醒

1. **过快开始写代码** - 先花 5-10 分钟讨论思路
2. **不处理边界情况** - 空数组、单个元素、负数
3. **差一错误** - 仔细检查循环边界
4. **忘记返回** - 尤其在递归解法中
5. **不测试** - 提交前至少走查 2 个示例
6. **过度工程化** - 从最简单的正确解法开始
