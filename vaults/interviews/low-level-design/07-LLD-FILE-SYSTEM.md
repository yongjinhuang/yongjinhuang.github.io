# Design an In-Memory File System

The in-memory file system is a classic LLD problem that showcases the Composite pattern perfectly.
It also tests your ability to handle path resolution, permissions, and tree traversal. A bonus
section covers a text editor with undo/redo using the Command pattern.

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Class Diagram](#2-class-diagram)
3. [Core Implementation](#3-core-implementation)
4. [Path Resolution](#4-path-resolution)
5. [Search Functionality](#5-search-functionality)
6. [Permissions System](#6-permissions-system)
7. [Text Editor with Undo/Redo](#7-text-editor-with-undoredo)
8. [Interview Walkthrough](#8-interview-walkthrough)
9. [Common Follow-Up Questions](#9-common-follow-up-questions)
10. [Gotchas](#10-gotchas)
11. [Quick Reference](#11-quick-reference)

---

## 1. Requirements

### Functional Requirements

| #   | Requirement                  | Details                                     |
| --- | ---------------------------- | ------------------------------------------- |
| F1  | Create files and directories | Nested directory structure                  |
| F2  | Read/write file content      | String content for simplicity               |
| F3  | Delete files and directories | Recursive delete for directories            |
| F4  | List directory contents      | Like `ls` command                           |
| F5  | Navigate paths               | Absolute paths: `/home/user/docs/file.txt`  |
| F6  | Search                       | Find by name, extension, or size            |
| F7  | Move/rename                  | Move file or directory to a new location    |
| F8  | Permissions                  | Read, write, execute for owner (simplified) |

### Clarifying Questions

- "Is this an in-memory file system or on-disk?" (In-memory)
- "Do we need symlinks?" (Not for basic, discuss as extension)
- "Multi-user with permissions?" (Simplified single-user with rwx flags)
- "What is the maximum depth?" (No limit, but discuss practical bounds)

---

## 2. Class Diagram

```
+-----------------------------+
|   FileSystemNode (ABC)      |
|-----------------------------|
| name                        |
| parent                      |
| created_at                  |
| modified_at                 |
| permissions                 |
|-----------------------------|
| get_path()                  |
| get_size() [abstract]       |
| display(indent) [abstract]  |
+-----------------------------+
           ^
           |
     +-----+------+
     |             |
+----------+  +------------+
|   File   |  | Directory  |
|----------|  |------------|
| _content |  | _children  |
| _size    |  |------------|
|----------|  | add_child()|
| read()   |  | remove()   |
| write()  |  | get_child()|
| get_size |  | list()     |
+----------+  | get_size() |
              +------------+

+-----------------------------+
|   FileSystem                |
|-----------------------------|
| root (Directory)            |
|-----------------------------|
| create_file(path, content)  |
| create_dir(path)            |
| read_file(path)             |
| write_file(path, content)   |
| delete(path)                |
| list_dir(path)              |
| move(src, dst)              |
| search(criteria)            |
| resolve_path(path)          |
+-----------------------------+
```

---

## 3. Core Implementation

### Permissions

```python
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from datetime import datetime
from enum import Flag, auto


class Permission(Flag):
    NONE = 0
    READ = auto()
    WRITE = auto()
    EXECUTE = auto()
    ALL = READ | WRITE | EXECUTE
```

### FileSystemNode (Base Class -- Composite Pattern)

```python
class FileSystemNode(ABC):
    def __init__(self, name: str, permissions: Permission = Permission.ALL):
        self._name = name
        self._parent: "Directory | None" = None
        self._created_at = datetime.now()
        self._modified_at = datetime.now()
        self._permissions = permissions

    @property
    def name(self) -> str:
        return self._name

    @name.setter
    def name(self, value: str) -> None:
        self._validate_name(value)
        self._name = value
        self._modified_at = datetime.now()

    @property
    def parent(self) -> "Directory | None":
        return self._parent

    @parent.setter
    def parent(self, value: "Directory | None") -> None:
        self._parent = value

    @property
    def permissions(self) -> Permission:
        return self._permissions

    @permissions.setter
    def permissions(self, value: Permission) -> None:
        self._permissions = value

    def get_path(self) -> str:
        """Build absolute path by walking up to root."""
        parts = []
        node: FileSystemNode | None = self
        while node is not None:
            parts.append(node.name)
            node = node.parent
        parts.reverse()
        path = "/".join(parts)
        return "/" + path if not path.startswith("/") else path

    @abstractmethod
    def get_size(self) -> int:
        pass

    @abstractmethod
    def display(self, indent: int = 0) -> str:
        pass

    @staticmethod
    def _validate_name(name: str) -> None:
        if not name or "/" in name:
            raise ValueError(f"Invalid name: '{name}'")
```

### File Class (Leaf)

```python
class File(FileSystemNode):
    def __init__(self, name: str, content: str = "",
                 permissions: Permission = Permission.ALL):
        super().__init__(name, permissions)
        self._content = content

    def read(self) -> str:
        if not (self._permissions & Permission.READ):
            raise PermissionError(f"No read permission on {self.name}")
        return self._content

    def write(self, content: str) -> None:
        if not (self._permissions & Permission.WRITE):
            raise PermissionError(f"No write permission on {self.name}")
        self._content = content
        self._modified_at = datetime.now()

    def append(self, content: str) -> None:
        if not (self._permissions & Permission.WRITE):
            raise PermissionError(f"No write permission on {self.name}")
        self._content = self._content + content
        self._modified_at = datetime.now()

    def get_size(self) -> int:
        return len(self._content.encode("utf-8"))

    def get_extension(self) -> str:
        if "." in self.name:
            return self.name.rsplit(".", 1)[-1]
        return ""

    def display(self, indent: int = 0) -> str:
        return f"{'  ' * indent}{self.name} ({self.get_size()}B)"
```

### Directory Class (Composite)

```python
class Directory(FileSystemNode):
    def __init__(self, name: str, permissions: Permission = Permission.ALL):
        super().__init__(name, permissions)
        self._children: dict[str, FileSystemNode] = {}

    def add_child(self, node: FileSystemNode) -> None:
        if node.name in self._children:
            raise FileExistsError(f"'{node.name}' already exists in {self.name}")
        self._children = {**self._children, node.name: node}
        node.parent = self
        self._modified_at = datetime.now()

    def remove_child(self, name: str) -> FileSystemNode:
        if name not in self._children:
            raise FileNotFoundError(f"'{name}' not found in {self.name}")
        removed = self._children[name]
        self._children = {k: v for k, v in self._children.items() if k != name}
        removed.parent = None
        self._modified_at = datetime.now()
        return removed

    def get_child(self, name: str) -> FileSystemNode | None:
        return self._children.get(name)

    def list_children(self) -> list[str]:
        return sorted(self._children.keys())

    def list_children_detailed(self) -> list[dict]:
        result = []
        for name in sorted(self._children.keys()):
            child = self._children[name]
            result.append({
                "name": name,
                "type": "dir" if isinstance(child, Directory) else "file",
                "size": child.get_size(),
                "permissions": str(child.permissions),
            })
        return result

    def get_size(self) -> int:
        """Recursive size: sum of all files in this directory and subdirectories."""
        return sum(child.get_size() for child in self._children.values())

    def display(self, indent: int = 0) -> str:
        lines = [f"{'  ' * indent}{self.name}/"]
        for name in sorted(self._children.keys()):
            lines.append(self._children[name].display(indent + 1))
        return "\n".join(lines)

    def is_empty(self) -> bool:
        return len(self._children) == 0
```

---

## 4. Path Resolution

The FileSystem class orchestrates all operations and handles path resolution.

```python
class FileSystem:
    def __init__(self):
        self._root = Directory("")

    def create_file(self, path: str, content: str = "") -> File:
        """Create a file at the given absolute path."""
        parent_path, file_name = self._split_path(path)
        parent = self._resolve_directory(parent_path)
        new_file = File(file_name, content)
        parent.add_child(new_file)
        return new_file

    def create_directory(self, path: str) -> Directory:
        """Create a directory, including intermediate directories (like mkdir -p)."""
        parts = self._parse_path(path)
        current = self._root

        for part in parts:
            child = current.get_child(part)
            if child is None:
                new_dir = Directory(part)
                current.add_child(new_dir)
                current = new_dir
            elif isinstance(child, Directory):
                current = child
            else:
                raise FileExistsError(f"'{part}' exists as a file, not a directory")

        return current

    def read_file(self, path: str) -> str:
        node = self._resolve_path(path)
        if not isinstance(node, File):
            raise IsADirectoryError(f"'{path}' is a directory")
        return node.read()

    def write_file(self, path: str, content: str) -> None:
        node = self._resolve_path(path)
        if not isinstance(node, File):
            raise IsADirectoryError(f"'{path}' is a directory")
        node.write(content)

    def delete(self, path: str) -> None:
        """Delete a file or directory."""
        if path == "/":
            raise PermissionError("Cannot delete root directory")
        node = self._resolve_path(path)
        if node.parent is not None:
            node.parent.remove_child(node.name)

    def list_directory(self, path: str = "/") -> list[str]:
        node = self._resolve_path(path)
        if not isinstance(node, Directory):
            raise NotADirectoryError(f"'{path}' is not a directory")
        return node.list_children()

    def move(self, src_path: str, dst_path: str) -> None:
        """Move a file or directory to a new location."""
        src_node = self._resolve_path(src_path)
        dst_parent_path, new_name = self._split_path(dst_path)
        dst_parent = self._resolve_directory(dst_parent_path)

        # Prevent moving a directory into itself
        if isinstance(src_node, Directory):
            check = dst_parent
            while check is not None:
                if check is src_node:
                    raise ValueError("Cannot move directory into itself")
                check = check.parent

        if src_node.parent is not None:
            src_node.parent.remove_child(src_node.name)
        src_node.name = new_name
        dst_parent.add_child(src_node)

    def get_size(self, path: str = "/") -> int:
        return self._resolve_path(path).get_size()

    def display(self) -> str:
        return self._root.display()

    # --- Path Resolution Helpers ---

    def _resolve_path(self, path: str) -> FileSystemNode:
        """Resolve an absolute path to a FileSystemNode."""
        if path == "/":
            return self._root
        parts = self._parse_path(path)
        current: FileSystemNode = self._root
        for part in parts:
            if not isinstance(current, Directory):
                raise NotADirectoryError(f"'{current.name}' is not a directory")
            child = current.get_child(part)
            if child is None:
                raise FileNotFoundError(f"Path not found: {path}")
            current = child
        return current

    def _resolve_directory(self, path: str) -> Directory:
        node = self._resolve_path(path)
        if not isinstance(node, Directory):
            raise NotADirectoryError(f"'{path}' is not a directory")
        return node

    def _split_path(self, path: str) -> tuple[str, str]:
        """Split '/a/b/c.txt' into ('/a/b', 'c.txt')."""
        parts = self._parse_path(path)
        if not parts:
            raise ValueError("Invalid path")
        parent = "/" + "/".join(parts[:-1]) if len(parts) > 1 else "/"
        return parent, parts[-1]

    @staticmethod
    def _parse_path(path: str) -> list[str]:
        """Parse '/a/b/c' into ['a', 'b', 'c']. Handles trailing slashes."""
        if not path.startswith("/"):
            raise ValueError(f"Path must be absolute: {path}")
        return [p for p in path.split("/") if p]
```

---

## 5. Search Functionality

```python
from abc import ABC, abstractmethod
from typing import Callable


class SearchCriteria(ABC):
    @abstractmethod
    def matches(self, node: FileSystemNode) -> bool:
        pass


class NameSearch(SearchCriteria):
    def __init__(self, name: str, exact: bool = True):
        self._name = name
        self._exact = exact

    def matches(self, node: FileSystemNode) -> bool:
        if self._exact:
            return node.name == self._name
        return self._name.lower() in node.name.lower()


class ExtensionSearch(SearchCriteria):
    def __init__(self, extension: str):
        self._extension = extension.lstrip(".")

    def matches(self, node: FileSystemNode) -> bool:
        if isinstance(node, File):
            return node.get_extension() == self._extension
        return False


class SizeSearch(SearchCriteria):
    def __init__(self, min_size: int = 0, max_size: int = float("inf")):
        self._min = min_size
        self._max = max_size

    def matches(self, node: FileSystemNode) -> bool:
        size = node.get_size()
        return self._min <= size <= self._max


class CompositeSearch(SearchCriteria):
    """Combine multiple criteria with AND logic."""

    def __init__(self, criteria: list[SearchCriteria]):
        self._criteria = criteria

    def matches(self, node: FileSystemNode) -> bool:
        return all(c.matches(node) for c in self._criteria)


def search(root: FileSystemNode, criteria: SearchCriteria) -> list[FileSystemNode]:
    """Recursively search the file tree for nodes matching criteria."""
    results = []

    def _walk(node: FileSystemNode) -> None:
        if criteria.matches(node):
            results.append(node)
        if isinstance(node, Directory):
            for child_name in node.list_children():
                child = node.get_child(child_name)
                if child is not None:
                    _walk(child)

    _walk(root)
    return results
```

### Search Usage

```python
fs = FileSystem()
fs.create_directory("/home/user/docs")
fs.create_directory("/home/user/photos")
fs.create_file("/home/user/docs/resume.pdf", "my resume content")
fs.create_file("/home/user/docs/notes.txt", "some notes")
fs.create_file("/home/user/photos/vacation.jpg", "x" * 5000)

# Find all .txt files
txt_files = search(fs._root, ExtensionSearch("txt"))

# Find files larger than 1000 bytes
large_files = search(fs._root, SizeSearch(min_size=1000))

# Find files named "resume" with .pdf extension
pdf_resumes = search(
    fs._root,
    CompositeSearch([NameSearch("resume.pdf"), ExtensionSearch("pdf")])
)
```

---

## 6. Permissions System

```python
class PermissionChecker:
    """Centralized permission validation."""

    @staticmethod
    def check_read(node: FileSystemNode) -> None:
        if not (node.permissions & Permission.READ):
            raise PermissionError(f"No read permission: {node.get_path()}")

    @staticmethod
    def check_write(node: FileSystemNode) -> None:
        if not (node.permissions & Permission.WRITE):
            raise PermissionError(f"No write permission: {node.get_path()}")

    @staticmethod
    def check_execute(node: FileSystemNode) -> None:
        if not (node.permissions & Permission.EXECUTE):
            raise PermissionError(f"No execute permission: {node.get_path()}")


# Usage: restrict a file
secret = File("secret.txt", "top secret", permissions=Permission.NONE)
try:
    secret.read()  # Raises PermissionError
except PermissionError as e:
    print(e)

secret.permissions = Permission.READ
content = secret.read()  # Now works
```

---

## 7. Text Editor with Undo/Redo

This bonus section shows the Command pattern applied to a text editor -- a common follow-up
question when discussing file systems.

```python
class EditorCommand(ABC):
    @abstractmethod
    def execute(self) -> None:
        pass

    @abstractmethod
    def undo(self) -> None:
        pass


class TextBuffer:
    def __init__(self, content: str = ""):
        self.content = content

    def insert(self, position: int, text: str) -> None:
        self.content = self.content[:position] + text + self.content[position:]

    def delete(self, position: int, length: int) -> str:
        deleted = self.content[position:position + length]
        self.content = self.content[:position] + self.content[position + length:]
        return deleted

    def __repr__(self) -> str:
        return f"TextBuffer('{self.content}')"


class InsertCommand(EditorCommand):
    def __init__(self, buffer: TextBuffer, position: int, text: str):
        self._buffer = buffer
        self._position = position
        self._text = text

    def execute(self) -> None:
        self._buffer.insert(self._position, self._text)

    def undo(self) -> None:
        self._buffer.delete(self._position, len(self._text))


class DeleteCommand(EditorCommand):
    def __init__(self, buffer: TextBuffer, position: int, length: int):
        self._buffer = buffer
        self._position = position
        self._length = length
        self._deleted_text = ""

    def execute(self) -> None:
        self._deleted_text = self._buffer.delete(self._position, self._length)

    def undo(self) -> None:
        self._buffer.insert(self._position, self._deleted_text)


class TextEditor:
    def __init__(self):
        self._buffer = TextBuffer()
        self._undo_stack: list[EditorCommand] = []
        self._redo_stack: list[EditorCommand] = []

    @property
    def content(self) -> str:
        return self._buffer.content

    def insert(self, position: int, text: str) -> None:
        cmd = InsertCommand(self._buffer, position, text)
        cmd.execute()
        self._undo_stack = [*self._undo_stack, cmd]
        self._redo_stack = []

    def delete(self, position: int, length: int) -> None:
        cmd = DeleteCommand(self._buffer, position, length)
        cmd.execute()
        self._undo_stack = [*self._undo_stack, cmd]
        self._redo_stack = []

    def undo(self) -> None:
        if not self._undo_stack:
            return
        cmd = self._undo_stack[-1]
        self._undo_stack = self._undo_stack[:-1]
        cmd.undo()
        self._redo_stack = [*self._redo_stack, cmd]

    def redo(self) -> None:
        if not self._redo_stack:
            return
        cmd = self._redo_stack[-1]
        self._redo_stack = self._redo_stack[:-1]
        cmd.execute()
        self._undo_stack = [*self._undo_stack, cmd]


# Demo
editor = TextEditor()
editor.insert(0, "Hello World")    # "Hello World"
editor.insert(5, ",")              # "Hello, World"
editor.delete(11, 1)               # "Hello, Worl"
editor.undo()                      # "Hello, World"
editor.undo()                      # "Hello World"
editor.redo()                      # "Hello, World"
```

---

## 8. Interview Walkthrough

### Step 1: Clarify (3 min)

Ask about scope: in-memory vs persistent, single-user vs multi-user, permissions needed?

### Step 2: Identify Patterns (2 min)

"The file system is a tree where files are leaves and directories are composites. I'll use
the Composite pattern so that `get_size()` and `display()` work uniformly on both."

### Step 3: Implement (25 min)

FileSystemNode -> File -> Directory -> FileSystem (path resolution). Keep search and
permissions as extensions.

### Step 4: Extend (5 min)

Discuss symlinks, hard links, watchers (Observer pattern for file change notifications),
and the text editor as a bonus if time permits.

---

## 9. Common Follow-Up Questions

### "How would you add symlinks?"

Create a `SymLink(FileSystemNode)` class that holds a target path string. On access, resolve
the target path. Handle circular symlinks with a visited set during resolution.

### "How would you add file watchers?"

Observer pattern: `FileSystem` publishes events (CREATED, MODIFIED, DELETED). Watchers
subscribe to specific paths or glob patterns.

### "How would you make this persistent?"

Serialize the tree to disk (JSON or binary format). On startup, deserialize and rebuild
the in-memory tree. Or use a B-tree / inode-based structure like real file systems.

---

## 10. Gotchas

- **Moving a directory into itself** creates an infinite loop. Always check by walking up
  the destination's parent chain.

- **Path parsing edge cases:** `"/"`, `"//"`, `"/a/"`, `"/a/b/../c"`. Handle trailing slashes
  and decide whether to support `..` and `.` navigation.

- **Name validation:** File names cannot contain `/` or be empty. Validate in the constructor.

- **Recursive size calculation** on a deeply nested tree can cause stack overflow in Python
  (default recursion limit is 1000). Mention this and discuss iterative alternatives.

- **The Composite pattern** means `Directory.get_size()` calls `child.get_size()` recursively.
  This is elegant but can be slow for large trees. Cache sizes and invalidate on modification.

---

## 11. Quick Reference

```
+----------------------------+----------------------------------------+
| Component                  | Pattern / Role                         |
+----------------------------+----------------------------------------+
| FileSystemNode (ABC)       | Component (Composite pattern)          |
| File                       | Leaf (Composite pattern)               |
| Directory                  | Composite (Composite pattern)          |
| FileSystem                 | Facade (simplified API for tree ops)   |
| SearchCriteria (ABC)       | Strategy (swappable search algorithms) |
| EditorCommand (ABC)        | Command (undo/redo for text editor)    |
+----------------------------+----------------------------------------+

Path Resolution: Split path by "/" -> walk tree from root -> return node
  /home/user/file.txt -> root -> "home" -> "user" -> "file.txt"

Search: DFS traversal + criteria matching
  Find by name:      NameSearch("readme.md")
  Find by extension: ExtensionSearch("py")
  Find by size:      SizeSearch(min_size=1024)
  Combine:           CompositeSearch([...])
```
