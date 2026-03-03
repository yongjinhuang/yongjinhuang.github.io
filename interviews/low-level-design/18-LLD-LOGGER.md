# Design a Logging Framework (Log4j / Python logging)

A logging framework is a rich LLD problem that tests your ability to design hierarchical
systems, implement Chain of Responsibility for log routing, handle concurrency with
producer-consumer patterns, and build configurable, extensible infrastructure. It is
frequently asked at senior levels because logging is foundational to every production system.

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Class Diagram](#2-class-diagram)
3. [Core Implementation](#3-core-implementation)
4. [Handlers and Formatters](#4-handlers-and-formatters)
5. [Logger Hierarchy and Level Inheritance](#5-logger-hierarchy-and-level-inheritance)
6. [Async Logging](#6-async-logging)
7. [Structured Logging and Context](#7-structured-logging-and-context)
8. [Configuration](#8-configuration)
9. [Interview Walkthrough](#9-interview-walkthrough)
10. [Common Follow-Up Questions](#10-common-follow-up-questions)
11. [Gotchas](#11-gotchas)
12. [Quick Reference](#12-quick-reference)

---

## 1. Requirements

### Functional Requirements

| # | Requirement | Details |
|---|-------------|---------|
| F1 | Log levels | DEBUG, INFO, WARNING, ERROR, CRITICAL with filtering |
| F2 | Logger hierarchy | root -> package -> module with level inheritance |
| F3 | Multiple handlers | Console, File, RotatingFile, HTTP |
| F4 | Formatters | Customizable output format (text, JSON) |
| F5 | Log routing | Route log records through handler chain |
| F6 | Async logging | Non-blocking with background writer thread |
| F7 | Structured logging | JSON output with arbitrary key-value context |
| F8 | Context propagation | Request ID, user ID across log calls |
| F9 | Configuration | Load from dict or file |

### Non-Functional Requirements

| # | Requirement |
|---|-------------|
| NF1 | Thread-safe (multiple threads log concurrently) |
| NF2 | Minimal overhead when log level is filtered out |
| NF3 | Singleton LogManager for global access |
| NF4 | Extensible: new handlers without modifying core |

### Clarifying Questions to Ask

- "Do we need log rotation by size and by time?" (Size-based for this design)
- "Should child loggers propagate to parent handlers?" (Yes, like Python logging)
- "Do we need remote logging (HTTP sink)?" (Yes, as an extension)
- "Is async logging required or optional?" (Optional, configurable per handler)

---

## 2. Class Diagram

```
+-------------------+       +---------------------+
|   LogLevel        |       |   LogRecord         |
|   (Enum)          |       |---------------------|
|-------------------|       | timestamp           |
| DEBUG = 10        |       | level               |
| INFO = 20         |       | logger_name         |
| WARNING = 30      |       | message             |
| ERROR = 40        |       | context             |
| CRITICAL = 50     |       +---------------------+
+-------------------+
                            +---------------------+
+-------------------+       |   Formatter (ABC)   |
|   Logger          |       |---------------------|
|-------------------|       | format(record)      |
| name              |       +---------------------+
| level             |         ^            ^
| handlers          |         |            |
| parent            |       TextFmt     JsonFmt
| propagate         |
|-------------------|       +---------------------+
| debug(msg)        |       |   Handler (ABC)     |
| info(msg)         |       |---------------------|
| warning(msg)      |       | level               |
| error(msg)        |       | formatter           |
| critical(msg)     |       |---------------------|
| log(level, msg)   |       | emit(record)        |
+-------------------+       | should_handle()     |
        |                   +---------------------+
        |                     ^    ^    ^    ^
+-------------------+         |    |    |    |
|   LogManager      |     Console File Rotating HTTP
|   (Singleton)     |
|-------------------|       +---------------------+
| get_logger(name)  |       | AsyncHandler        |
| configure(dict)   |       |   (Decorator)       |
+-------------------+       |---------------------|
                            | queue               |
+-------------------+       | worker_thread       |
| LogContext         |       |---------------------|
|   (Thread-local)  |       | emit(record)        |
|-------------------|       | start()             |
| request_id        |       | stop()              |
| user_id           |       +---------------------+
| extra             |
+-------------------+
```

---

## 3. Core Implementation

### Log Level and Log Record

```python
from enum import IntEnum
from dataclasses import dataclass, field
from datetime import datetime
from abc import ABC, abstractmethod
from collections import defaultdict
import threading
import queue
import json
import os
import io


class LogLevel(IntEnum):
    DEBUG = 10
    INFO = 20
    WARNING = 30
    ERROR = 40
    CRITICAL = 50

    @classmethod
    def from_string(cls, level_str: str) -> "LogLevel":
        mapping = {
            "DEBUG": cls.DEBUG,
            "INFO": cls.INFO,
            "WARNING": cls.WARNING,
            "ERROR": cls.ERROR,
            "CRITICAL": cls.CRITICAL,
        }
        upper = level_str.upper()
        if upper not in mapping:
            raise ValueError(f"Unknown log level: {level_str}")
        return mapping[upper]


@dataclass(frozen=True)
class LogRecord:
    timestamp: datetime
    level: LogLevel
    logger_name: str
    message: str
    context: dict[str, str] = field(default_factory=dict)

    @staticmethod
    def create(level: LogLevel, logger_name: str, message: str,
               context: dict[str, str] | None = None) -> "LogRecord":
        return LogRecord(
            timestamp=datetime.now(),
            level=level,
            logger_name=logger_name,
            message=message,
            context=context or {},
        )
```

### Formatter

```python
class Formatter(ABC):
    @abstractmethod
    def format(self, record: LogRecord) -> str:
        pass


class TextFormatter(Formatter):
    """Standard text format: [timestamp] LEVEL logger - message {context}"""

    def __init__(self, pattern: str | None = None):
        self._pattern = pattern or (
            "[{timestamp}] {level} {logger} - {message}"
        )

    def format(self, record: LogRecord) -> str:
        text = self._pattern.format(
            timestamp=record.timestamp.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
            level=record.level.name.ljust(8),
            logger=record.logger_name,
            message=record.message,
        )
        if record.context:
            ctx_str = " ".join(
                f"{k}={v}" for k, v in record.context.items()
            )
            text = f"{text} | {ctx_str}"
        return text


class JsonFormatter(Formatter):
    """Structured JSON output for log aggregation systems."""

    def format(self, record: LogRecord) -> str:
        log_dict = {
            "timestamp": record.timestamp.isoformat(),
            "level": record.level.name,
            "logger": record.logger_name,
            "message": record.message,
        }
        if record.context:
            log_dict["context"] = dict(record.context)
        return json.dumps(log_dict, default=str)
```

---

## 4. Handlers and Formatters

Each handler decides whether to process a record (level filtering) and writes it
using its formatter.

```python
class Handler(ABC):
    def __init__(self, level: LogLevel = LogLevel.DEBUG,
                 formatter: Formatter | None = None):
        self._level = level
        self._formatter = formatter or TextFormatter()
        self._lock = threading.Lock()

    @property
    def level(self) -> LogLevel:
        return self._level

    @level.setter
    def level(self, value: LogLevel) -> None:
        self._level = value

    @property
    def formatter(self) -> Formatter:
        return self._formatter

    @formatter.setter
    def formatter(self, value: Formatter) -> None:
        self._formatter = value

    def should_handle(self, record: LogRecord) -> bool:
        return record.level >= self._level

    def handle(self, record: LogRecord) -> None:
        if self.should_handle(record):
            with self._lock:
                self.emit(record)

    @abstractmethod
    def emit(self, record: LogRecord) -> None:
        pass

    def close(self) -> None:
        pass


class ConsoleHandler(Handler):
    """Write log records to stdout/stderr."""

    def __init__(self, level: LogLevel = LogLevel.DEBUG,
                 formatter: Formatter | None = None,
                 stream: io.TextIOBase | None = None):
        super().__init__(level, formatter)
        self._stream = stream  # None means use print()

    def emit(self, record: LogRecord) -> None:
        line = self._formatter.format(record)
        if self._stream is not None:
            self._stream.write(line + "\n")
            self._stream.flush()
        else:
            print(line)


class FileHandler(Handler):
    """Write log records to a file."""

    def __init__(self, filepath: str,
                 level: LogLevel = LogLevel.DEBUG,
                 formatter: Formatter | None = None):
        super().__init__(level, formatter)
        self._filepath = filepath
        self._file = open(filepath, "a", encoding="utf-8")

    def emit(self, record: LogRecord) -> None:
        line = self._formatter.format(record)
        self._file.write(line + "\n")
        self._file.flush()

    def close(self) -> None:
        self._file.close()


class RotatingFileHandler(Handler):
    """Write to file, rotate when size exceeds max_bytes.

    Keeps up to backup_count old files:
      app.log -> app.log.1 -> app.log.2 -> (deleted)
    """

    def __init__(self, filepath: str,
                 max_bytes: int = 10 * 1024 * 1024,  # 10 MB
                 backup_count: int = 5,
                 level: LogLevel = LogLevel.DEBUG,
                 formatter: Formatter | None = None):
        super().__init__(level, formatter)
        self._filepath = filepath
        self._max_bytes = max_bytes
        self._backup_count = backup_count
        self._file = open(filepath, "a", encoding="utf-8")
        self._current_size = os.path.getsize(filepath) if os.path.exists(filepath) else 0

    def emit(self, record: LogRecord) -> None:
        line = self._formatter.format(record)
        line_bytes = len(line.encode("utf-8")) + 1  # +1 for newline

        if self._current_size + line_bytes > self._max_bytes:
            self._rotate()

        self._file.write(line + "\n")
        self._file.flush()
        self._current_size += line_bytes

    def _rotate(self) -> None:
        self._file.close()

        # Shift existing backups: .2 -> .3, .1 -> .2, etc.
        for i in range(self._backup_count - 1, 0, -1):
            src = f"{self._filepath}.{i}"
            dst = f"{self._filepath}.{i + 1}"
            if os.path.exists(src):
                os.rename(src, dst)

        # Current file becomes .1
        if os.path.exists(self._filepath):
            os.rename(self._filepath, f"{self._filepath}.1")

        # Delete oldest if over backup_count
        oldest = f"{self._filepath}.{self._backup_count + 1}"
        if os.path.exists(oldest):
            os.remove(oldest)

        self._file = open(self._filepath, "a", encoding="utf-8")
        self._current_size = 0

    def close(self) -> None:
        self._file.close()


class HTTPHandler(Handler):
    """Send log records to a remote HTTP endpoint.

    In production, use batch sending and retry logic.
    Shown here as a simple synchronous POST for interview clarity.
    """

    def __init__(self, url: str, level: LogLevel = LogLevel.ERROR,
                 formatter: Formatter | None = None):
        super().__init__(level, formatter or JsonFormatter())
        self._url = url
        self._batch: list[str] = []
        self._batch_size = 10

    def emit(self, record: LogRecord) -> None:
        line = self._formatter.format(record)
        self._batch.append(line)

        if len(self._batch) >= self._batch_size:
            self._flush_batch()

    def _flush_batch(self) -> None:
        """In production, send via HTTP POST. Mocked here."""
        payload = "\n".join(self._batch)
        # requests.post(self._url, data=payload)
        print(f"[HTTP] Sending {len(self._batch)} logs to {self._url}")
        self._batch = []

    def close(self) -> None:
        if self._batch:
            self._flush_batch()
```

---

## 5. Logger Hierarchy and Level Inheritance

Loggers form a tree: `root` -> `app` -> `app.auth` -> `app.auth.login`. A child
logger without an explicit level inherits from its parent. Log records propagate
up the chain so parent handlers also receive them.

```python
class Logger:
    def __init__(self, name: str, level: LogLevel | None = None):
        self._name = name
        self._level = level  # None means inherit from parent
        self._handlers: list[Handler] = []
        self._parent: Logger | None = None
        self._propagate = True

    @property
    def name(self) -> str:
        return self._name

    @property
    def effective_level(self) -> LogLevel:
        """Walk up the hierarchy to find the first explicit level."""
        if self._level is not None:
            return self._level
        if self._parent is not None:
            return self._parent.effective_level
        return LogLevel.WARNING  # Default for root

    @effective_level.setter
    def effective_level(self, value: LogLevel) -> None:
        self._level = value

    @property
    def parent(self) -> "Logger | None":
        return self._parent

    @parent.setter
    def parent(self, value: "Logger") -> None:
        self._parent = value

    @property
    def propagate(self) -> bool:
        return self._propagate

    @propagate.setter
    def propagate(self, value: bool) -> None:
        self._propagate = value

    def add_handler(self, handler: Handler) -> None:
        self._handlers.append(handler)

    def remove_handler(self, handler: Handler) -> None:
        self._handlers = [h for h in self._handlers if h is not handler]

    def debug(self, message: str, **context: str) -> None:
        self.log(LogLevel.DEBUG, message, **context)

    def info(self, message: str, **context: str) -> None:
        self.log(LogLevel.INFO, message, **context)

    def warning(self, message: str, **context: str) -> None:
        self.log(LogLevel.WARNING, message, **context)

    def error(self, message: str, **context: str) -> None:
        self.log(LogLevel.ERROR, message, **context)

    def critical(self, message: str, **context: str) -> None:
        self.log(LogLevel.CRITICAL, message, **context)

    def log(self, level: LogLevel, message: str, **context: str) -> None:
        """Create a record and pass it through the handler chain."""
        if level < self.effective_level:
            return  # Fast path: skip if below threshold

        # Merge thread-local context
        thread_ctx = LogContext.get_context()
        merged_context = {**thread_ctx, **context}

        record = LogRecord.create(
            level=level,
            logger_name=self._name,
            message=message,
            context=merged_context,
        )
        self._dispatch(record)

    def _dispatch(self, record: LogRecord) -> None:
        """Send record to this logger's handlers, then propagate to parent."""
        for handler in self._handlers:
            handler.handle(record)

        if self._propagate and self._parent is not None:
            self._parent._dispatch(record)
```

---

## 6. Async Logging

The `AsyncHandler` wraps any handler with a background thread and a queue, so the
calling thread is never blocked by slow I/O (file writes, HTTP calls).

```python
class AsyncHandler(Handler):
    """Decorator that wraps a handler with async queue processing.

    Producer (calling thread) puts records on a queue.
    Consumer (background thread) drains the queue and calls the
    wrapped handler's emit().
    """

    def __init__(self, wrapped: Handler, queue_size: int = 10000):
        super().__init__(wrapped.level, wrapped.formatter)
        self._wrapped = wrapped
        self._queue: queue.Queue[LogRecord | None] = queue.Queue(
            maxsize=queue_size
        )
        self._worker = threading.Thread(
            target=self._process, daemon=True, name="async-log-worker"
        )
        self._running = False

    def start(self) -> None:
        self._running = True
        self._worker.start()

    def stop(self) -> None:
        """Graceful shutdown: drain remaining records, then stop."""
        self._queue.put(None)  # Sentinel
        self._worker.join(timeout=5.0)
        self._running = False

    def emit(self, record: LogRecord) -> None:
        """Non-blocking: put record on queue."""
        try:
            self._queue.put_nowait(record)
        except queue.Full:
            pass  # Drop record if queue is full (back-pressure)

    def should_handle(self, record: LogRecord) -> bool:
        return self._wrapped.should_handle(record)

    def handle(self, record: LogRecord) -> None:
        """Override to skip the lock (queue is thread-safe)."""
        if self.should_handle(record):
            self.emit(record)

    def _process(self) -> None:
        """Background worker: drain queue and emit records."""
        while True:
            record = self._queue.get()
            if record is None:
                # Drain remaining
                while not self._queue.empty():
                    remaining = self._queue.get_nowait()
                    if remaining is not None:
                        self._wrapped.emit(remaining)
                break
            self._wrapped.emit(remaining=record)

    def _process(self) -> None:
        """Background worker: drain queue and emit records."""
        while True:
            record = self._queue.get()
            if record is None:
                # Drain remaining records before stopping
                while not self._queue.empty():
                    remaining = self._queue.get_nowait()
                    if remaining is not None:
                        self._wrapped.emit(remaining)
                break
            self._wrapped.emit(record)

    def close(self) -> None:
        self.stop()
        self._wrapped.close()
```

---

## 7. Structured Logging and Context

### Thread-Local Context Propagation

```python
class LogContext:
    """Thread-local storage for contextual log data.

    Set request_id, user_id, etc. at the start of a request,
    and all log calls within that thread automatically include them.
    """

    _local = threading.local()

    @classmethod
    def set(cls, **kwargs: str) -> None:
        if not hasattr(cls._local, "context"):
            cls._local.context = {}
        cls._local.context.update(kwargs)

    @classmethod
    def get_context(cls) -> dict[str, str]:
        if not hasattr(cls._local, "context"):
            return {}
        return dict(cls._local.context)

    @classmethod
    def clear(cls) -> None:
        cls._local.context = {}

    @classmethod
    def context_manager(cls, **kwargs: str):
        """Use as a context manager to auto-clear on exit."""
        return _LogContextManager(**kwargs)


class _LogContextManager:
    """Context manager that sets and clears log context."""

    def __init__(self, **kwargs: str):
        self._kwargs = kwargs
        self._previous: dict[str, str] = {}

    def __enter__(self) -> None:
        self._previous = LogContext.get_context()
        LogContext.set(**self._kwargs)

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        LogContext.clear()
        if self._previous:
            LogContext.set(**self._previous)
```

---

## 8. Configuration

### LogManager (Singleton)

```python
class LogManager:
    """Singleton that manages all loggers and their hierarchy.

    Logger names use dot notation: 'app.auth.login'
    creates the hierarchy: root -> app -> app.auth -> app.auth.login
    """

    _instance: "LogManager | None" = None
    _init_lock = threading.Lock()

    def __new__(cls) -> "LogManager":
        if cls._instance is None:
            with cls._init_lock:
                if cls._instance is None:
                    instance = super().__new__(cls)
                    instance._loggers = {}
                    instance._root = Logger("root", LogLevel.WARNING)
                    instance._loggers["root"] = instance._root
                    cls._instance = instance
        return cls._instance

    @property
    def root(self) -> Logger:
        return self._root

    def get_logger(self, name: str) -> Logger:
        """Get or create a logger with the given name.

        Automatically sets up parent relationships:
        'app.auth' -> parent is 'app' -> parent is 'root'
        """
        if name in self._loggers:
            return self._loggers[name]

        logger = Logger(name)

        # Find or create parent
        parts = name.rsplit(".", 1)
        if len(parts) > 1:
            parent_name = parts[0]
            parent = self.get_logger(parent_name)
            logger.parent = parent
        else:
            logger.parent = self._root

        self._loggers[name] = logger
        return logger

    def configure(self, config: dict) -> None:
        """Configure logging from a dictionary.

        Example config:
        {
            "root": {
                "level": "INFO",
                "handlers": [{"type": "console"}]
            },
            "loggers": {
                "app": {"level": "DEBUG"},
                "app.db": {"level": "WARNING"}
            }
        }
        """
        # Configure root
        if "root" in config:
            root_cfg = config["root"]
            if "level" in root_cfg:
                self._root.effective_level = LogLevel.from_string(
                    root_cfg["level"]
                )
            if "handlers" in root_cfg:
                for handler_cfg in root_cfg["handlers"]:
                    handler = self._create_handler(handler_cfg)
                    self._root.add_handler(handler)

        # Configure named loggers
        if "loggers" in config:
            for name, logger_cfg in config["loggers"].items():
                logger = self.get_logger(name)
                if "level" in logger_cfg:
                    logger.effective_level = LogLevel.from_string(
                        logger_cfg["level"]
                    )
                if "propagate" in logger_cfg:
                    logger.propagate = logger_cfg["propagate"]
                if "handlers" in logger_cfg:
                    for handler_cfg in logger_cfg["handlers"]:
                        handler = self._create_handler(handler_cfg)
                        logger.add_handler(handler)

    def _create_handler(self, config: dict) -> Handler:
        """Factory method: create handler from config dict."""
        handler_type = config.get("type", "console")
        level = LogLevel.from_string(config.get("level", "DEBUG"))

        fmt_type = config.get("formatter", "text")
        formatter: Formatter
        if fmt_type == "json":
            formatter = JsonFormatter()
        else:
            formatter = TextFormatter(config.get("pattern"))

        handler: Handler
        if handler_type == "console":
            handler = ConsoleHandler(level=level, formatter=formatter)
        elif handler_type == "file":
            handler = FileHandler(
                filepath=config["filepath"],
                level=level,
                formatter=formatter,
            )
        elif handler_type == "rotating_file":
            handler = RotatingFileHandler(
                filepath=config["filepath"],
                max_bytes=config.get("max_bytes", 10 * 1024 * 1024),
                backup_count=config.get("backup_count", 5),
                level=level,
                formatter=formatter,
            )
        elif handler_type == "http":
            handler = HTTPHandler(
                url=config["url"],
                level=level,
                formatter=formatter,
            )
        else:
            raise ValueError(f"Unknown handler type: {handler_type}")

        if config.get("async", False):
            async_handler = AsyncHandler(handler)
            async_handler.start()
            return async_handler

        return handler

    @classmethod
    def reset(cls) -> None:
        """Reset singleton (useful for testing)."""
        cls._instance = None
```

---

## 9. Interview Walkthrough

### Usage Demo

```python
# Setup via configuration
manager = LogManager()
manager.configure({
    "root": {
        "level": "INFO",
        "handlers": [
            {"type": "console", "formatter": "text"},
        ],
    },
    "loggers": {
        "app": {
            "level": "DEBUG",
            "handlers": [
                {
                    "type": "file",
                    "filepath": "/tmp/app.log",
                    "formatter": "json",
                    "level": "DEBUG",
                },
            ],
        },
        "app.db": {
            "level": "WARNING",
        },
    },
})

# Get loggers
app_logger = manager.get_logger("app")
db_logger = manager.get_logger("app.db")
auth_logger = manager.get_logger("app.auth")

# Basic logging
app_logger.info("Application started")
app_logger.debug("Debug info (visible, app level is DEBUG)")

# db_logger inherits WARNING from config
db_logger.debug("This is filtered out")
db_logger.warning("Slow query detected", query="SELECT *", duration="3.2s")

# auth_logger inherits DEBUG from app (its parent)
auth_logger.info("User login attempt", user="alice")

# Context propagation across a request
LogContext.set(request_id="req-abc-123", user_id="user-42")
auth_logger.info("Authentication successful")
auth_logger.info("Loading dashboard")
LogContext.clear()

# Using context manager
with LogContext.context_manager(request_id="req-def-456"):
    app_logger.info("Processing payment")
    app_logger.error("Payment failed", reason="timeout")

# Structured JSON logging
json_logger = Logger("structured", LogLevel.DEBUG)
json_logger.add_handler(
    ConsoleHandler(formatter=JsonFormatter(), level=LogLevel.DEBUG)
)
json_logger.info("Order placed", order_id="ORD-100", amount="59.99")
```

### Output Examples

**Text format:**
```
[2024-03-15 10:30:45.123] INFO     app - Application started
[2024-03-15 10:30:45.124] WARNING  app.db - Slow query detected | query=SELECT * duration=3.2s
[2024-03-15 10:30:45.125] INFO     app.auth - Authentication successful | request_id=req-abc-123 user_id=user-42
```

**JSON format:**
```json
{"timestamp": "2024-03-15T10:30:45.126", "level": "INFO", "logger": "structured", "message": "Order placed", "context": {"order_id": "ORD-100", "amount": "59.99"}}
```

---

## 10. Common Follow-Up Questions

### "How would you handle log rotation by time instead of size?"

Add a `TimedRotatingFileHandler` that checks the current date/hour on each emit. When the
period rolls over, rotate the file and name it with the timestamp (e.g., `app.log.2024-03-15`).
Use a separate timer thread or check on each write.

### "How would you handle structured exceptions in logs?"

Add an optional `exception` field to `LogRecord`. When `logger.error("msg", exc=e)` is called,
capture the traceback via `traceback.format_exception()` and include it in the record. The
`JsonFormatter` serializes it as a string array.

### "How would you implement log sampling for high-throughput services?"

Add a `SamplingHandler` decorator that accepts a `rate` (e.g., 0.01 for 1%). On each
`should_handle()` call, use a random check. For deterministic sampling, hash the
request ID and use modulo.

### "How would you ensure no log data is lost during crashes?"

Use write-ahead buffering: flush to disk after every N records or every M milliseconds.
For critical logs, use `fsync()` after every write. The `AsyncHandler` should drain its
queue on `SIGTERM`.

### "How would you add log correlation across microservices?"

Propagate a `trace_id` via HTTP headers. At each service boundary, extract the trace ID
and set it in `LogContext`. All logs within that request chain share the same trace ID,
enabling cross-service log correlation.

---

## 11. Gotchas

- **Level check before record creation.** The `if level < self.effective_level: return`
  fast path in `Logger.log()` is critical for performance. Without it, you create
  `LogRecord` objects that are immediately discarded.

- **Propagation loops.** If you accidentally set a logger as its own ancestor, propagation
  loops forever. Always validate the hierarchy is acyclic in `LogManager.get_logger()`.

- **File handler thread safety.** Multiple threads writing to the same file handler must
  go through a lock. The base `Handler.handle()` method acquires a lock before calling
  `emit()`. Never call `emit()` directly from outside.

- **Async handler shutdown.** If the process exits without calling `stop()`, queued
  records are lost. Register `AsyncHandler.stop()` with `atexit` or use a daemon
  thread (which Python kills on exit, accepting data loss).

- **Context leaking between requests.** In thread-pool-based servers, a thread is reused
  for multiple requests. Always clear `LogContext` at the start of each request, or use
  the context manager pattern.

- **JSON formatter must handle non-serializable values.** Use `default=str` in
  `json.dumps()` to avoid crashes on datetime, Decimal, or custom objects.

- **Rotating file handler race.** If two threads trigger rotation simultaneously, both
  may try to rename the same file. The lock in `Handler.handle()` prevents this, but
  only if rotation happens inside `emit()`.

---

## 12. Quick Reference

```
+----------------------------+----------------------------------------+
| Entity                     | Key Responsibility                     |
+----------------------------+----------------------------------------+
| LogLevel (IntEnum)         | Severity: DEBUG < INFO < WARN < ERROR  |
| LogRecord                  | Immutable log entry with context       |
| Logger                     | Named logger with level + handlers     |
| Handler (ABC)              | Write records to a destination         |
| Formatter (ABC)            | Serialize records to text/JSON         |
| LogManager (Singleton)     | Create/manage logger hierarchy         |
| LogContext (Thread-local)  | Propagate context across log calls     |
| AsyncHandler (Decorator)   | Non-blocking queue + background thread |
+----------------------------+----------------------------------------+

Handler Types:
+------------------+------------------------------+-------------------+
| Handler          | Destination                  | Use Case          |
+------------------+------------------------------+-------------------+
| ConsoleHandler   | stdout/stderr                | Development       |
| FileHandler      | Single file                  | Simple logging    |
| RotatingFile     | File with size rotation      | Production        |
| HTTPHandler      | Remote endpoint              | Log aggregation   |
| AsyncHandler     | Wraps any handler with queue | High throughput   |
+------------------+------------------------------+-------------------+

Logger Hierarchy (level inheritance):
  root (WARNING)
    |
    +-- app (DEBUG) .............. explicit level
    |     |
    |     +-- app.auth (inherited DEBUG)
    |     |
    |     +-- app.db (WARNING) .. explicit override
    |
    +-- lib (inherited WARNING)

Patterns used:
- Singleton         -> LogManager (global registry)
- Chain of Resp.    -> Logger propagation to parent handlers
- Strategy          -> Formatter (Text, JSON, custom)
- Decorator         -> AsyncHandler wraps any Handler
- Factory           -> LogManager._create_handler()
- Thread-local      -> LogContext for request correlation
- Producer-Consumer -> AsyncHandler queue + worker thread
```
