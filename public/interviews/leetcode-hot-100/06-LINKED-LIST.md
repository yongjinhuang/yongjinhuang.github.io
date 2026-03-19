# Linked List - LeetCode Hot 100

Linked list problems test your ability to manipulate pointers and handle edge cases with null references. The key patterns are **two pointers** (fast/slow), **dummy nodes**, and **in-place reversal**.

---

## Standard Definition

```python
from __future__ import annotations


class ListNode:
    def __init__(self, val: int = 0, next: ListNode | None = None):
        self.val = val
        self.next = next
```

---

## Problem 1. Reverse Linked List (LC #206) - Easy

**Problem**: Given the head of a singly linked list, reverse the list and return the reversed list.
**Pattern**: In-place reversal / Iterative pointer manipulation

### Approach

Walk through the list, flipping each node's `next` pointer to point at the previous node. Track three pointers: `prev`, `curr`, and `next_node`. At each step, save the next node, reverse the current pointer, then advance both `prev` and `curr`.

### Solution

```python
class Solution:
    def reverseList(self, head: ListNode | None) -> ListNode | None:
        prev: ListNode | None = None
        curr = head

        while curr:
            next_node = curr.next
            curr.next = prev
            prev = curr
            curr = next_node

        return prev
```

**Time**: O(n) -- single pass through the list
**Space**: O(1) -- only pointer variables
**Edge Cases**: empty list (return None), single node (return as-is)

---

## Problem 2. Merge Two Sorted Lists (LC #21) - Easy

**Problem**: Merge two sorted linked lists into one sorted list by splicing together the nodes of the two input lists. Return the head of the merged list.
**Pattern**: Dummy node / Two-pointer merge

### Approach

Use a dummy head node to simplify edge cases. Compare the front nodes of both lists, appending the smaller one to the merged list. When one list is exhausted, attach the remainder of the other.

### Solution

```python
class Solution:
    def mergeTwoLists(
        self, list1: ListNode | None, list2: ListNode | None
    ) -> ListNode | None:
        dummy = ListNode()
        tail = dummy

        while list1 and list2:
            if list1.val <= list2.val:
                tail.next = list1
                list1 = list1.next
            else:
                tail.next = list2
                list2 = list2.next
            tail = tail.next

        tail.next = list1 if list1 else list2
        return dummy.next
```

**Time**: O(n + m) where n, m are the lengths of the two lists
**Space**: O(1) -- reuses existing nodes
**Edge Cases**: one or both lists empty, lists of different lengths, duplicate values

---

## Problem 3. Linked List Cycle (LC #141) - Easy

**Problem**: Given the head of a linked list, determine if the list has a cycle. A cycle exists if some node can be reached again by continuously following `next`.
**Pattern**: Fast and slow pointers (Floyd's cycle detection)

### Approach

Use two pointers: `slow` advances one step at a time, `fast` advances two steps. If there is a cycle, the fast pointer will eventually catch the slow pointer. If `fast` reaches the end (None), there is no cycle.

### Solution

```python
class Solution:
    def hasCycle(self, head: ListNode | None) -> bool:
        slow = head
        fast = head

        while fast and fast.next:
            slow = slow.next          # type: ignore[union-attr]
            fast = fast.next.next
            if slow is fast:
                return True

        return False
```

**Time**: O(n) -- fast pointer traverses at most 2n steps
**Space**: O(1) -- two pointers
**Edge Cases**: empty list, single node without cycle, single node pointing to itself

---

## Problem 4. Remove Nth Node From End of List (LC #19) - Medium

**Problem**: Given the head of a linked list, remove the nth node from the end of the list and return the head.
**Pattern**: Two pointers with gap / Dummy node

### Approach

Use two pointers separated by a gap of `n` nodes. Advance the `fast` pointer `n` steps ahead first, then move both pointers together until `fast` reaches the end. At that point, `slow` is right before the node to remove. A dummy node handles the edge case where the head itself is removed.

### Solution

```python
class Solution:
    def removeNthFromEnd(
        self, head: ListNode | None, n: int
    ) -> ListNode | None:
        dummy = ListNode(0, head)
        slow: ListNode | None = dummy
        fast: ListNode | None = dummy

        # Advance fast pointer n + 1 steps ahead
        for _ in range(n + 1):
            if fast:
                fast = fast.next

        # Move both until fast reaches the end
        while fast:
            slow = slow.next  # type: ignore[union-attr]
            fast = fast.next

        # Remove the target node
        slow.next = slow.next.next  # type: ignore[union-attr]

        return dummy.next
```

**Time**: O(n) -- single pass
**Space**: O(1)
**Edge Cases**: removing the head node, list with one element, n equals list length

---

## Problem 5. Reorder List (LC #143) - Medium

**Problem**: Given a singly linked list `L0 -> L1 -> ... -> Ln-1 -> Ln`, reorder it to `L0 -> Ln -> L1 -> Ln-1 -> L2 -> Ln-2 -> ...`. You must modify the list in-place.
**Pattern**: Find middle + Reverse + Merge

### Approach

Three-step process:

1. **Find the middle** using slow/fast pointers.
2. **Reverse** the second half of the list.
3. **Merge** the two halves by alternating nodes.

### Solution

```python
class Solution:
    def reorderList(self, head: ListNode | None) -> None:
        if not head or not head.next:
            return

        # Step 1: Find middle
        slow, fast = head, head
        while fast.next and fast.next.next:
            slow = slow.next  # type: ignore[union-attr]
            fast = fast.next.next

        # Step 2: Reverse second half
        prev: ListNode | None = None
        curr = slow.next  # type: ignore[union-attr]
        slow.next = None   # type: ignore[union-attr]

        while curr:
            next_node = curr.next
            curr.next = prev
            prev = curr
            curr = next_node

        # Step 3: Merge two halves
        first, second = head, prev
        while second:
            tmp1 = first.next   # type: ignore[union-attr]
            tmp2 = second.next
            first.next = second  # type: ignore[union-attr]
            second.next = tmp1
            first = tmp1
            second = tmp2
```

**Time**: O(n) -- three O(n) passes
**Space**: O(1) -- in-place manipulation
**Edge Cases**: empty list, single node, two nodes, odd vs even length lists

---

## Problem 6. Add Two Numbers (LC #2) - Medium

**Problem**: Two non-empty linked lists represent non-negative integers in reverse order (each node is a single digit). Add the two numbers and return the sum as a linked list in the same reverse-digit format.
**Pattern**: Digit-by-digit simulation with carry

### Approach

Traverse both lists simultaneously, adding corresponding digits plus any carry from the previous step. Create new nodes for each digit of the result. Continue until both lists are exhausted and carry is zero.

### Solution

```python
class Solution:
    def addTwoNumbers(
        self, l1: ListNode | None, l2: ListNode | None
    ) -> ListNode | None:
        dummy = ListNode()
        curr = dummy
        carry = 0

        while l1 or l2 or carry:
            val1 = l1.val if l1 else 0
            val2 = l2.val if l2 else 0

            total = val1 + val2 + carry
            carry = total // 10

            curr.next = ListNode(total % 10)
            curr = curr.next

            l1 = l1.next if l1 else None
            l2 = l2.next if l2 else None

        return dummy.next
```

**Time**: O(max(n, m)) where n, m are the list lengths
**Space**: O(max(n, m)) for the result list
**Edge Cases**: different length lists, carry propagation (e.g., 999 + 1), single digit inputs

---

## Problem 7. Copy List with Random Pointer (LC #138) - Medium

**Problem**: A linked list has nodes with an additional `random` pointer that can point to any node in the list or null. Construct a deep copy of the list.
**Pattern**: Hash map cloning

### Approach

Use a dictionary mapping each original node to its copy. First pass: create all copy nodes. Second pass: wire up `next` and `random` pointers using the map. Alternatively, interleave copies between originals to achieve O(1) space.

### Solution

```python
class Node:
    def __init__(
        self,
        x: int,
        next: Node | None = None,
        random: Node | None = None,
    ):
        self.val = x
        self.next = next
        self.random = random


class Solution:
    def copyRandomList(self, head: Node | None) -> Node | None:
        if not head:
            return None

        # Map original nodes to their copies
        copies: dict[Node, Node] = {}

        curr = head
        while curr:
            copies[curr] = Node(curr.val)
            curr = curr.next

        # Wire up next and random pointers
        curr = head
        while curr:
            copy = copies[curr]
            copy.next = copies.get(curr.next)       # type: ignore[arg-type]
            copy.random = copies.get(curr.random)    # type: ignore[arg-type]
            curr = curr.next

        return copies[head]
```

**Time**: O(n) -- two passes
**Space**: O(n) -- hash map of copies
**Edge Cases**: empty list, all random pointers are None, random pointer points to self, random pointer points to head/tail

---

## Problem 8. Merge K Sorted Lists (LC #23) - Hard

**Problem**: Given an array of `k` linked lists, each sorted in ascending order, merge all lists into one sorted linked list and return it.
**Pattern**: Divide and conquer / Min-heap

### Approach

**Divide and conquer**: recursively merge pairs of lists, halving the number of lists each round. This reuses the merge-two-lists logic and achieves optimal time complexity without needing a heap.

Alternative: push all heads into a min-heap and repeatedly extract the smallest, advancing that list's pointer.

### Solution

```python
class Solution:
    def mergeKLists(
        self, lists: list[ListNode | None]
    ) -> ListNode | None:
        if not lists:
            return None

        while len(lists) > 1:
            merged: list[ListNode | None] = []
            for i in range(0, len(lists), 2):
                l1 = lists[i]
                l2 = lists[i + 1] if i + 1 < len(lists) else None
                merged.append(self._merge_two(l1, l2))
            lists = merged

        return lists[0]

    def _merge_two(
        self, l1: ListNode | None, l2: ListNode | None
    ) -> ListNode | None:
        dummy = ListNode()
        tail = dummy

        while l1 and l2:
            if l1.val <= l2.val:
                tail.next = l1
                l1 = l1.next
            else:
                tail.next = l2
                l2 = l2.next
            tail = tail.next

        tail.next = l1 if l1 else l2
        return dummy.next
```

### Alternative: Heap-Based Solution

```python
import heapq


class Solution:
    def mergeKLists(
        self, lists: list[ListNode | None]
    ) -> ListNode | None:
        dummy = ListNode()
        tail = dummy

        heap: list[tuple[int, int, ListNode]] = []
        for idx, node in enumerate(lists):
            if node:
                heapq.heappush(heap, (node.val, idx, node))

        while heap:
            val, idx, node = heapq.heappop(heap)
            tail.next = node
            tail = tail.next
            if node.next:
                heapq.heappush(heap, (node.next.val, idx, node.next))

        return dummy.next
```

**Time**: O(n log k) -- n is total nodes, k is number of lists
**Space**: O(k) for the heap, O(log k) for divide-and-conquer recursion stack
**Edge Cases**: empty input list, lists containing empty lists, all lists have one element, k = 1

---

## Problem 9. LRU Cache (LC #146) - Medium

**Problem**: Design a data structure that follows the Least Recently Used (LRU) cache eviction policy. Implement `get(key)` and `put(key, value)` in O(1) time.
**Pattern**: Hash map + Doubly linked list

### Approach

Combine a dictionary for O(1) key lookup with a doubly linked list for O(1) insertion/removal and ordering. The list tracks usage order: most recently used at the tail, least recently used at the head. On every `get` or `put`, move the accessed node to the tail. On capacity overflow, evict the node at the head.

### Solution

```python
class DLLNode:
    """Doubly linked list node for the LRU cache."""

    __slots__ = ("key", "val", "prev", "next")

    def __init__(self, key: int = 0, val: int = 0):
        self.key = key
        self.val = val
        self.prev: DLLNode | None = None
        self.next: DLLNode | None = None


class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache: dict[int, DLLNode] = {}

        # Sentinel head and tail to avoid null checks
        self.head = DLLNode()
        self.tail = DLLNode()
        self.head.next = self.tail
        self.tail.prev = self.head

    def get(self, key: int) -> int:
        if key not in self.cache:
            return -1

        node = self.cache[key]
        self._move_to_tail(node)
        return node.val

    def put(self, key: int, value: int) -> None:
        if key in self.cache:
            node = self.cache[key]
            node.val = value
            self._move_to_tail(node)
            return

        new_node = DLLNode(key, value)
        self.cache[key] = new_node
        self._add_before_tail(new_node)

        if len(self.cache) > self.capacity:
            lru = self.head.next
            assert lru is not None and lru is not self.tail
            self._remove(lru)
            del self.cache[lru.key]

    def _add_before_tail(self, node: DLLNode) -> None:
        prev = self.tail.prev
        assert prev is not None
        prev.next = node
        node.prev = prev
        node.next = self.tail
        self.tail.prev = node

    def _remove(self, node: DLLNode) -> None:
        assert node.prev is not None and node.next is not None
        node.prev.next = node.next
        node.next.prev = node.prev

    def _move_to_tail(self, node: DLLNode) -> None:
        self._remove(node)
        self._add_before_tail(node)
```

**Time**: O(1) for both `get` and `put`
**Space**: O(capacity) for the hash map and linked list
**Edge Cases**: capacity of 1, updating an existing key, get on non-existent key, eviction order correctness

---

## Pattern Summary

| Pattern                | Problems          | Key Idea                            |
| ---------------------- | ----------------- | ----------------------------------- |
| Fast/Slow Pointers     | #141, #143        | Detect cycles, find midpoints       |
| Dummy Node             | #21, #19, #2, #23 | Simplify head-insertion edge cases  |
| In-Place Reversal      | #206, #143        | Reverse by flipping `next` pointers |
| Hash Map + Linked List | #138, #146        | O(1) lookup with ordered structure  |
| Divide and Conquer     | #23               | Merge pairs to reduce k lists       |
| Carry Simulation       | #2                | Digit-by-digit arithmetic           |
