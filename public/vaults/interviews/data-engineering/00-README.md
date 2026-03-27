# Data Engineering & Pipelines -- Interview Preparation Guide

## Overview

This directory contains a comprehensive guide to **data engineering** -- the discipline of designing, building, and maintaining systems that collect, store, transform, and serve data at scale. These guides cover the full modern data stack: streaming platforms, batch processing engines, transformation tools, orchestration frameworks, and storage formats.

```
                     DATA ENGINEERING
                           |
         +-----------------+-----------------+
         |                 |                 |
    INGESTION         PROCESSING         STORAGE
         |                 |                 |
    +----+----+      +----+----+      +-----+-----+
    |    |    |      |    |    |      |     |     |
  Kafka Flink     Spark  dbt       Warehouse Lake
  Kinesis CDC     Beam  Airflow    Lakehouse  Iceberg
         |                 |                 |
         +--------+--------+--------+-------+
                  |                  |
            ORCHESTRATION       QUALITY
                  |                  |
            Airflow/Dagster    Great Expectations
            Prefect            dbt Tests
```

## Who This Is For

- Backend engineers transitioning to data engineering roles
- Software engineers building data-intensive applications
- Engineers interviewing at companies with significant data infrastructure
- Tech leads evaluating data stack decisions

## Table of Contents

| #  | File | Topic | Key Concepts |
|----|------|-------|--------------|
| 00 | [00-README.md](00-README.md) | This file | Overview |
| 01 | [01-FUNDAMENTALS.md](01-FUNDAMENTALS.md) | Data Engineering Fundamentals | ETL/ELT, batch/streaming, architectures, data modeling |
| 02 | [02-APACHE-KAFKA.md](02-APACHE-KAFKA.md) | Apache Kafka | Brokers, topics, partitions, consumers, Kafka Streams, Connect |
| 03 | [03-APACHE-SPARK.md](03-APACHE-SPARK.md) | Apache Spark | RDDs, DataFrames, Spark SQL, Structured Streaming, PySpark |
| 04 | [04-APACHE-FLINK.md](04-APACHE-FLINK.md) | Apache Flink | Stream processing, event time, watermarks, state, checkpointing |
| 05 | [05-DBT.md](05-DBT.md) | dbt (data build tool) | Models, tests, snapshots, incremental, Jinja, best practices |
| 06 | [06-ORCHESTRATION.md](06-ORCHESTRATION.md) | Pipeline Orchestration | Airflow, Dagster, Prefect, DAGs, scheduling, observability |
| 07 | [07-STORAGE-FORMATS.md](07-STORAGE-FORMATS.md) | Data Storage & Formats | Warehouses, lakes, lakehouses, Parquet, Iceberg, Delta Lake |
