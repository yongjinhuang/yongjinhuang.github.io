# Chapter 15: Trading Infrastructure and Data Pipelines

## The Invisible Engine Behind Every Trade

The best alpha signal in the world is worthless if your data is stale, your system crashes at market open, or your pipeline drops ticks during volatility spikes. Infrastructure is the unsexy foundation upon which profitable trading is built. At firms like Two Sigma, DE Shaw, and Citadel, infrastructure engineers are among the highest-paid --- because a single hour of downtime can cost millions.

This chapter covers everything from high-level architecture to the nuts and bolts of building reliable, scalable trading systems. Whether you are building a personal trading stack or designing production infrastructure at a fund, these principles apply.

```
+------------------------------------------------------------------------+
|              TRADING INFRASTRUCTURE - THE FULL PICTURE                   |
+------------------------------------------------------------------------+
|                                                                        |
|  EXTERNAL DATA                                                         |
|  +----------------+  +----------------+  +----------------+            |
|  | Exchange Feeds  |  | Alt Data       |  | News / Filings |            |
|  | (tick, L2, L3)  |  | (satellite,    |  | (SEC, earnings)|            |
|  |                 |  |  web scraping)  |  |                |            |
|  +-------+--------+  +-------+--------+  +-------+--------+            |
|          |                    |                    |                     |
|          v                    v                    v                     |
|  +------------------------------------------------------+              |
|  |              DATA INGESTION LAYER                      |              |
|  |   Feed Handlers | API Clients | Scrapers | Parsers     |              |
|  +------------------------------------------------------+              |
|                              |                                          |
|                              v                                          |
|  +------------------------------------------------------+              |
|  |              DATA STORAGE & PROCESSING                 |              |
|  |   Time-Series DB | Object Store | Stream Processing    |              |
|  +------------------------------------------------------+              |
|                              |                                          |
|          +-------------------+-------------------+                      |
|          v                   v                   v                      |
|  +---------------+  +---------------+  +---------------+               |
|  | RESEARCH      |  | LIVE TRADING  |  | RISK & MONITOR|               |
|  | (backtest,    |  | (signal gen,  |  | (P&L, limits, |               |
|  |  ML training) |  |  execution)   |  |  alerting)    |               |
|  +---------------+  +---------------+  +---------------+               |
|                                                                        |
+------------------------------------------------------------------------+
```

---

## 15.1 Trading System Architecture

### High-Level Architecture of a Quant Firm

Every quant trading operation, from a solo trader to a multi-billion-dollar fund, follows the same fundamental data flow:

```
DATA FLOW: INGESTION --> PROCESSING --> SIGNALS --> EXECUTION --> RISK
=======================================================================

  Raw Market Data          Clean Data          Alpha             Orders
  +-----------+          +-----------+      +---------+      +----------+
  | Exchanges  |--ingest->| Normalize |--calc->| Signals |--route->| Execute  |
  | Alt Data   |          | Validate  |        | Combine |         | Monitor  |
  | News       |          | Store     |        | Size    |         | Settle   |
  +-----------+          +-----------+      +---------+      +----------+
                                                                   |
                                                                   v
                                                              +---------+
                                                              | RISK    |
                                                              | P&L     |
                                                              | Limits  |
                                                              +---------+
```

### Monolith vs. Microservices

| Aspect     | Monolith                | Microservices                   |
| ---------- | ----------------------- | ------------------------------- |
| Latency    | Lower (no network hops) | Higher (serialization overhead) |
| Deployment | All-or-nothing          | Independent per service         |
| Debugging  | Easier (single process) | Harder (distributed tracing)    |
| Scaling    | Vertical only           | Horizontal per component        |
| Best for   | HFT, small teams        | Multi-strategy, large teams     |

Most quant firms use a **hybrid**: a monolithic trading core (for latency) with microservices for research, risk, and reporting.

```
HYBRID ARCHITECTURE
====================

  Microservices (loose coupling)         Monolith (tight coupling)
  +----------------------------------+   +---------------------------+
  |                                  |   |     TRADING CORE          |
  |  +----------+   +----------+    |   |  +--------+  +--------+  |
  |  | Research  |   | Risk     |    |   |  | Signal |->| Order  |  |
  |  | Platform  |   | Dashboard|    |   |  | Engine |  | Manager|  |
  |  +----------+   +----------+    |   |  +--------+  +--------+  |
  |                                  |   |       |           |      |
  |  +----------+   +----------+    |   |  +--------+  +--------+  |
  |  | Data     |   | Reporting|    |   |  | Risk   |->| Router |  |
  |  | Pipeline |   | Service  |    |   |  | Check  |  |        |  |
  |  +----------+   +----------+    |   |  +--------+  +--------+  |
  |                                  |   |                          |
  +----------------------------------+   +---------------------------+
           |                                       ^
           +----------- shared data layer ---------+
```

### Hot Path vs. Cold Path Separation

The **hot path** handles real-time, latency-sensitive operations. The **cold path** handles everything else. Mixing them is the #1 infrastructure mistake.

```
HOT PATH (microseconds matter)          COLD PATH (seconds/minutes OK)
===================================     ===================================
 - Market data processing                - Historical data loading
 - Signal computation                    - Backtest execution
 - Order routing                         - Risk report generation
 - Pre-trade risk checks                 - EOD reconciliation
 - Fill processing                       - Model training
                                         - Compliance reporting

CRITICAL RULE: Never let cold path operations block the hot path.

  Example violation:                     Correct design:
  +-------------+                        +-------------+
  | Hot Path    |                        | Hot Path    |
  |  - tick     |---log to disk--->X     |  - tick     |---async queue--->+
  |    handler  |   (blocks on I/O!)     |    handler  |                  |
  +-------------+                        +-------------+                  v
                                                                  +----------+
                                                                  | Cold Path|
                                                                  | Logger   |
                                                                  +----------+
```

**Implementation pattern**: Use lock-free ring buffers or async message queues (Disruptor pattern) to bridge hot and cold paths.

```python
import asyncio
from collections import deque
from dataclasses import dataclass
from typing import Any

@dataclass(frozen=True)
class MarketEvent:
    timestamp: float
    symbol: str
    price: float
    volume: int

class HotColdBridge:
    """Lock-free bridge between hot and cold paths using asyncio."""

    def __init__(self, max_size: int = 100_000):
        self._buffer: deque[MarketEvent] = deque(maxlen=max_size)
        self._dropped = 0

    def publish(self, event: MarketEvent) -> bool:
        """Hot path: non-blocking publish. Returns False if buffer full."""
        if len(self._buffer) >= self._buffer.maxlen:
            self._dropped += 1
            return False
        self._buffer.append(event)
        return True

    async def consume_batch(self, batch_size: int = 1000) -> list[MarketEvent]:
        """Cold path: consume events in batches."""
        batch = []
        for _ in range(min(batch_size, len(self._buffer))):
            try:
                batch.append(self._buffer.popleft())
            except IndexError:
                break
        return batch
```

---

## 15.2 Market Data Infrastructure

### Real-Time Feed Architecture

```
MARKET DATA FEED ARCHITECTURE
===============================

  Exchange A (ITCH)     Exchange B (FIX)     Exchange C (OUCH)
       |                     |                     |
       v                     v                     v
  +---------+           +---------+           +---------+
  | Feed    |           | Feed    |           | Feed    |
  | Handler |           | Handler |           | Handler |
  | (parse) |           | (parse) |           | (parse) |
  +---------+           +---------+           +---------+
       |                     |                     |
       +----------+----------+----------+----------+
                  |                     |
                  v                     v
          +---------------+     +---------------+
          | Ticker Plant  |     | Tick Store    |
          | (normalize,   |     | (persist to   |
          |  distribute)  |     |  time-series) |
          +-------+-------+     +---------------+
                  |
      +-----------+-----------+
      |           |           |
      v           v           v
  +--------+ +--------+ +--------+
  | Strat1 | | Strat2 | | Risk   |
  +--------+ +--------+ +--------+
```

### Historical Data Storage

Choosing the right storage format is critical. Here is a comparison:

| Format           | Read Speed | Write Speed | Compression | Query        | Best For                      |
| ---------------- | ---------- | ----------- | ----------- | ------------ | ----------------------------- |
| HDF5             | Fast       | Fast        | Good        | Limited      | Research, fixed schemas       |
| Parquet          | Very fast  | Moderate    | Excellent   | Column-level | Large datasets, analytics     |
| TimescaleDB      | Fast       | Fast        | Good        | Full SQL     | Production, real-time queries |
| Arctic (MongoDB) | Moderate   | Fast        | Good        | Flexible     | Versioned data, notebooks     |
| CSV              | Slow       | Slow        | None        | None         | Never in production           |

```python
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from pathlib import Path
from datetime import date

class TickDataStore:
    """Partitioned Parquet store for tick data."""

    def __init__(self, base_path: str):
        self.base_path = Path(base_path)

    def _partition_path(self, symbol: str, dt: date) -> Path:
        return self.base_path / f"symbol={symbol}" / f"date={dt.isoformat()}"

    def write_ticks(self, symbol: str, dt: date, df: pd.DataFrame) -> None:
        """Write a day of tick data as Parquet with compression."""
        path = self._partition_path(symbol, dt)
        path.mkdir(parents=True, exist_ok=True)
        table = pa.Table.from_pandas(df)
        pq.write_table(
            table,
            path / "data.parquet",
            compression="zstd",
            use_dictionary=True,
        )

    def read_ticks(self, symbol: str, dt: date) -> pd.DataFrame:
        """Read a day of tick data."""
        path = self._partition_path(symbol, dt) / "data.parquet"
        if not path.exists():
            return pd.DataFrame()
        return pq.read_table(path).to_pandas()

    def read_range(self, symbol: str, start: date, end: date) -> pd.DataFrame:
        """Read tick data for a date range using predicate pushdown."""
        dataset = pq.ParquetDataset(
            self.base_path,
            filters=[
                ("symbol", "=", symbol),
                ("date", ">=", start.isoformat()),
                ("date", "<=", end.isoformat()),
            ],
        )
        return dataset.read().to_pandas()
```

### Data Normalization

Raw exchange data is messy. You must normalize it before consumption:

```python
from dataclasses import dataclass
from decimal import Decimal
from enum import Enum

class Exchange(Enum):
    NYSE = "NYSE"
    NASDAQ = "NASDAQ"
    BATS = "BATS"

@dataclass(frozen=True)
class NormalizedTrade:
    timestamp_ns: int        # Nanosecond Unix timestamp
    symbol: str              # Normalized symbol (e.g., "AAPL")
    price: Decimal           # Use Decimal to avoid float errors
    size: int                # Share count
    exchange: Exchange
    conditions: tuple[str, ...]  # Trade conditions (e.g., odd lot)

def normalize_nasdaq_trade(raw: dict) -> NormalizedTrade:
    """Convert raw NASDAQ ITCH trade to normalized format."""
    return NormalizedTrade(
        timestamp_ns=raw["timestamp"],
        symbol=raw["stock"].strip(),
        price=Decimal(str(raw["price"])) / Decimal("10000"),
        size=raw["shares"],
        exchange=Exchange.NASDAQ,
        conditions=_parse_conditions(raw.get("match_flags", 0)),
    )

def _parse_conditions(flags: int) -> tuple[str, ...]:
    conditions = []
    if flags & 0x01:
        conditions.append("odd_lot")
    if flags & 0x02:
        conditions.append("intermarket_sweep")
    return tuple(conditions)
```

### Corporate Actions

Corporate actions (splits, dividends, mergers) corrupt historical data if not handled:

```
CORPORATE ACTION ADJUSTMENT
=============================

Stock split 2:1 on 2024-06-01:
  Before adjustment:        After adjustment:
  Date        Price          Date        Price
  2024-05-30  $200           2024-05-30  $100   <-- adjusted
  2024-05-31  $198           2024-05-31  $99    <-- adjusted
  2024-06-01  $100           2024-06-01  $100   <-- split date
  2024-06-02  $102           2024-06-02  $102

  Split factor = 1/2 applied to all pre-split prices
  Volume is multiplied by inverse factor (2x)
```

```python
from dataclasses import dataclass
from decimal import Decimal

@dataclass(frozen=True)
class CorporateAction:
    effective_date: str
    symbol: str
    action_type: str       # "split", "dividend", "merger"
    factor: Decimal        # Adjustment factor

def adjust_prices(
    prices: list[dict],
    actions: list[CorporateAction],
) -> list[dict]:
    """Apply corporate action adjustments to historical prices."""
    sorted_actions = sorted(actions, key=lambda a: a.effective_date, reverse=True)
    adjusted = []
    for row in prices:
        cumulative_factor = Decimal("1")
        for action in sorted_actions:
            if row["date"] < action.effective_date:
                cumulative_factor *= action.factor
        adjusted.append({
            **row,
            "adj_close": row["close"] * cumulative_factor,
            "adj_volume": int(row["volume"] / cumulative_factor),
        })
    return adjusted
```

### Data Quality Checks

Never trust raw data. Validate everything:

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class QualityReport:
    symbol: str
    date: str
    total_ticks: int
    null_count: int
    duplicate_count: int
    gap_count: int
    outlier_count: int
    passed: bool

def check_tick_quality(df, symbol: str, date: str) -> QualityReport:
    """Run data quality checks on a day of tick data."""
    null_count = int(df.isnull().sum().sum())
    duplicate_count = int(df.duplicated().sum())

    # Check for timestamp gaps > 5 minutes during market hours
    timestamps = df["timestamp"].sort_values()
    gaps = timestamps.diff()
    gap_count = int((gaps > pd.Timedelta(minutes=5)).sum())

    # Check for price outliers (>10 std from rolling mean)
    rolling_mean = df["price"].rolling(100).mean()
    rolling_std = df["price"].rolling(100).std()
    outliers = (df["price"] - rolling_mean).abs() > 10 * rolling_std
    outlier_count = int(outliers.sum())

    passed = (
        null_count == 0
        and duplicate_count == 0
        and gap_count == 0
        and outlier_count < 5
    )

    return QualityReport(
        symbol=symbol,
        date=date,
        total_ticks=len(df),
        null_count=null_count,
        duplicate_count=duplicate_count,
        gap_count=gap_count,
        outlier_count=outlier_count,
        passed=passed,
    )
```

---

## 15.3 Data Pipelines

### ETL for Financial Data

```
FINANCIAL DATA ETL PIPELINE
==============================

  EXTRACT                TRANSFORM               LOAD
  +------------------+   +------------------+   +------------------+
  | Exchange feeds   |   | Parse protocols  |   | Time-series DB   |
  | Vendor APIs      |-->| Normalize symbols|-->| Parquet files    |
  | SEC filings      |   | Apply corp acts  |   | Feature store    |
  | Alt data sources |   | Quality checks   |   | Research cache   |
  +------------------+   +------------------+   +------------------+
         |                       |                       |
         v                       v                       v
    Idempotent            Deterministic            Partitioned
    Retryable             Versioned                Compressed
    Logged                Tested                   Indexed
```

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

@dataclass(frozen=True)
class PipelineResult:
    stage: str
    records_in: int
    records_out: int
    errors: tuple[str, ...]
    duration_ms: float

class PipelineStage(ABC):
    """Base class for ETL pipeline stages."""

    @abstractmethod
    def process(self, data: list[dict]) -> tuple[list[dict], list[str]]:
        """Process data, return (results, errors)."""
        ...

class NormalizeStage(PipelineStage):
    def process(self, data: list[dict]) -> tuple[list[dict], list[str]]:
        results, errors = [], []
        for record in data:
            try:
                results.append({
                    **record,
                    "symbol": record["symbol"].strip().upper(),
                    "price": round(float(record["price"]), 6),
                    "timestamp": self._parse_timestamp(record["timestamp"]),
                })
            except (KeyError, ValueError) as e:
                errors.append(f"Normalization error: {e}")
        return results, errors

    def _parse_timestamp(self, ts: Any) -> datetime:
        if isinstance(ts, datetime):
            return ts
        if isinstance(ts, (int, float)):
            return datetime.fromtimestamp(ts)
        return datetime.fromisoformat(str(ts))

class QualityGateStage(PipelineStage):
    def __init__(self, max_null_pct: float = 0.01):
        self.max_null_pct = max_null_pct

    def process(self, data: list[dict]) -> tuple[list[dict], list[str]]:
        if not data:
            return [], ["Empty dataset"]
        null_count = sum(
            1 for row in data
            if any(v is None for v in row.values())
        )
        null_pct = null_count / len(data)
        if null_pct > self.max_null_pct:
            return [], [f"Null rate {null_pct:.2%} exceeds {self.max_null_pct:.2%}"]
        clean = [row for row in data if all(v is not None for v in row.values())]
        return clean, []

class Pipeline:
    """Composable ETL pipeline with error tracking."""

    def __init__(self, stages: list[PipelineStage]):
        self._stages = stages

    def run(self, data: list[dict]) -> list[PipelineResult]:
        results = []
        current_data = data
        for stage in self._stages:
            start = datetime.now()
            records_in = len(current_data)
            current_data, errors = stage.process(current_data)
            elapsed = (datetime.now() - start).total_seconds() * 1000
            results.append(PipelineResult(
                stage=type(stage).__name__,
                records_in=records_in,
                records_out=len(current_data),
                errors=tuple(errors),
                duration_ms=elapsed,
            ))
            if not current_data:
                break
        return results
```

### Real-Time Streaming with Kafka and Redis

```
REAL-TIME DATA STREAMING
=========================

  Producers              Message Bus              Consumers
  +----------+                                   +----------+
  | Exchange  |--+                           +-->| Strategy |
  | Feed      |  |   +------------------+   |   | Engine   |
  +----------+  +-->|                  |---+   +----------+
                     |   Kafka Cluster  |
  +----------+  +-->|   (partitioned   |---+   +----------+
  | News     |  |   |    by symbol)    |   +-->| Risk     |
  | Feed     |--+   +------------------+       | Monitor  |
  +----------+             |                   +----------+
                           v
                    +-------------+                +----------+
                    | Redis Cache |<-- latest ----->| Dashboard|
                    | (NBBO, last |    state        |          |
                    |  price)     |                 +----------+
                    +-------------+
```

```python
import json
import time
from dataclasses import dataclass, asdict

@dataclass(frozen=True)
class TickEvent:
    symbol: str
    price: float
    volume: int
    timestamp: float
    exchange: str

class MarketDataPublisher:
    """Publishes market data to Kafka and caches latest in Redis."""

    def __init__(self, kafka_producer, redis_client):
        self._kafka = kafka_producer
        self._redis = redis_client

    def publish_tick(self, tick: TickEvent) -> None:
        """Publish tick to Kafka topic partitioned by symbol."""
        payload = json.dumps(asdict(tick)).encode("utf-8")
        self._kafka.produce(
            topic="market-data.ticks",
            key=tick.symbol.encode("utf-8"),
            value=payload,
        )
        # Update latest price in Redis (for dashboard / last-price lookups)
        self._redis.hset(f"latest:{tick.symbol}", mapping={
            "price": str(tick.price),
            "volume": str(tick.volume),
            "timestamp": str(tick.timestamp),
            "exchange": tick.exchange,
        })
        self._redis.expire(f"latest:{tick.symbol}", 86400)

class MarketDataConsumer:
    """Consumes market data from Kafka with exactly-once semantics."""

    def __init__(self, kafka_consumer, handler_fn):
        self._consumer = kafka_consumer
        self._handler = handler_fn

    def run(self) -> None:
        """Main consumption loop with error handling."""
        self._consumer.subscribe(["market-data.ticks"])
        try:
            while True:
                msg = self._consumer.poll(timeout=1.0)
                if msg is None:
                    continue
                if msg.error():
                    self._handle_error(msg.error())
                    continue
                tick = TickEvent(**json.loads(msg.value()))
                self._handler(tick)
                self._consumer.commit(message=msg)
        except KeyboardInterrupt:
            pass
        finally:
            self._consumer.close()

    def _handle_error(self, error) -> None:
        # Log error, increment metric, potentially alert
        pass
```

### Batch Processing (Daily EOD Pipeline)

```python
from dataclasses import dataclass
from datetime import date
from typing import Protocol

class DataSource(Protocol):
    def fetch(self, symbol: str, dt: date) -> list[dict]: ...

class DataSink(Protocol):
    def write(self, symbol: str, dt: date, data: list[dict]) -> None: ...

@dataclass(frozen=True)
class EODPipelineConfig:
    symbols: tuple[str, ...]
    sources: tuple[str, ...]       # "yahoo", "polygon", "iex"
    quality_threshold: float       # Min quality score (0-1)
    retry_count: int = 3
    retry_delay_seconds: int = 5

class EODPipeline:
    """Daily end-of-day data pipeline with reconciliation."""

    def __init__(
        self,
        config: EODPipelineConfig,
        primary_source: DataSource,
        validation_source: DataSource,
        sink: DataSink,
    ):
        self._config = config
        self._primary = primary_source
        self._validation = validation_source
        self._sink = sink

    def run_for_date(self, dt: date) -> dict[str, str]:
        """Process all symbols for a given date. Returns status per symbol."""
        statuses = {}
        for symbol in self._config.symbols:
            statuses[symbol] = self._process_symbol(symbol, dt)
        return statuses

    def _process_symbol(self, symbol: str, dt: date) -> str:
        primary_data = self._primary.fetch(symbol, dt)
        if not primary_data:
            return "NO_DATA"

        validation_data = self._validation.fetch(symbol, dt)
        if not self._reconcile(primary_data, validation_data):
            return "RECONCILIATION_FAILED"

        self._sink.write(symbol, dt, primary_data)
        return "SUCCESS"

    def _reconcile(self, primary: list[dict], secondary: list[dict]) -> bool:
        """Cross-validate data between two sources."""
        if not secondary:
            return True  # No validation source, pass through
        p_close = primary[-1].get("close", 0)
        s_close = secondary[-1].get("close", 0)
        if s_close == 0:
            return True
        deviation = abs(p_close - s_close) / s_close
        return deviation < 0.01  # 1% tolerance
```

### Pipeline Monitoring

```
PIPELINE MONITORING DASHBOARD
================================

  +------------------------------------------------------------+
  |  Pipeline: EOD Market Data       Status: RUNNING            |
  +------------------------------------------------------------+
  |                                                            |
  |  Stage              Records    Errors   Duration   Status  |
  |  ---------------    -------    ------   --------   ------  |
  |  Extract            10,542      3       2.3s       DONE    |
  |  Normalize          10,539      0       0.8s       DONE    |
  |  Quality Gate       10,539      12      1.1s       DONE    |
  |  Corp Actions       10,527      0       0.3s       RUNNING |
  |  Load               --          --      --         PENDING |
  |                                                            |
  |  Overall: 73% complete | ETA: 1.2s | Errors: 15           |
  +------------------------------------------------------------+
```

---

## 15.4 Compute Infrastructure

### Environment Overview

```
COMPUTE INFRASTRUCTURE LAYERS
================================

  +------------------------------------------------------------------+
  |                                                                  |
  |  RESEARCH (latency: seconds-hours)                               |
  |  +------------------+  +------------------+  +----------------+  |
  |  | JupyterHub       |  | Backtest Cluster |  | ML Training    |  |
  |  | (notebooks,      |  | (distributed     |  | (GPU nodes,    |  |
  |  |  exploration)    |  |  simulation)     |  |  PyTorch)      |  |
  |  +------------------+  +------------------+  +----------------+  |
  |                                                                  |
  |  STAGING (latency: milliseconds)                                 |
  |  +------------------+  +------------------+  +----------------+  |
  |  | Paper Trading    |  | Shadow Mode      |  | A/B Testing    |  |
  |  | (sim exchange)   |  | (mirror prod)    |  | (canary deploy)|  |
  |  +------------------+  +------------------+  +----------------+  |
  |                                                                  |
  |  PRODUCTION (latency: microseconds)                              |
  |  +------------------+  +------------------+  +----------------+  |
  |  | Trading Servers  |  | Risk Servers     |  | Gateway / OMS  |  |
  |  | (co-located,     |  | (redundant,      |  | (FIX engine,   |  |
  |  |  bare metal)     |  |  hot standby)    |  |  drop copy)    |  |
  |  +------------------+  +------------------+  +----------------+  |
  |                                                                  |
  +------------------------------------------------------------------+
```

### Cloud vs. On-Premise vs. Co-Located

```
DEPLOYMENT MODEL COMPARISON
=============================

                Cloud (AWS/GCP)      On-Premise          Co-Located
  Cost          Pay-per-use          High upfront        Very high upfront
  Latency       10-50 ms to exch.    1-10 ms to exch.    <100 us to exch.
  Scaling       Elastic              Fixed capacity       Fixed capacity
  Control       Limited              Full                 Full
  Best for      Research, low-freq   Med-freq trading     HFT, market making

  RECOMMENDED HYBRID:
  +---------------------+
  | Cloud (AWS)         |   <-- Research, backtesting, data storage
  |  - JupyterHub       |
  |  - ML training      |
  |  - Data warehouse   |
  +---------------------+
           |
           | VPN / Direct Connect
           v
  +---------------------+
  | Co-located          |   <-- Live trading
  |  - Trading engine   |
  |  - Feed handlers    |
  |  - Risk engine      |
  +---------------------+
```

### Docker and Kubernetes for Trading

```yaml
# docker-compose.yml - Development trading stack
version: '3.9'
services:
  timescaledb:
    image: timescale/timescaledb:latest-pg16
    environment:
      POSTGRES_PASSWORD: '${DB_PASSWORD}'
      POSTGRES_DB: trading
    ports:
      - '5432:5432'
    volumes:
      - tsdb_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru

  kafka:
    image: confluentinc/cp-kafka:7.6.0
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
    depends_on:
      - zookeeper

  zookeeper:
    image: confluentinc/cp-zookeeper:7.6.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  grafana:
    image: grafana/grafana:latest
    ports:
      - '3000:3000'
    volumes:
      - grafana_data:/var/lib/grafana

  prometheus:
    image: prom/prometheus:latest
    ports:
      - '9090:9090'
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

volumes:
  tsdb_data:
  grafana_data:
```

### Backtesting Cluster

```python
from dataclasses import dataclass
from datetime import date
from typing import Callable
import multiprocessing as mp

@dataclass(frozen=True)
class BacktestTask:
    strategy_id: str
    symbol_universe: tuple[str, ...]
    start_date: date
    end_date: date
    parameters: dict

@dataclass(frozen=True)
class BacktestResult:
    strategy_id: str
    sharpe_ratio: float
    total_return: float
    max_drawdown: float
    num_trades: int

def run_single_backtest(task: BacktestTask) -> BacktestResult:
    """Run a single backtest (placeholder for actual engine)."""
    # In production, this would load data, run the strategy, and compute metrics
    return BacktestResult(
        strategy_id=task.strategy_id,
        sharpe_ratio=0.0,
        total_return=0.0,
        max_drawdown=0.0,
        num_trades=0,
    )

class BacktestCluster:
    """Parallel backtest execution across CPU cores."""

    def __init__(self, num_workers: int | None = None):
        self._num_workers = num_workers or mp.cpu_count()

    def run_sweep(self, tasks: list[BacktestTask]) -> list[BacktestResult]:
        """Run parameter sweep in parallel."""
        with mp.Pool(self._num_workers) as pool:
            results = pool.map(run_single_backtest, tasks)
        return results
```

---

## 15.5 Monitoring and Alerting

### What to Monitor

```
MONITORING LAYERS
==================

  Layer 1: SYSTEM HEALTH                Layer 2: APPLICATION HEALTH
  - CPU, memory, disk, network          - Process uptime
  - Network latency to exchanges        - Queue depths
  - Kernel-bypass NIC stats             - Message throughput
  - Clock synchronization (PTP/NTP)     - Error rates

  Layer 3: TRADING METRICS              Layer 4: BUSINESS METRICS
  - P&L (real-time, EOD)               - Sharpe ratio (rolling)
  - Position sizes                      - Strategy alpha decay
  - Gross/net exposure                  - Fill rate
  - Order rejection rate                - Market impact
  - Latency percentiles (p50/p99)       - Capacity utilization
```

### Prometheus Metrics for Trading

```python
from dataclasses import dataclass
from time import time
from typing import Protocol

class MetricsBackend(Protocol):
    def counter(self, name: str, value: float, labels: dict) -> None: ...
    def gauge(self, name: str, value: float, labels: dict) -> None: ...
    def histogram(self, name: str, value: float, labels: dict) -> None: ...

class TradingMetrics:
    """Exposes trading metrics for Prometheus scraping."""

    def __init__(self, backend: MetricsBackend):
        self._backend = backend

    def record_order_sent(self, strategy: str, symbol: str, side: str) -> None:
        self._backend.counter(
            "orders_sent_total",
            1,
            {"strategy": strategy, "symbol": symbol, "side": side},
        )

    def record_fill(
        self, strategy: str, symbol: str, price: float, qty: int
    ) -> None:
        self._backend.counter(
            "fills_total", 1, {"strategy": strategy, "symbol": symbol}
        )
        self._backend.counter(
            "filled_notional_total",
            price * qty,
            {"strategy": strategy, "symbol": symbol},
        )

    def record_latency(self, stage: str, duration_us: float) -> None:
        self._backend.histogram(
            "processing_latency_us",
            duration_us,
            {"stage": stage},
        )

    def update_position(self, strategy: str, symbol: str, qty: int) -> None:
        self._backend.gauge(
            "position_shares",
            float(qty),
            {"strategy": strategy, "symbol": symbol},
        )

    def update_pnl(self, strategy: str, pnl: float) -> None:
        self._backend.gauge(
            "realized_pnl_usd",
            pnl,
            {"strategy": strategy},
        )
```

### Alerting Rules

```yaml
# prometheus/alert_rules.yml
groups:
  - name: trading_alerts
    rules:
      # Critical: Trading engine down
      - alert: TradingEngineDown
        expr: up{job="trading-engine"} == 0
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: 'Trading engine is down'
          runbook: 'https://wiki/runbooks/trading-engine-down'

      # High: Latency spike
      - alert: HighLatency
        expr: histogram_quantile(0.99, processing_latency_us) > 1000
        for: 2m
        labels:
          severity: high
        annotations:
          summary: 'P99 latency exceeds 1ms'

      # High: P&L drawdown
      - alert: PnLDrawdown
        expr: realized_pnl_usd < -50000
        for: 1m
        labels:
          severity: high
        annotations:
          summary: 'Strategy P&L below -$50K threshold'

      # Medium: High rejection rate
      - alert: HighRejectionRate
        expr: rate(order_rejections_total[5m]) / rate(orders_sent_total[5m]) > 0.05
        for: 5m
        labels:
          severity: medium
        annotations:
          summary: 'Order rejection rate exceeds 5%'

      # Medium: Data feed gap
      - alert: DataFeedGap
        expr: time() - last_tick_timestamp > 30
        for: 1m
        labels:
          severity: medium
        annotations:
          summary: 'No ticks received for 30+ seconds'
```

### Grafana Dashboard Layout

```
TRADING OPERATIONS DASHBOARD
===============================

  +----------------------------+----------------------------+
  |  REAL-TIME P&L             |  POSITION HEAT MAP          |
  |                            |                             |
  |  $125,432  (+1.2%)         |  AAPL  ████████  +$12K     |
  |  ____/\___/\_____          |  MSFT  ██████    +$8K      |
  |  /                \        |  GOOG  ████      +$5K      |
  |                            |  TSLA  ██        -$2K      |
  +----------------------------+----------------------------+
  |  LATENCY (p50/p99)        |  ORDER FLOW                 |
  |                            |                             |
  |  p50: 12 us               |  Sent: 1,234  Filled: 1,198|
  |  p99: 89 us               |  Rejected: 12  Pending: 24 |
  |  ___________________       |  Fill rate: 97.1%          |
  |  ____  ____    ___  spike  |                             |
  +----------------------------+----------------------------+
  |  SYSTEM HEALTH             |  ALERTS                     |
  |                            |                             |
  |  CPU: 34%  MEM: 62%       |  [WARN] Latency spike 14:02|
  |  DISK: 45% NET: 1.2 Gbps  |  [INFO] EOD recon complete |
  |  Feed: OK  OMS: OK        |  [OK]   All feeds connected |
  +----------------------------+----------------------------+
```

---

## 15.6 Logging and Audit

### Structured Logging

Unstructured logs are useless at scale. Use structured JSON logging:

```python
import json
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any

class LogLevel(Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"

@dataclass(frozen=True)
class LogEntry:
    timestamp: str
    level: str
    component: str
    message: str
    context: dict[str, Any]

class StructuredLogger:
    """JSON structured logger for trading systems."""

    def __init__(self, component: str, min_level: LogLevel = LogLevel.INFO):
        self._component = component
        self._min_level = min_level
        self._levels = list(LogLevel)

    def _should_log(self, level: LogLevel) -> bool:
        return self._levels.index(level) >= self._levels.index(self._min_level)

    def _emit(self, level: LogLevel, message: str, **kwargs: Any) -> None:
        if not self._should_log(level):
            return
        entry = LogEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            level=level.value,
            component=self._component,
            message=message,
            context=kwargs,
        )
        sys.stderr.write(json.dumps(asdict(entry)) + "\n")

    def info(self, message: str, **kwargs: Any) -> None:
        self._emit(LogLevel.INFO, message, **kwargs)

    def warn(self, message: str, **kwargs: Any) -> None:
        self._emit(LogLevel.WARN, message, **kwargs)

    def error(self, message: str, **kwargs: Any) -> None:
        self._emit(LogLevel.ERROR, message, **kwargs)

# Usage
logger = StructuredLogger("order-manager")
logger.info(
    "Order submitted",
    order_id="ORD-12345",
    symbol="AAPL",
    side="BUY",
    quantity=100,
    price=150.25,
    strategy="momentum-v2",
)
# Output:
# {"timestamp": "2024-06-15T14:30:00.123Z", "level": "INFO",
#  "component": "order-manager", "message": "Order submitted",
#  "context": {"order_id": "ORD-12345", "symbol": "AAPL", ...}}
```

### Trade Audit Trail

Regulatory requirements demand a complete, immutable audit trail of every order:

```python
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum

class OrderEvent(Enum):
    CREATED = "CREATED"
    SUBMITTED = "SUBMITTED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"

@dataclass(frozen=True)
class AuditEntry:
    event_id: str
    timestamp: str
    order_id: str
    event_type: str
    details: dict
    source: str          # "strategy", "risk", "exchange"
    user: str            # Who/what triggered it

class AuditTrail:
    """Append-only audit trail for regulatory compliance."""

    def __init__(self, storage_backend):
        self._storage = storage_backend

    def record(
        self,
        order_id: str,
        event_type: OrderEvent,
        source: str,
        user: str,
        **details,
    ) -> AuditEntry:
        entry = AuditEntry(
            event_id=self._generate_id(),
            timestamp=datetime.now(timezone.utc).isoformat(),
            order_id=order_id,
            event_type=event_type.value,
            details=details,
            source=source,
            user=user,
        )
        self._storage.append(entry)  # Append-only, never modify
        return entry

    def get_order_history(self, order_id: str) -> list[AuditEntry]:
        """Retrieve complete lifecycle of an order."""
        return self._storage.query(order_id=order_id)

    def _generate_id(self) -> str:
        import uuid
        return str(uuid.uuid4())
```

### ELK Stack for Log Analysis

```
LOG AGGREGATION ARCHITECTURE
==============================

  Trading Servers          Log Pipeline            Analysis
  +-----------+                                   +-----------+
  | Engine 1  |--+   +-----------+               | Kibana    |
  +-----------+  |   |           |   +--------+  | Dashboard |
                 +-->| Filebeat  |-->| Elastic |->|           |
  +-----------+  |   | (shipper) |   | Search  |  | - Trade   |
  | Engine 2  |--+   |           |   |         |  |   search  |
  +-----------+  |   +-----------+   +--------+  | - Error   |
                 |         |                      |   patterns|
  +-----------+  |         v                      | - Audit   |
  | Risk Srv  |--+   +-----------+               |   queries |
  +-----------+      | Logstash  |               +-----------+
                     | (parse,   |
                     |  enrich)  |
                     +-----------+

  Key Kibana Queries:
  - "Show all orders for AAPL in the last hour"
  - "Show all ERROR logs from risk-engine"
  - "Trace order ORD-12345 across all components"
  - "Show latency distribution by strategy"
```

---

## 15.7 Disaster Recovery

### Failover Patterns

```
ACTIVE-PASSIVE FAILOVER
=========================

  Normal Operation:
  +----------+       +----------+       +----------+
  | Primary  |------>| Exchange |       | Standby  |
  | (active) |<------| Gateway  |       | (passive)|
  +----+-----+       +----------+       +----+-----+
       |                                      |
       +---- heartbeat (every 100ms) ---------+
       |                                      |
       +---- state replication (async) -------+

  Failover (Primary down):
  +----------+       +----------+       +----------+
  | Primary  |  X    | Exchange |       | Standby  |
  | (DOWN)   |       | Gateway  |<----->| (ACTIVE) |
  +----------+       +----------+       +----------+
                                             |
                                        Promotes to primary
                                        Resumes from last
                                        replicated state
```

```python
import time
from dataclasses import dataclass
from enum import Enum

class NodeRole(Enum):
    PRIMARY = "PRIMARY"
    STANDBY = "STANDBY"

@dataclass
class FailoverManager:
    """Manages active-passive failover between trading nodes."""

    node_id: str
    role: NodeRole
    heartbeat_interval_ms: int = 100
    failover_timeout_ms: int = 500
    _last_heartbeat: float = 0.0

    def send_heartbeat(self) -> dict:
        """Primary sends heartbeat to standby."""
        return {
            "node_id": self.node_id,
            "role": self.role.value,
            "timestamp": time.time(),
            "positions": self._get_current_positions(),
        }

    def check_heartbeat(self, last_received: float) -> bool:
        """Standby checks if primary is alive."""
        elapsed_ms = (time.time() - last_received) * 1000
        if elapsed_ms > self.failover_timeout_ms:
            self._promote_to_primary()
            return False
        return True

    def _promote_to_primary(self) -> None:
        """Promote standby to primary role."""
        self.role = NodeRole.PRIMARY
        self._reconnect_to_exchanges()
        self._resume_trading()

    def _get_current_positions(self) -> dict:
        return {}  # Placeholder

    def _reconnect_to_exchanges(self) -> None:
        pass  # Reconnect FIX sessions

    def _resume_trading(self) -> None:
        pass  # Resume from replicated state
```

### Kill Switches

Every production trading system needs multiple kill switches at different levels:

```
KILL SWITCH HIERARCHY
======================

  Level 1: STRATEGY KILL        "Stop this one strategy"
            |
  Level 2: SYMBOL KILL          "Stop trading this symbol"
            |
  Level 3: ASSET CLASS KILL     "Stop all equity trading"
            |
  Level 4: GLOBAL KILL          "Stop ALL trading immediately"
            |
  Level 5: EXCHANGE DISCONNECT  "Sever all exchange connections"

  Each level MUST:
  - Cancel all open orders at that scope
  - Prevent new orders at that scope
  - Log the activation with reason
  - Alert all stakeholders
  - Require manual re-enable
```

```python
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum

class KillScope(Enum):
    STRATEGY = "STRATEGY"
    SYMBOL = "SYMBOL"
    ASSET_CLASS = "ASSET_CLASS"
    GLOBAL = "GLOBAL"

@dataclass(frozen=True)
class KillSwitchEvent:
    scope: str
    target: str
    reason: str
    activated_by: str
    timestamp: str

class KillSwitch:
    """Multi-level kill switch for trading systems."""

    def __init__(self, order_manager, logger):
        self._om = order_manager
        self._logger = logger
        self._active_kills: dict[str, KillSwitchEvent] = {}

    def activate(
        self, scope: KillScope, target: str, reason: str, user: str
    ) -> KillSwitchEvent:
        """Activate kill switch. Cancels orders and blocks new ones."""
        event = KillSwitchEvent(
            scope=scope.value,
            target=target,
            reason=reason,
            activated_by=user,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

        key = f"{scope.value}:{target}"
        self._active_kills[key] = event

        # Cancel all open orders in scope
        open_orders = self._om.get_open_orders(scope=scope, target=target)
        for order in open_orders:
            self._om.cancel(order.order_id, reason=f"Kill switch: {reason}")

        self._logger.error(
            "Kill switch activated",
            scope=scope.value,
            target=target,
            reason=reason,
            cancelled_orders=len(open_orders),
        )
        return event

    def is_blocked(self, strategy: str, symbol: str, asset_class: str) -> bool:
        """Check if a new order would be blocked by any active kill switch."""
        checks = [
            f"STRATEGY:{strategy}",
            f"SYMBOL:{symbol}",
            f"ASSET_CLASS:{asset_class}",
            "GLOBAL:ALL",
        ]
        return any(key in self._active_kills for key in checks)

    def deactivate(self, scope: KillScope, target: str, user: str) -> None:
        """Manual re-enable (requires explicit action)."""
        key = f"{scope.value}:{target}"
        if key in self._active_kills:
            self._logger.info(
                "Kill switch deactivated",
                scope=scope.value,
                target=target,
                deactivated_by=user,
            )
            # Create new dict without the deactivated key (immutable pattern)
            self._active_kills = {
                k: v for k, v in self._active_kills.items() if k != key
            }
```

### Incident Response

```
INCIDENT RESPONSE PLAYBOOK
=============================

  1. DETECT (automated)
     - Monitoring alert fires
     - Kill switch auto-triggers on threshold breach

  2. TRIAGE (< 2 minutes)
     - On-call engineer receives alert (PagerDuty)
     - Assess severity: data issue? System failure? Market event?
     - Decide: pause trading? Continue with limits?

  3. CONTAIN (< 5 minutes)
     - Activate appropriate kill switch level
     - Preserve evidence (logs, state snapshots)
     - Communicate to stakeholders

  4. RESOLVE
     - Root cause analysis
     - Fix and test in staging
     - Gradual re-enable with reduced limits

  5. POST-MORTEM (within 24 hours)
     - Timeline of events
     - Root cause
     - Impact (P&L, missed trades)
     - Action items to prevent recurrence
```

---

## 15.8 Version Control and Deployment

### Git Workflow for Trading Systems

```
GIT BRANCHING STRATEGY
========================

  main (production)
  |
  +-- release/v2.3.1  (release candidate)
  |     |
  |     +-- hotfix/fix-fill-handler  (emergency fix)
  |
  +-- develop  (integration branch)
        |
        +-- feature/new-alpha-signal
        +-- feature/kafka-migration
        +-- bugfix/timestamp-overflow

  RULES:
  - main = exactly what runs in production
  - All changes via pull request with code review
  - Strategy parameter changes are code changes (version controlled)
  - NEVER commit secrets, API keys, or credentials
  - Tag every production deployment: v2.3.1-20240615
```

### CI/CD Pipeline

```
CI/CD FOR TRADING SYSTEMS
===========================

  Push to          Build &        Integration      Staging         Production
  feature branch   Unit Test      Test             Deploy          Deploy
  +----------+    +----------+   +----------+     +----------+   +----------+
  | git push |    | pytest   |   | Backtest |     | Paper    |   | Blue-    |
  |          |--->| mypy     |-->| vs known |---->| trading  |-->| Green    |
  |          |    | ruff     |   | results  |     | 24 hours |   | Deploy   |
  +----------+    +----------+   +----------+     +----------+   +----------+
                      |               |                |              |
                   Fail fast      Regression        Smoke test    Canary
                   < 5 min        detection         with real     release
                                                    market data
```

```python
# ci/backtest_regression.py
"""CI step: Run backtest and compare against known-good results."""

from dataclasses import dataclass

@dataclass(frozen=True)
class RegressionResult:
    metric: str
    expected: float
    actual: float
    tolerance: float
    passed: bool

def check_regression(
    expected: dict[str, float],
    actual: dict[str, float],
    tolerances: dict[str, float],
) -> list[RegressionResult]:
    """Compare backtest results against known-good baseline."""
    results = []
    for metric, exp_val in expected.items():
        act_val = actual.get(metric, 0.0)
        tol = tolerances.get(metric, 0.01)
        passed = abs(act_val - exp_val) / max(abs(exp_val), 1e-10) < tol
        results.append(RegressionResult(
            metric=metric,
            expected=exp_val,
            actual=act_val,
            tolerance=tol,
            passed=passed,
        ))
    return results

# Example usage in CI:
# expected = {"sharpe": 1.82, "max_dd": -0.045, "num_trades": 1234}
# actual   = run_backtest("momentum-v2", "2023-01-01", "2023-12-31")
# results  = check_regression(expected, actual, {"sharpe": 0.05, "max_dd": 0.1})
# if not all(r.passed for r in results):
#     sys.exit(1)  # Fail CI
```

### Blue-Green Deployment

```
BLUE-GREEN DEPLOYMENT FOR TRADING
====================================

  Load Balancer / Exchange Gateway
           |
    +------+------+
    |             |
    v             v
  +--------+   +--------+
  | BLUE   |   | GREEN  |
  | v2.3.0 |   | v2.3.1 |
  | ACTIVE |   | STANDBY|
  +--------+   +--------+

  Deployment steps:
  1. Deploy v2.3.1 to GREEN (inactive)
  2. Run smoke tests on GREEN
  3. Route 10% traffic to GREEN (canary)
  4. Monitor for 30 minutes
  5. If healthy: switch 100% to GREEN
  6. Keep BLUE as instant rollback target
  7. If unhealthy: route 100% back to BLUE

  CRITICAL: Both BLUE and GREEN share the same
  position state and risk limits database.
```

### Configuration Management

```python
from dataclasses import dataclass
from pathlib import Path
import json

@dataclass(frozen=True)
class StrategyConfig:
    strategy_id: str
    symbols: tuple[str, ...]
    max_position_usd: float
    max_order_size: int
    signal_threshold: float
    enabled: bool

@dataclass(frozen=True)
class SystemConfig:
    environment: str              # "production", "staging", "dev"
    strategies: tuple[StrategyConfig, ...]
    global_max_exposure_usd: float
    kill_switch_loss_limit: float
    data_feed_timeout_seconds: int

def load_config(config_path: str, env: str) -> SystemConfig:
    """Load config with environment overlay. Never hardcode values."""
    base_path = Path(config_path)

    with open(base_path / "base.json") as f:
        base = json.load(f)

    env_file = base_path / f"{env}.json"
    if env_file.exists():
        with open(env_file) as f:
            overlay = json.load(f)
        merged = {**base, **overlay}
    else:
        merged = base

    strategies = tuple(
        StrategyConfig(**s) for s in merged["strategies"]
    )
    return SystemConfig(
        environment=env,
        strategies=strategies,
        global_max_exposure_usd=merged["global_max_exposure_usd"],
        kill_switch_loss_limit=merged["kill_switch_loss_limit"],
        data_feed_timeout_seconds=merged["data_feed_timeout_seconds"],
    )
```

---

## 15.9 Security

### Network Architecture

```
NETWORK SECURITY ZONES
========================

  INTERNET                DMZ                    INTERNAL
  (untrusted)            (semi-trusted)          (trusted)
  +----------+          +-----------+           +----------+
  |          |          |           |           |          |
  | Vendors  |---WAF--->| API       |---FW----->| Trading  |
  | Clients  |          | Gateway   |           | Engine   |
  |          |          |           |           |          |
  +----------+          +-----------+           +----------+
                              |                      |
                        +-----------+           +----------+
                        | Jump Host |           | Database |
                        | (SSH      |           | (no ext  |
                        |  bastion) |           |  access) |
                        +-----------+           +----------+

  Rules:
  - Trading servers: NO internet access
  - All external data passes through API gateway
  - Database accessible only from internal zone
  - SSH via jump host only, with MFA
  - All traffic encrypted (TLS 1.3 minimum)
```

### Secret Management

```python
import os
from dataclasses import dataclass

@dataclass(frozen=True)
class Credentials:
    api_key: str
    api_secret: str
    account_id: str

def load_credentials(provider: str) -> Credentials:
    """Load credentials from environment or secret manager. NEVER hardcode."""
    # Option 1: Environment variables (dev/staging)
    api_key = os.environ.get(f"{provider.upper()}_API_KEY")
    api_secret = os.environ.get(f"{provider.upper()}_API_SECRET")
    account_id = os.environ.get(f"{provider.upper()}_ACCOUNT_ID")

    if not all([api_key, api_secret, account_id]):
        raise EnvironmentError(
            f"Missing credentials for {provider}. "
            f"Set {provider.upper()}_API_KEY, "
            f"{provider.upper()}_API_SECRET, "
            f"{provider.upper()}_ACCOUNT_ID"
        )

    return Credentials(
        api_key=api_key,
        api_secret=api_secret,
        account_id=account_id,
    )

# Production: Use HashiCorp Vault, AWS Secrets Manager, or GCP Secret Manager
# Example with AWS Secrets Manager:
#
#   import boto3
#   client = boto3.client("secretsmanager")
#   secret = client.get_secret_value(SecretId="trading/polygon-api")
#   creds = json.loads(secret["SecretString"])
```

### Access Control

```
ROLE-BASED ACCESS CONTROL (RBAC)
==================================

  Role               Permissions
  ----               -----------
  Researcher         - Read market data
                     - Run backtests
                     - View (not modify) strategy configs
                     - No access to production systems

  Strategy Dev       - All researcher permissions
                     - Deploy to staging
                     - Modify strategy parameters (staging only)
                     - View production logs

  Trader/Operator    - Enable/disable strategies
                     - Activate kill switches
                     - View real-time P&L
                     - Manual order entry

  Infrastructure     - System administration
                     - Deploy to production
                     - Manage secrets
                     - Network configuration

  Risk Officer       - View all positions and P&L
                     - Modify risk limits
                     - Activate global kill switch
                     - Override any trade

  PRINCIPLE OF LEAST PRIVILEGE:
  Every person and service gets the minimum permissions needed.
```

### API Key Rotation

```python
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

@dataclass(frozen=True)
class APIKeyInfo:
    key_id: str
    created_at: datetime
    expires_at: datetime
    is_active: bool

class APIKeyRotator:
    """Automated API key rotation with zero-downtime."""

    def __init__(self, secret_store, key_max_age_days: int = 90):
        self._store = secret_store
        self._max_age = timedelta(days=key_max_age_days)

    def check_rotation_needed(self, key_info: APIKeyInfo) -> bool:
        """Check if key needs rotation."""
        age = datetime.now(timezone.utc) - key_info.created_at
        return age > self._max_age or not key_info.is_active

    def rotate(self, provider: str) -> dict[str, str]:
        """
        Rotate API key with zero downtime:
        1. Generate new key
        2. Store new key
        3. Verify new key works
        4. Update all consumers
        5. Revoke old key
        """
        old_key = self._store.get(f"{provider}/api_key")
        new_key = self._store.generate_new_key(provider)
        self._store.set(f"{provider}/api_key_new", new_key)

        if not self._verify_key(provider, new_key):
            self._store.delete(f"{provider}/api_key_new")
            raise RuntimeError(f"New key verification failed for {provider}")

        self._store.set(f"{provider}/api_key", new_key)
        self._store.delete(f"{provider}/api_key_new")
        self._store.revoke(provider, old_key)

        return {"provider": provider, "status": "rotated"}

    def _verify_key(self, provider: str, key: str) -> bool:
        """Verify new key works before committing rotation."""
        # Make a lightweight API call to verify
        return True  # Placeholder
```

---

## 15.10 Building a Personal Trading Stack

### Minimal Viable Infrastructure

You do not need Kafka, Kubernetes, or co-located servers to start. Here is what you actually need:

```
PERSONAL TRADING STACK (MVP)
==============================

  Phase 1: Learning (Cost: $0)
  +------------------------------------------+
  |  Python + pandas + SQLite                 |
  |  - Download EOD data (yfinance)          |
  |  - Backtest with vectorbt or backtrader  |
  |  - Store results in SQLite               |
  |  - Jupyter notebooks for research        |
  +------------------------------------------+

  Phase 2: Serious Research (Cost: ~$50/month)
  +------------------------------------------+
  |  Python + PostgreSQL + Redis              |
  |  - TimescaleDB for tick data             |
  |  - Redis for caching & pub/sub           |
  |  - Polygon.io or Alpaca for data         |
  |  - Scheduled pipelines (cron or Airflow) |
  +------------------------------------------+

  Phase 3: Live Trading (Cost: ~$200/month)
  +------------------------------------------+
  |  Add: Docker + monitoring + broker API    |
  |  - Interactive Brokers or Alpaca          |
  |  - Grafana + Prometheus for monitoring   |
  |  - Docker Compose for reproducibility    |
  |  - Proper logging and alerting           |
  +------------------------------------------+

  Phase 4: Scaling (Cost: $500+/month)
  +------------------------------------------+
  |  Add: Cloud compute + Kafka + ML          |
  |  - AWS/GCP for backtesting compute       |
  |  - Kafka for event streaming             |
  |  - GPU instances for ML training         |
  |  - CI/CD pipeline                        |
  +------------------------------------------+
```

### Recommended Beginner Stack

```python
"""
Minimal personal trading infrastructure.
Stack: Python + PostgreSQL (TimescaleDB) + Redis
"""

# ---- database.py ----
import os
from dataclasses import dataclass

@dataclass(frozen=True)
class DatabaseConfig:
    host: str
    port: int
    database: str
    user: str
    password: str

    @staticmethod
    def from_env() -> "DatabaseConfig":
        return DatabaseConfig(
            host=os.environ.get("DB_HOST", "localhost"),
            port=int(os.environ.get("DB_PORT", "5432")),
            database=os.environ.get("DB_NAME", "trading"),
            user=os.environ.get("DB_USER", "trader"),
            password=os.environ.get("DB_PASSWORD", ""),
        )

SCHEMA_SQL = """
-- TimescaleDB hypertable for OHLCV data
CREATE TABLE IF NOT EXISTS ohlcv (
    time        TIMESTAMPTZ NOT NULL,
    symbol      TEXT NOT NULL,
    open        DOUBLE PRECISION,
    high        DOUBLE PRECISION,
    low         DOUBLE PRECISION,
    close       DOUBLE PRECISION,
    volume      BIGINT,
    PRIMARY KEY (time, symbol)
);

SELECT create_hypertable('ohlcv', 'time', if_not_exists => TRUE);

-- Signals table
CREATE TABLE IF NOT EXISTS signals (
    time        TIMESTAMPTZ NOT NULL,
    strategy    TEXT NOT NULL,
    symbol      TEXT NOT NULL,
    signal      DOUBLE PRECISION,
    metadata    JSONB,
    PRIMARY KEY (time, strategy, symbol)
);

SELECT create_hypertable('signals', 'time', if_not_exists => TRUE);

-- Trades table (audit trail)
CREATE TABLE IF NOT EXISTS trades (
    id          BIGSERIAL PRIMARY KEY,
    time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    strategy    TEXT NOT NULL,
    symbol      TEXT NOT NULL,
    side        TEXT NOT NULL,
    quantity    INTEGER NOT NULL,
    price       DOUBLE PRECISION NOT NULL,
    commission  DOUBLE PRECISION DEFAULT 0,
    order_id    TEXT,
    fill_id     TEXT
);

CREATE INDEX idx_trades_time ON trades (time);
CREATE INDEX idx_trades_strategy ON trades (strategy);
"""
```

### Complete Project Structure

```
RECOMMENDED PROJECT LAYOUT
============================

  my-trading-system/
  |
  +-- config/
  |   +-- base.json              # Default configuration
  |   +-- dev.json               # Development overrides
  |   +-- production.json        # Production overrides
  |
  +-- data/
  |   +-- pipelines/
  |   |   +-- eod_pipeline.py    # Daily EOD data fetch
  |   |   +-- tick_pipeline.py   # Real-time tick ingestion
  |   |   +-- alt_data.py        # Alternative data sources
  |   +-- storage/
  |   |   +-- parquet_store.py   # Parquet read/write
  |   |   +-- db_client.py       # Database client
  |   +-- quality/
  |       +-- checks.py          # Data validation
  |
  +-- strategies/
  |   +-- base.py                # Abstract strategy class
  |   +-- momentum/
  |   |   +-- signal.py          # Signal generation
  |   |   +-- params.py          # Strategy parameters
  |   +-- mean_reversion/
  |       +-- signal.py
  |       +-- params.py
  |
  +-- execution/
  |   +-- broker_client.py       # Broker API wrapper
  |   +-- order_manager.py       # Order lifecycle
  |   +-- risk_checks.py         # Pre-trade risk
  |
  +-- monitoring/
  |   +-- metrics.py             # Prometheus metrics
  |   +-- alerting.py            # Alert rules
  |   +-- dashboard.py           # P&L calculations
  |
  +-- tests/
  |   +-- test_signals.py
  |   +-- test_risk.py
  |   +-- test_pipeline.py
  |   +-- backtest_regression/   # CI regression tests
  |
  +-- docker-compose.yml         # Local infrastructure
  +-- Dockerfile                 # Application container
  +-- pyproject.toml             # Dependencies
  +-- Makefile                   # Common commands
```

### Quick-Start Makefile

```makefile
# Makefile - Common commands for trading system

.PHONY: setup dev test backtest deploy

setup:                          ## First-time setup
	pip install -e ".[dev]"
	docker compose up -d timescaledb redis
	python -c "from data.storage.db_client import init_db; init_db()"

dev:                            ## Start development environment
	docker compose up -d
	jupyter lab --port 8888

test:                           ## Run all tests
	pytest tests/ -v --cov=. --cov-report=term-missing

backtest:                       ## Run backtest suite
	python -m strategies.run_backtest --config config/dev.json

lint:                           ## Run linters
	ruff check .
	mypy .

pipeline-eod:                   ## Run EOD data pipeline
	python -m data.pipelines.eod_pipeline --date today

monitor:                        ## Open monitoring dashboards
	open http://localhost:3000   # Grafana
	open http://localhost:9090   # Prometheus
```

---

## 15.11 Key Takeaways

```
INFRASTRUCTURE PRINCIPLES
============================

  1. SEPARATE HOT AND COLD PATHS
     Never let batch processing block real-time trading.

  2. VALIDATE EVERYTHING
     Bad data in = bad trades out. Check every tick.

  3. MONITOR RELENTLESSLY
     If you can't see it, you can't fix it. Instrument everything.

  4. PLAN FOR FAILURE
     Kill switches, failover, rollback. Assume things will break.

  5. VERSION CONTROL EVERYTHING
     Strategy params, configs, schemas. If it changes, it's in git.

  6. START SIMPLE, SCALE LATER
     SQLite before TimescaleDB. Cron before Airflow. CSV before Kafka.

  7. SECURITY IS NOT OPTIONAL
     One leaked API key can drain your account.

  8. IMMUTABLE AUDIT TRAIL
     Regulators will ask. Your future self will thank you.
```

### Interview Questions

**Q: Design the data pipeline for a quant fund that trades 5000 US equities.**

A: The pipeline has three layers. (1) Ingestion: feed handlers parse exchange protocols (ITCH, FIX) into a normalized format, publishing to Kafka topics partitioned by symbol. (2) Processing: stream consumers build order books, compute derived features (VWAP, spread), and write to TimescaleDB for real-time queries and Parquet for historical analysis. (3) Batch: nightly EOD jobs reconcile positions, adjust for corporate actions, retrain ML models, and generate compliance reports. Data quality gates at every boundary reject or flag anomalous data. The system is idempotent --- reprocessing the same day produces identical results.

**Q: How do you ensure your trading system can recover from a crash mid-session?**

A: Three mechanisms. (1) State journaling: every state change (position update, order event) is written to a write-ahead log before being applied. On restart, replay the journal from the last checkpoint. (2) Exchange reconciliation: on startup, query the exchange for all open orders and current positions, reconcile against local state. (3) Graceful degradation: if reconciliation finds discrepancies, enter "recovery mode" --- cancel all open orders, flatten discrepant positions, alert the operator, and wait for manual approval before resuming normal trading.

**Q: Why separate research and production infrastructure?**

A: Research and production have fundamentally different requirements. Research optimizes for flexibility (ad-hoc queries, new libraries, GPU access) while production optimizes for reliability and latency (deterministic behavior, minimal dependencies, co-located hardware). Sharing infrastructure creates risk: a researcher's runaway query can starve the trading engine of resources. Shared code paths mean a research bug can crash production. The solution is shared data (both read from the same tick store) but separate compute, with a rigorous promotion process (code review, backtest regression, paper trading) to move code from research to production.

---

## Navigation

| Previous                                                      | Up                       | Next                                                    |
| ------------------------------------------------------------- | ------------------------ | ------------------------------------------------------- |
| [Ch 14: Portfolio Construction](14-PORTFOLIO-CONSTRUCTION.md) | [Roadmap](00-ROADMAP.md) | [Ch 16: Regulatory and Ethics](16-REGULATORY-ETHICS.md) |
