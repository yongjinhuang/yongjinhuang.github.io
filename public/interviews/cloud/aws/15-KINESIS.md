# Kinesis (Data Streaming)

Amazon Kinesis is a platform for real-time data streaming. It handles continuous ingestion and processing of large-scale event streams -- clickstreams, IoT telemetry, application logs, financial transactions. Where SQS is a message queue (process and delete) and EventBridge is an event bus (route events to targets), Kinesis is a durable, ordered stream where multiple consumers can independently read data in real time.

---

## Kinesis Data Streams

The core streaming service. You create a stream, producers write records to it, and consumers read from it. Data is stored durably and ordered within each shard.

### Shards

A shard is the unit of capacity in a Kinesis stream.

| Metric | Per Shard |
|---|---|
| Write capacity | 1 MB/s or 1,000 records/s |
| Read capacity (shared) | 2 MB/s across all consumers |
| Read capacity (enhanced fan-out) | 2 MB/s per consumer |

A stream with 10 shards can ingest 10 MB/s and serve 20 MB/s of reads (shared mode).

### Partition Keys and Sequence Numbers

- **Partition key**: A string you provide with each record. Kinesis hashes it to determine which shard the record goes to.
- **Sequence number**: Assigned by Kinesis after the record is written. Monotonically increasing within a shard. Used for ordering.

```bash
# Put a record with a partition key
aws kinesis put-record \
  --stream-name my-stream \
  --partition-key "user-1234" \
  --data "eyJldmVudCI6ICJjbGljayJ9"  # base64 encoded
```

All records with the same partition key go to the same shard, guaranteeing ordering for that key.

### Producers

| Producer | When to Use |
|---|---|
| **AWS SDK** (`PutRecord`, `PutRecords`) | Simple cases, low volume, direct control |
| **Kinesis Producer Library (KPL)** | High throughput. Batches, aggregates, retries automatically. |
| **Kinesis Agent** | Tail log files and send to Kinesis. No code required. |
| **CloudWatch, IoT Core, etc.** | AWS service integrations that write directly to Kinesis |

**KPL** aggregates multiple user records into a single Kinesis record to maximize throughput and reduce cost. The tradeoff is higher latency due to buffering (`RecordMaxBufferedTime`, default 100ms).

```bash
# Put multiple records in a batch (SDK)
aws kinesis put-records \
  --stream-name my-stream \
  --records '[
    {"Data":"eyJhIjoxfQ==","PartitionKey":"user-1"},
    {"Data":"eyJhIjoyfQ==","PartitionKey":"user-2"},
    {"Data":"eyJhIjozfQ==","PartitionKey":"user-1"}
  ]'
```

### Consumers

| Consumer | Model | Throughput | Latency |
|---|---|---|---|
| **AWS SDK** (`GetRecords`) | Shared (pull) | 2 MB/s per shard shared | ~200ms per poll |
| **KCL (Kinesis Client Library)** | Shared (pull) | 2 MB/s per shard shared | ~200ms per poll |
| **Lambda** | Shared (pull) | 2 MB/s per shard shared | Event-driven |
| **Enhanced Fan-Out** | Dedicated (push) | 2 MB/s per shard per consumer | ~70ms (push via HTTP/2) |

**KCL** is the standard choice for long-running consumer applications. It handles:
- Shard assignment to worker instances
- Checkpointing (using DynamoDB)
- Load balancing across workers
- Resharding coordination

**Lambda** is the simplest consumer. Kinesis triggers the function with a batch of records. Configure `BatchSize`, `MaximumBatchingWindowInSeconds`, `ParallelizationFactor` (up to 10 concurrent invocations per shard).

### Enhanced Fan-Out

Without enhanced fan-out, all consumers sharing a shard split the 2 MB/s read throughput. With enhanced fan-out, each registered consumer gets a dedicated 2 MB/s pipe per shard via HTTP/2 push.

```bash
# Register an enhanced fan-out consumer
aws kinesis register-stream-consumer \
  --stream-arn arn:aws:kinesis:us-east-1:123456789012:stream/my-stream \
  --consumer-name analytics-consumer
```

Use enhanced fan-out when you have multiple consumers and cannot tolerate throughput contention or when you need sub-100ms delivery latency.

### Data Retention

| Setting | Value |
|---|---|
| Default | 24 hours |
| Extended | Up to 365 days |
| Cost | Longer retention = higher cost per shard-hour |

Extended retention is useful for reprocessing scenarios, but consider archiving to S3 via Firehose for long-term storage instead.

---

## Kinesis Data Firehose

Fully managed service that loads streaming data into destinations. No code, no capacity management.

### Destinations

| Destination | Use Case |
|---|---|
| S3 | Data lake, archival |
| Redshift | Data warehousing (via S3 intermediate) |
| OpenSearch (Elasticsearch) | Search and analytics |
| Splunk | Log analysis |
| HTTP endpoint | Custom destinations |
| Third-party (Datadog, New Relic, etc.) | Monitoring platforms |

### Buffering

Firehose buffers incoming data before delivering to the destination.

| Parameter | Range | Default |
|---|---|---|
| Buffer size | 1 MB - 128 MB | 5 MB |
| Buffer interval | 60 - 900 seconds | 300 seconds |

Delivery happens when **either** threshold is reached (whichever comes first). For near-real-time delivery, set buffer size to 1 MB and interval to 60 seconds.

### Transformations

- **Lambda transformation**: Transform records inline before delivery (e.g., parse, enrich, filter)
- **Format conversion**: Convert JSON to Parquet or ORC for efficient querying in Athena
- **Compression**: GZIP, Snappy, or ZIP before writing to S3

```bash
# Create a Firehose delivery stream to S3
aws firehose create-delivery-stream \
  --delivery-stream-name events-to-s3 \
  --s3-destination-configuration '{
    "RoleARN": "arn:aws:iam::123456789012:role/firehose-role",
    "BucketARN": "arn:aws:s3:::my-data-lake",
    "Prefix": "events/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/",
    "BufferingHints": {"SizeInMBs": 5, "IntervalInSeconds": 60}
  }'
```

---

## Kinesis Data Analytics

Run SQL queries or Apache Flink applications against streaming data in real time.

| Option | Language | Use Case |
|---|---|---|
| SQL | SQL | Simple aggregations, filtering, windowed queries |
| Apache Flink | Java, Scala, Python | Complex stream processing, stateful computations |

Kinesis Data Analytics is being replaced by **Amazon Managed Service for Apache Flink** for new workloads. SQL-based analytics is in maintenance mode.

---

## Resharding

Adjust stream capacity by splitting or merging shards.

- **Split**: One shard becomes two. Doubles capacity for that partition range.
- **Merge**: Two adjacent shards become one. Halves capacity but reduces cost.

```bash
# Split a shard
aws kinesis split-shard \
  --stream-name my-stream \
  --shard-to-split shardId-000000000000 \
  --new-starting-hash-key 170141183460469231731687303715884105728

# Merge two adjacent shards
aws kinesis merge-shards \
  --stream-name my-stream \
  --shard-to-merge shardId-000000000001 \
  --adjacent-shard-to-merge shardId-000000000002

# Use on-demand mode to avoid manual resharding
aws kinesis update-stream-mode \
  --stream-arn arn:aws:kinesis:us-east-1:123456789012:stream/my-stream \
  --stream-mode-details StreamMode=ON_DEMAND
```

**On-demand mode** automatically scales shards based on throughput. No manual resharding needed. You pay per GB of data written and read. Use this unless you have predictable, steady throughput.

---

## Kinesis vs SQS vs EventBridge

| | Kinesis | SQS | EventBridge |
|---|---|---|---|
| Model | Ordered stream | Message queue | Event bus (pub/sub) |
| Ordering | Per shard (partition key) | FIFO per message group | No ordering guarantee |
| Retention | 24h - 365 days | 1 min - 14 days | Archive (configurable) |
| Consumers | Multiple, independent | Single consumer group | Rule-based routing |
| Throughput | Scales with shards | Nearly unlimited | 10K+ events/s per account |
| Replay | Read from any position | No replay (delete after process) | Archive and replay |
| Latency | ~200ms (shared), ~70ms (fan-out) | ~ms (long polling) | ~ms |
| Best for | High-volume streaming, ordering, multiple consumers | Task queues, decoupling, request buffering | Event routing, integration, low-volume events |

**Use Kinesis when**: You have high-volume continuous data streams, need ordering, need multiple consumers reading the same data, or need to replay data.

**Use SQS when**: You need a simple task queue, want to decouple a producer from a consumer, or need exactly-once processing (FIFO).

**Use EventBridge when**: You need content-based routing, want to integrate multiple services, or are building event-driven microservices with diverse targets.

---

## Common CLI Commands

```bash
# Create a stream (provisioned mode)
aws kinesis create-stream \
  --stream-name my-stream \
  --shard-count 4

# Create a stream (on-demand mode)
aws kinesis create-stream \
  --stream-name my-stream \
  --stream-mode-details StreamMode=ON_DEMAND

# Describe the stream
aws kinesis describe-stream-summary --stream-name my-stream

# List shards
aws kinesis list-shards --stream-name my-stream

# Put a single record
aws kinesis put-record \
  --stream-name my-stream \
  --partition-key "sensor-42" \
  --data "eyJ0ZW1wIjogNzIuNX0="

# Get a shard iterator
aws kinesis get-shard-iterator \
  --stream-name my-stream \
  --shard-id shardId-000000000000 \
  --shard-iterator-type TRIM_HORIZON

# Get records (use the shard iterator from above)
aws kinesis get-records \
  --shard-iterator "AAAAAAAAAAGhR...=="

# Increase shard count
aws kinesis update-shard-count \
  --stream-name my-stream \
  --target-shard-count 8 \
  --scaling-type UNIFORM_SCALING

# Delete a stream
aws kinesis delete-stream --stream-name my-stream
```

---

## Common Gotchas

1. **Hot shard problem**: If your partition key has low cardinality (e.g., a boolean, or a small set of user IDs), most data lands on a few shards while others sit idle. Use high-cardinality keys (user ID, device ID, UUID) to distribute evenly.
2. **Shard iterator expiration**: Shard iterators expire after **5 minutes** of inactivity. Always call `GetRecords` within 5 minutes of getting an iterator. Handle `ExpiredIteratorException` by fetching a new iterator.
3. **KCL DynamoDB costs**: KCL uses a DynamoDB table for checkpointing and lease management. For streams with many shards, this table can incur significant read/write costs. Monitor the table's consumed capacity.
4. **Shard limit**: Default is 500 shards per account per region (soft limit). For on-demand streams, the limit is 200 shards per stream.
5. **Ordering only within a shard**: Records with the same partition key are ordered within a shard. There is no global ordering across shards. If you need global ordering, use a single shard (but throughput is capped at 1 MB/s write).
6. **ProvisionedThroughputExceededException**: You are writing or reading faster than the shard can handle. Add retries with exponential backoff. Consider splitting the shard or switching to on-demand mode.
7. **Record size limit**: Maximum 1 MB per record (including partition key and data). Aggregate smaller records with KPL if you have many tiny events.
8. **Lambda consumer concurrency**: By default, one Lambda invocation per shard. Use `ParallelizationFactor` (up to 10) to process a single shard with multiple concurrent invocations, but ordering within the shard is no longer guaranteed across invocations.
9. **Firehose is not real-time**: Minimum buffer interval is 60 seconds. If you need sub-second delivery, consume from the stream directly with Lambda or KCL.
10. **Cost model**: Provisioned mode charges per shard-hour regardless of usage. On-demand charges per GB. For bursty workloads, on-demand is usually cheaper. For steady high-throughput, provisioned can be cheaper with right-sizing.
