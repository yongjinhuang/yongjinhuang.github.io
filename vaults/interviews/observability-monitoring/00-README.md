# Observability & Monitoring -- Interview Preparation Guide

## Overview

This directory covers **observability** -- the discipline of understanding the internal
state of systems through their external outputs. Modern observability goes beyond
traditional monitoring to enable engineers to ask arbitrary questions about system
behavior without deploying new instrumentation.

```
                    OBSERVABILITY
                         |
         +---------------+---------------+
         |               |               |
       LOGS           METRICS         TRACES
         |               |               |
    +----+----+    +-----+-----+   +-----+-----+
    |    |    |    |     |     |   |     |     |
   Loki  ELK    Prom  Datadog   OTel  Tempo
   Fluentd       Mimir  Custom  Jaeger  Zipkin
         |               |               |
         +-------+-------+-------+-------+
                 |                |
           ALERTING          DASHBOARDS
                 |                |
           PagerDuty          Grafana
           OpsGenie           Datadog
```

## Table of Contents

| #  | File | Topic | Key Concepts |
|----|------|-------|--------------|
| 00 | [00-README.md](00-README.md) | This file | Overview |
| 01 | [01-FUNDAMENTALS.md](01-FUNDAMENTALS.md) | Observability Fundamentals | Three pillars, SLIs/SLOs/SLAs, error budgets, observability vs monitoring |
| 02 | [02-OPENTELEMETRY.md](02-OPENTELEMETRY.md) | OpenTelemetry | SDK, Collector, traces, metrics, logs, OTLP, semantic conventions |
| 03 | [03-METRICS-PROMETHEUS.md](03-METRICS-PROMETHEUS.md) | Metrics & Prometheus | PromQL, metric types, scraping, recording rules, Alertmanager |
| 04 | [04-LOGGING.md](04-LOGGING.md) | Logging | Structured logging, ELK stack, Loki/LogQL, log aggregation |
| 05 | [05-DISTRIBUTED-TRACING.md](05-DISTRIBUTED-TRACING.md) | Distributed Tracing | Spans, context propagation, sampling, Jaeger, Tempo |
| 06 | [06-GRAFANA-DATADOG.md](06-GRAFANA-DATADOG.md) | Grafana & Datadog | Dashboards, alerting, APM, RUM, infrastructure monitoring |
| 07 | [07-ALERTING-INCIDENTS.md](07-ALERTING-INCIDENTS.md) | Alerting & Incident Management | Alert design, on-call, runbooks, postmortems, SRE practices |
