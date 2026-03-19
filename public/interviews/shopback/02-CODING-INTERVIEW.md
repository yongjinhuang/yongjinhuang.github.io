# Round 2: Technical Assessment - Live Coding

## Format

- **Duration**: 1 hour on HackerRank (live, with interviewer)
- **Difficulty**: LeetCode Easy to Medium (rated 2.8-3.0/5.0)
- **Language**: Your choice (TypeScript/JavaScript recommended given ShopBack's stack)
- **Style**: Solve problems while explaining your thought process

## Strategy for the Interview

### Time Management (60 minutes)

```
0-5 min   → Read problem, ask clarifying questions
5-10 min  → Discuss approach with interviewer
10-40 min → Implement solution
40-50 min → Test with edge cases
50-60 min → Optimize if needed, discuss complexity
```

### Communication Tips

- **Think aloud**: Explain your reasoning as you code
- **Ask clarifications**: Input size? Edge cases? Can I use built-in methods?
- **Start simple**: Brute force first, then optimize
- **Test your code**: Walk through examples line by line

---

## Reported Questions from ShopBack

### 1. Insert Delete GetRandom O(1)

**Problem**: Design a data structure supporting `insert`, `remove`, and `getRandom` all in O(1).

```typescript
class RandomizedSet {
  private map: Map<number, number>; // value -> index
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
    // Swap with last element
    this.list[idx] = last;
    this.map.set(last, idx);
    // Remove last
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

**Key Insight**: Use array + hash map combo. Swap-with-last trick enables O(1) removal.

**LeetCode**: [380. Insert Delete GetRandom O(1)](https://leetcode.com/problems/insert-delete-getrandom-o1/)

---

### 2. Shuffle an Array

**Problem**: Given an integer array, implement `reset` (return original) and `shuffle` (random permutation).

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
    // Fisher-Yates shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
```

**Key Insight**: Fisher-Yates shuffle guarantees uniform random permutation in O(n).

**LeetCode**: [384. Shuffle an Array](https://leetcode.com/problems/shuffle-an-array/)

---

### 3. Swap Arrays to Equalize Sums

**Problem**: Given two integer arrays, swap elements between them to make both sums equal. Return the minimum swap count.

```typescript
function minSwaps(arr1: number[], arr2: number[]): number {
  const sum1 = arr1.reduce((a, b) => a + b, 0);
  const sum2 = arr2.reduce((a, b) => a + b, 0);
  const totalSum = sum1 + sum2;

  // Total must be even to split equally
  if (totalSum % 2 !== 0) return -1;

  const target = totalSum / 2;
  let diff = sum1 - target; // How much arr1 needs to lose

  if (diff === 0) return 0;

  // For each possible swap (a from arr1, b from arr2):
  // new_sum1 = sum1 - a + b, so change = a - b
  // We need change = diff, so a - b = diff

  const set2 = new Set(arr2);
  // Sort arr1 to try largest differences first
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

### 4. Maximum Profit

**Problem**: Given quantity and price arrays, return maximum profit.

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

**LeetCode**: [121. Best Time to Buy and Sell Stock](https://leetcode.com/problems/best-time-to-buy-and-sell-stock/)

---

## High-Priority Patterns to Review

Based on reported questions and e-commerce domain relevance:

### Pattern 1: Hash Maps (Most Common)

```typescript
// Two Sum - classic hash map pattern
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

**Practice**: LeetCode 1, 49, 128, 380, 347

### Pattern 2: Arrays & Sorting

```typescript
// Merge Intervals - common in scheduling/deals systems
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

**Practice**: LeetCode 56, 57, 435, 452

### Pattern 3: Sliding Window

```typescript
// Max subarray sum of size k
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

**Practice**: LeetCode 3, 76, 239, 567

### Pattern 4: Greedy Algorithms

```typescript
// Activity Selection (relevant: scheduling deals/promotions)
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

**Practice**: LeetCode 55, 45, 134, 763

### Pattern 5: String Manipulation

```typescript
// Group Anagrams
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

**Practice**: LeetCode 49, 242, 5, 647

---

## E-Commerce Domain Problems

These might appear given ShopBack's business:

### Calculate Cashback with Tiered Rates

```typescript
interface CashbackTier {
  minSpend: number;
  rate: number; // percentage
}

function calculateCashback(amount: number, tiers: CashbackTier[]): number {
  // Sort tiers by minSpend descending to find highest applicable tier
  const sorted = [...tiers].sort((a, b) => b.minSpend - a.minSpend);
  const tier = sorted.find((t) => amount >= t.minSpend);
  return tier ? amount * (tier.rate / 100) : 0;
}

// Example:
// tiers = [{minSpend: 0, rate: 1}, {minSpend: 50, rate: 2}, {minSpend: 100, rate: 5}]
// calculateCashback(120, tiers) → 6.0 (5% of 120)
```

### Best Deals Selection (Knapsack Variant)

```typescript
// Given budget and deals with (cost, cashback), maximize total cashback
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

## LeetCode Practice List (Priority Order)

### Must Do (Top 15)

1. Two Sum (#1)
2. Best Time to Buy and Sell Stock (#121)
3. Contains Duplicate (#217)
4. Group Anagrams (#49)
5. Top K Frequent Elements (#347)
6. Insert Delete GetRandom O(1) (#380)
7. Merge Intervals (#56)
8. 3Sum (#15)
9. Longest Substring Without Repeating Characters (#3)
10. Valid Parentheses (#20)
11. Product of Array Except Self (#238)
12. Maximum Subarray (#53)
13. Shuffle an Array (#384)
14. LRU Cache (#146)
15. Jump Game (#55)

### Should Do (Next 10)

16. Coin Change (#322)
17. Word Break (#139)
18. Subsets (#78)
19. Letter Combinations of Phone Number (#17)
20. Search in Rotated Sorted Array (#33)
21. Find Minimum in Rotated Sorted Array (#153)
22. Longest Palindromic Substring (#5)
23. Container With Most Water (#11)
24. Task Scheduler (#621)
25. Design HashMap (#706)

---

## HackerRank Environment Tips

- **Familiarize yourself**: Create a free HackerRank account and practice in their IDE
- **Auto-complete**: HackerRank has basic autocomplete but no VS Code-level IntelliSense
- **Test cases**: You can add custom test cases before submitting
- **Stdin/Stdout**: Some problems use stdin/stdout format (not function signatures)
- **Time limits**: Usually generous, but avoid O(n³) solutions for n > 1000

## Common Mistakes to Avoid

1. **Jumping to code too fast** - Spend 5-10 min discussing approach first
2. **Not handling edge cases** - Empty arrays, single elements, negative numbers
3. **Off-by-one errors** - Double-check loop boundaries
4. **Forgetting to return** - Especially in recursive solutions
5. **Not testing** - Walk through at least 2 examples before submitting
6. **Over-engineering** - Start with the simplest correct solution
