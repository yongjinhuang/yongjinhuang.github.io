# Linked Lists

Linked lists test your ability to manipulate pointers and handle edge cases. The key techniques
are the dummy node trick, fast-slow pointers (Floyd's algorithm), and in-place reversal.
Mastering these three patterns covers the vast majority of linked list interview problems.

---

## 1. Core Concepts

### 1.1 Singly Linked List

Each node stores a value and a pointer to the next node. The last node points to `None`.

```python
class ListNode:
    def __init__(self, val: int = 0, next: 'ListNode | None' = None):
        self.val = val
        self.next = next
```

**Properties:**
- Access by index: O(n)
- Insert/delete at head: O(1)
- Insert/delete at arbitrary position: O(n) to find, O(1) to splice
- No random access (unlike arrays)

### 1.2 Doubly Linked List

Each node stores pointers to both next and previous nodes. Useful when you need to remove a
node in O(1) given a direct reference (e.g., LRU cache).

```python
class DListNode:
    def __init__(self, key: int = 0, val: int = 0):
        self.key = key
        self.val = val
        self.prev = None
        self.next = None
```

### 1.3 Dummy Node Technique

A dummy (sentinel) node simplifies edge cases by eliminating special handling for the head.
Create a dummy node before the head, build the result after it, and return `dummy.next`.

```python
def build_list_example(values):
    dummy = ListNode(0)
    current = dummy
    for val in values:
        current.next = ListNode(val)
        current = current.next
    return dummy.next
```

**When to use:** Whenever the head might change (merge, remove, partition operations).

### 1.4 Fast-Slow Pointers (Floyd's Algorithm)

Two pointers move at different speeds. The fast pointer moves 2 steps per iteration; the
slow pointer moves 1 step.

**Applications:**
- Find the middle of a list
- Detect cycles
- Find the start of a cycle

---

## 2. Classic Problems

### 2.1 Reverse Linked List

**Problem:** Reverse a singly linked list.

**Approach (iterative):** Maintain three pointers: `prev`, `curr`, `next_node`. At each step,
reverse the `curr.next` pointer and advance all three.

```python
def reverse_list(head: ListNode | None) -> ListNode | None:
    """
    Reverse a singly linked list iteratively.

    Time:  O(n) -- single pass
    Space: O(1) -- three pointers
    """
    prev = None
    curr = head

    while curr:
        next_node = curr.next  # save next
        curr.next = prev       # reverse pointer
        prev = curr            # advance prev
        curr = next_node       # advance curr

    return prev
```

**Approach (recursive):**

```python
def reverse_list_recursive(head: ListNode | None) -> ListNode | None:
    """
    Reverse a singly linked list recursively.

    Time:  O(n)
    Space: O(n) -- call stack
    """
    if not head or not head.next:
        return head

    new_head = reverse_list_recursive(head.next)
    head.next.next = head  # reverse the pointer
    head.next = None       # prevent cycle
    return new_head
```

---

### 2.2 Detect Cycle (Floyd's Cycle Detection)

**Problem:** Determine if a linked list has a cycle.

**Approach:** Fast pointer moves 2 steps, slow pointer moves 1 step. If they meet, there
is a cycle. If fast reaches `None`, there is no cycle.

```python
def has_cycle(head: ListNode | None) -> bool:
    """
    Detect if a linked list has a cycle.

    Time:  O(n) -- fast pointer traverses at most 2n steps
    Space: O(1)
    """
    slow = fast = head

    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            return True

    return False
```

### 2.3 Find Cycle Start

**Problem:** If a cycle exists, find the node where the cycle begins.

**Approach:** After detecting the meeting point, reset one pointer to head. Move both at
speed 1. They meet at the cycle start.

**Why it works:** Let `a` = distance from head to cycle start, `b` = distance from cycle start
to meeting point, `c` = cycle length. At meeting: slow traveled `a + b`, fast traveled
`a + b + nc` for some integer n. Since fast = 2 * slow: `a + b + nc = 2(a + b)`, so
`a = nc - b`. Moving `a` steps from meeting point lands at cycle start.

```python
def detect_cycle(head: ListNode | None) -> ListNode | None:
    """
    Find the node where the cycle begins, or None if no cycle.

    Time:  O(n)
    Space: O(1)
    """
    slow = fast = head

    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            # Cycle detected: find the start
            pointer = head
            while pointer is not slow:
                pointer = pointer.next
                slow = slow.next
            return pointer

    return None
```

---

### 2.4 Merge Two Sorted Lists

**Problem:** Merge two sorted linked lists into one sorted list.

**Approach:** Use a dummy node. Compare the heads of both lists and append the smaller one.

```python
def merge_two_lists(
    list1: ListNode | None,
    list2: ListNode | None
) -> ListNode | None:
    """
    Merge two sorted linked lists.

    Time:  O(n + m) where n, m are the lengths
    Space: O(1) -- reusing existing nodes
    """
    dummy = ListNode(0)
    current = dummy

    while list1 and list2:
        if list1.val <= list2.val:
            current.next = list1
            list1 = list1.next
        else:
            current.next = list2
            list2 = list2.next
        current = current.next

    # Attach the remaining nodes
    current.next = list1 if list1 else list2

    return dummy.next
```

---

### 2.5 Remove Nth Node From End

**Problem:** Remove the nth node from the end of the list in one pass.

**Approach:** Use two pointers with a gap of `n` between them. When the fast pointer reaches
the end, the slow pointer is just before the node to remove.

```python
def remove_nth_from_end(head: ListNode | None, n: int) -> ListNode | None:
    """
    Remove the nth node from the end of the list.

    Time:  O(L) where L is the list length -- single pass
    Space: O(1)
    """
    dummy = ListNode(0, head)
    fast = slow = dummy

    # Advance fast by n+1 steps so there's a gap of n between slow and fast
    for _ in range(n + 1):
        fast = fast.next

    # Move both until fast reaches the end
    while fast:
        slow = slow.next
        fast = fast.next

    # slow.next is the node to remove
    slow.next = slow.next.next

    return dummy.next
```

**Why dummy node?** Without it, removing the head node requires special handling.

---

### 2.6 Reorder List

**Problem:** Given `L0 -> L1 -> ... -> Ln`, reorder to `L0 -> Ln -> L1 -> Ln-1 -> ...`.

**Approach:** Three steps:
1. Find the middle using fast-slow pointers
2. Reverse the second half
3. Merge the two halves alternately

```python
def reorder_list(head: ListNode | None) -> None:
    """
    Reorder list in-place: L0->Ln->L1->Ln-1->...

    Time:  O(n)
    Space: O(1)
    """
    if not head or not head.next:
        return

    # Step 1: Find middle
    slow = fast = head
    while fast.next and fast.next.next:
        slow = slow.next
        fast = fast.next.next

    # Step 2: Reverse second half
    second = slow.next
    slow.next = None  # cut the list
    prev = None
    while second:
        next_node = second.next
        second.next = prev
        prev = second
        second = next_node
    second = prev

    # Step 3: Merge alternately
    first = head
    while second:
        tmp1, tmp2 = first.next, second.next
        first.next = second
        second.next = tmp1
        first = tmp1
        second = tmp2
```

---

### 2.7 LRU Cache

**Problem:** Design a data structure that follows Least Recently Used (LRU) eviction.
`get(key)` and `put(key, value)` must both run in O(1).

**Approach:** Combine a hash map (O(1) lookup) with a doubly linked list (O(1) removal and
insertion). The most recently used item goes to the front; evict from the back.

```python
class LRUCache:
    """
    Least Recently Used Cache.

    get:  O(1) time
    put:  O(1) time
    Space: O(capacity)
    """

    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = {}  # key -> DListNode

        # Dummy head and tail for easy insertion/removal
        self.head = DListNode()
        self.tail = DListNode()
        self.head.next = self.tail
        self.tail.prev = self.head

    def _remove(self, node: DListNode) -> None:
        """Remove a node from the doubly linked list."""
        node.prev.next = node.next
        node.next.prev = node.prev

    def _add_to_front(self, node: DListNode) -> None:
        """Add a node right after the dummy head (most recent)."""
        node.next = self.head.next
        node.prev = self.head
        self.head.next.prev = node
        self.head.next = node

    def get(self, key: int) -> int:
        if key not in self.cache:
            return -1
        node = self.cache[key]
        # Move to front (most recently used)
        self._remove(node)
        self._add_to_front(node)
        return node.val

    def put(self, key: int, value: int) -> None:
        if key in self.cache:
            # Update existing node
            self._remove(self.cache[key])

        node = DListNode(key, value)
        self.cache[key] = node
        self._add_to_front(node)

        if len(self.cache) > self.capacity:
            # Evict the least recently used (node before tail)
            lru = self.tail.prev
            self._remove(lru)
            del self.cache[lru.key]
```

**Python shortcut:** `collections.OrderedDict` provides LRU behavior with `move_to_end()`
and `popitem(last=False)`. However, interviewers usually want you to implement it from
scratch.

---

## 3. Additional Important Problems

### 3.1 Find Middle of Linked List

```python
def middle_node(head: ListNode | None) -> ListNode | None:
    """
    Time:  O(n)
    Space: O(1)
    """
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    return slow  # for even-length lists, returns second middle
```

### 3.2 Palindrome Linked List

```python
def is_palindrome(head: ListNode | None) -> bool:
    """
    Check if linked list is a palindrome.
    Time:  O(n)
    Space: O(1) -- reverses in place
    """
    # Find middle
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next

    # Reverse second half
    prev = None
    while slow:
        next_node = slow.next
        slow.next = prev
        prev = slow
        slow = next_node

    # Compare halves
    left, right = head, prev
    while right:
        if left.val != right.val:
            return False
        left = left.next
        right = right.next

    return True
```

### 3.3 Add Two Numbers

```python
def add_two_numbers(
    l1: ListNode | None,
    l2: ListNode | None
) -> ListNode | None:
    """
    Add two numbers represented as reversed linked lists.
    Time:  O(max(n, m))
    Space: O(max(n, m))
    """
    dummy = ListNode(0)
    current = dummy
    carry = 0

    while l1 or l2 or carry:
        val = carry
        if l1:
            val += l1.val
            l1 = l1.next
        if l2:
            val += l2.val
            l2 = l2.next

        carry, digit = divmod(val, 10)
        current.next = ListNode(digit)
        current = current.next

    return dummy.next
```

---

## 4. Common Interview Questions

| # | Problem | Difficulty | Pattern | Key Insight |
|---|---------|-----------|---------|-------------|
| 1 | Reverse Linked List | Easy | In-place reversal | Three pointers: prev, curr, next |
| 2 | Merge Two Sorted Lists | Easy | Dummy node | Compare heads, append smaller |
| 3 | Linked List Cycle | Easy | Fast-slow pointers | Fast moves 2x, slow moves 1x |
| 4 | Middle of Linked List | Easy | Fast-slow pointers | When fast hits end, slow is middle |
| 5 | Palindrome Linked List | Easy | Fast-slow + reverse | Reverse second half, compare |
| 6 | Remove Nth from End | Medium | Two pointers with gap | Gap of n between pointers |
| 7 | Add Two Numbers | Medium | Dummy node | Carry propagation |
| 8 | Reorder List | Medium | Find mid + reverse + merge | Three-step decomposition |
| 9 | Linked List Cycle II | Medium | Floyd's algorithm | Math proof for cycle start |
| 10 | LRU Cache | Medium | Hash map + doubly linked list | O(1) get and put |
| 11 | Merge K Sorted Lists | Hard | Heap or divide-and-conquer | See Heaps chapter |
| 12 | Reverse Nodes in K-Group | Hard | Iterative reversal in chunks | Count k, reverse, reconnect |

---

## 5. Gotchas

### 5.1 Pointer Management
- **Always save the next pointer** before modifying `curr.next`. Forgetting this is the most
  common bug in reversal problems.
- When splitting a list, **set the tail of the first part to None** to avoid cycles.
- After merging or reordering, verify the list terminates (`last_node.next = None`).

### 5.2 Edge Cases
- **Empty list** (`head is None`): Always check this first.
- **Single node**: Most operations are no-ops.
- **Two nodes**: Test your merge/reverse logic with exactly 2 nodes.
- **Even vs odd length**: Fast-slow pointer middle can differ. Know which middle you get.

### 5.3 Dummy Node Usage
- Use a dummy node whenever the **head might be removed or changed**.
- Always return `dummy.next`, not `head` (head may have been removed).
- Don't forget to create the dummy: `dummy = ListNode(0, head)`.

### 5.4 In-Place vs New List
- Many problems require in-place modification (no extra list nodes).
- "In-place" still allows O(1) extra pointers.
- If the problem returns a new list, you can allocate new nodes.

### 5.5 Python-Specific
- Python doesn't have null; use `None`.
- `is` checks identity (same object), `==` checks value. For nodes, use `is` to compare references.
- No need for manual memory management; Python's GC handles orphaned nodes.

---

## 6. Quick Reference

| Pattern | When to Use | Time | Space | Key Steps |
|---------|-------------|------|-------|-----------|
| Dummy node | Head might change | - | O(1) | `dummy = ListNode(0, head); return dummy.next` |
| Fast-slow (find middle) | Need midpoint | O(n) | O(1) | Fast moves 2x; when fast ends, slow = mid |
| Fast-slow (cycle detect) | Detect cycle | O(n) | O(1) | If fast == slow, cycle exists |
| Floyd's (cycle start) | Find cycle entry | O(n) | O(1) | After meet, reset one to head, move both 1x |
| In-place reversal | Reverse list/sublist | O(n) | O(1) | Save next, reverse pointer, advance all |
| Two-pointer gap | Nth from end | O(n) | O(1) | Advance fast by n, then move both |
| Hash map + DLL | LRU Cache | O(1)/op | O(n) | Map for lookup, DLL for order |
| Merge technique | Merge sorted lists | O(n+m) | O(1) | Compare heads, append smaller |
