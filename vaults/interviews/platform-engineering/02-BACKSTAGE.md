# Backstage (Spotify)

Backstage is an open-source platform for building developer portals, originally created by Spotify and donated to the CNCF. It serves as the UI layer of an Internal Developer Platform, providing a centralized place to manage software assets, documentation, infrastructure, and developer workflows. This guide covers Backstage's architecture, core features, plugin ecosystem, and interview preparation.

---

## Table of Contents

1. [What Is Backstage](#1-what-is-backstage)
2. [Why Spotify Built Backstage](#2-why-spotify-built-backstage)
3. [Architecture](#3-architecture)
4. [Software Catalog](#4-software-catalog)
5. [catalog-info.yaml Format and Examples](#5-catalog-infoyaml-format-and-examples)
6. [Software Templates (Scaffolder)](#6-software-templates-scaffolder)
7. [TechDocs (Docs-as-Code)](#7-techdocs-docs-as-code)
8. [Plugin Ecosystem](#8-plugin-ecosystem)
9. [Search Platform](#9-search-platform)
10. [Permissions Framework](#10-permissions-framework)
11. [Setting Up Backstage](#11-setting-up-backstage)
12. [Customization](#12-customization)
13. [Deploying Backstage](#13-deploying-backstage)
14. [Common Interview Questions](#14-common-interview-questions)
15. [Quick Reference](#15-quick-reference)

---

## 1. What Is Backstage

Backstage is an open platform for building developer portals. It unifies all your infrastructure tooling, services, and documentation to create a streamlined development environment from end to end.

### Core Features

```
+------------------------------------------------------------------+
|                       Backstage Portal                            |
|                                                                  |
|  +----------------+  +----------------+  +------------------+    |
|  | Software       |  | Software       |  | TechDocs         |    |
|  | Catalog        |  | Templates      |  | (Documentation)  |    |
|  | - Services     |  | - Create new   |  | - Markdown-based |    |
|  | - APIs         |  |   services     |  | - Auto-generated |    |
|  | - Libraries    |  | - Scaffolding  |  | - Searchable     |    |
|  | - Websites     |  | - Golden paths |  |                  |    |
|  +----------------+  +----------------+  +------------------+    |
|                                                                  |
|  +----------------+  +----------------+  +------------------+    |
|  | Search         |  | Kubernetes     |  | CI/CD            |    |
|  | Platform       |  | Plugin         |  | Plugin           |    |
|  +----------------+  +----------------+  +------------------+    |
|                                                                  |
|  +----------------+  +----------------+  +------------------+    |
|  | Cost Insights  |  | Security       |  | Custom Plugins   |    |
|  | Plugin         |  | Plugin         |  |                  |    |
|  +----------------+  +----------------+  +------------------+    |
+------------------------------------------------------------------+
```

### Key Value Propositions

- **Single pane of glass**: All services, docs, and tools in one place
- **Ownership clarity**: Every component has a clearly defined owner
- **Self-service**: Developers can create new services, provision infrastructure, view docs without tickets
- **Ecosystem extensibility**: 100+ open-source plugins, plus custom plugin development
- **Standards enforcement**: Templates and scorecards ensure compliance with organizational standards

---

## 2. Why Spotify Built Backstage

### The Problem at Scale

By 2020, Spotify had:
- 2,000+ engineers
- 10,000+ software components
- Hundreds of internal tools spread across different teams
- No single way to discover what existed or who owned it

### Challenges Addressed

| Challenge | Before Backstage | After Backstage |
|-----------|-----------------|-----------------|
| Service discovery | Ask on Slack, search wikis | Search the catalog |
| Documentation | Scattered across Confluence, GitHub, Google Docs | TechDocs in one place |
| Ownership | Unclear, outdated spreadsheets | Catalog enforces owners |
| New service creation | Copy-paste from another repo, manual setup | Software templates |
| Tool fragmentation | 100+ internal tools with different UIs | Plugin ecosystem, unified UI |

### Spotify's Golden Rule

> "Everything at Spotify should be in the catalog, and every entry in the catalog should have an owner."

Backstage was open-sourced in March 2020 and donated to the CNCF in March 2022, reaching Incubation status.

---

## 3. Architecture

### High-Level Architecture

```
+-------------------+       +-------------------+
|                   |       |                   |
|    Backstage      | HTTP  |    Backstage      |
|    Frontend       |------>|    Backend         |
|    (React SPA)    |       |    (Node.js)       |
|                   |       |                   |
+-------------------+       +--------+----------+
                                     |
                            +--------+----------+
                            |                   |
                            |    Database       |
                            |  (PostgreSQL)     |
                            |                   |
                            +--------+----------+
                                     |
                    +----------------+----------------+
                    |                |                |
              +-----+-----+  +------+------+  +------+------+
              | GitHub /   |  | Kubernetes  |  | CI/CD       |
              | GitLab     |  | Clusters    |  | Systems     |
              | (SCM)      |  |             |  | (Jenkins,   |
              +------------+  +-------------+  | GH Actions) |
                                               +-------------+
```

### Frontend Architecture

- **Framework**: React with Material UI
- **Routing**: React Router
- **State**: No global state manager; data fetched via API clients
- **Plugins**: Each plugin is a React component mounted at a route
- **Theming**: Customizable theme via `createTheme()`
- **Package**: `@backstage/core-plugin-api`, `@backstage/core-components`

### Backend Architecture

- **Runtime**: Node.js
- **Framework**: Express.js
- **Plugin model**: Each backend plugin registers routes on the Express app
- **Database**: PostgreSQL (SQLite for development)
- **Authentication**: Pluggable auth providers (GitHub, Google, Okta, etc.)
- **Package**: `@backstage/backend-defaults`, `@backstage/backend-plugin-api`

### New Backend System (v1.x+)

Backstage migrated to a new backend system that simplifies plugin integration:

```typescript
// New backend system (recommended)
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

backend.add(import('@backstage/plugin-catalog-backend/alpha'));
backend.add(import('@backstage/plugin-scaffolder-backend/alpha'));
backend.add(import('@backstage/plugin-techdocs-backend/alpha'));
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@backstage/plugin-search-backend/alpha'));

backend.start();
```

### Plugin Architecture

```
+----------------------------------------------------------+
|                    Backstage App Shell                     |
|                                                          |
|  +-----------+  +-----------+  +-----------+             |
|  | Catalog   |  | Scaffolder|  | TechDocs  |  ...        |
|  | Plugin    |  | Plugin    |  | Plugin    |             |
|  +-----------+  +-----------+  +-----------+             |
|       |              |              |                     |
|  +-----------+  +-----------+  +-----------+             |
|  | Catalog   |  | Scaffolder|  | TechDocs  |  ...        |
|  | Backend   |  | Backend   |  | Backend   |             |
|  +-----------+  +-----------+  +-----------+             |
|                                                          |
+----------------------------------------------------------+

Each plugin consists of:
  - Frontend: React components + routes
  - Backend: Express routes + business logic
  - Common: Shared types and utilities
```

---

## 4. Software Catalog

The Software Catalog is the heart of Backstage. It tracks all software assets in the organization and their relationships.

### Entity Types

| Entity Kind | Description | Example |
|------------|-------------|---------|
| **Component** | A piece of software (service, library, website) | `payment-service` |
| **API** | An interface exposed by a component | `payment-api` (REST/gRPC/GraphQL) |
| **System** | A collection of related components and APIs | `payment-system` |
| **Domain** | A high-level business area | `finance` |
| **Resource** | Physical or virtual infrastructure | `payments-db`, `redis-cache` |
| **Group** | A team or organizational unit | `platform-team` |
| **User** | An individual person | `jane.doe` |
| **Location** | A reference to where catalog data is found | `github.com/org/repo/catalog-info.yaml` |
| **Template** | A software template for scaffolding | `nodejs-service-template` |

### Entity Relationships

```
+----------+                    +----------+
|  Domain  |                    |  Domain  |
| finance  |                    | shipping |
+----+-----+                    +----+-----+
     |                               |
     | hasPart                       | hasPart
     v                               v
+----------+                    +----------+
|  System  |                    |  System  |
| payments |                    | logistics|
+----+-----+                    +----------+
     |
     | hasPart
     v
+------------+    providesAPI    +----------+
| Component  | ---------------> |   API    |
| payment-   |                  | payment- |
| service    | <--------------- | api      |
+-----+------+    consumesAPI   +----------+
      |
      | dependsOn
      v
+------------+
|  Resource  |
| payments-  |
| database   |
+------------+

ownedBy
+------------+     ownedBy      +---------+
| Component  | ---------------> |  Group  |
| payment-   |                  | payments|
| service    |                  | -team   |
+------------+                  +---------+
                                    |
                                    | hasMember
                                    v
                                +---------+
                                |  User   |
                                | jane.doe|
                                +---------+
```

### Catalog Discovery

Backstage discovers entities through several mechanisms:

1. **Static locations**: Manually registered URLs in `app-config.yaml`
2. **Discovery providers**: Auto-discover from GitHub orgs, GitLab groups, etc.
3. **Entity providers**: Custom providers that fetch entities from any source

```yaml
# app-config.yaml - Catalog configuration
catalog:
  locations:
    # Static location
    - type: url
      target: https://github.com/my-org/my-service/blob/main/catalog-info.yaml

  providers:
    # GitHub discovery
    github:
      myOrgProvider:
        organization: 'my-org'
        catalogPath: '/catalog-info.yaml'
        schedule:
          frequency: { minutes: 30 }
          timeout: { minutes: 3 }
```

---

## 5. catalog-info.yaml Format and Examples

The `catalog-info.yaml` file is the primary way to register entities in Backstage. It lives in the root of a repository.

### Basic Component

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: payment-service
  description: Handles all payment processing
  annotations:
    github.com/project-slug: my-org/payment-service
    backstage.io/techdocs-ref: dir:.
    backstage.io/kubernetes-id: payment-service
    jenkins.io/job-full-name: payment-service-pipeline
  tags:
    - java
    - payments
    - backend
  links:
    - url: https://dashboard.example.com/payments
      title: Payments Dashboard
      icon: dashboard
spec:
  type: service
  lifecycle: production
  owner: group:payments-team
  system: payment-system
  providesApis:
    - payment-api
  consumesApis:
    - user-api
    - notification-api
  dependsOn:
    - resource:payments-database
    - resource:payments-redis
```

### API Entity

```yaml
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: payment-api
  description: Payment processing API
  tags:
    - rest
    - payments
spec:
  type: openapi
  lifecycle: production
  owner: group:payments-team
  system: payment-system
  definition:
    $text: ./openapi.yaml
```

### System and Domain

```yaml
---
apiVersion: backstage.io/v1alpha1
kind: Domain
metadata:
  name: finance
  description: Finance and payments domain
spec:
  owner: group:finance-org

---
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: payment-system
  description: All payment-related components
spec:
  owner: group:payments-team
  domain: finance
```

### Resource Entity

```yaml
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: payments-database
  description: PostgreSQL database for payment data
spec:
  type: database
  owner: group:payments-team
  system: payment-system
```

### Group and User

```yaml
---
apiVersion: backstage.io/v1alpha1
kind: Group
metadata:
  name: payments-team
  description: Payments engineering team
spec:
  type: team
  parent: finance-org
  children: []
  members:
    - jane.doe
    - john.smith

---
apiVersion: backstage.io/v1alpha1
kind: User
metadata:
  name: jane.doe
spec:
  profile:
    displayName: Jane Doe
    email: jane.doe@example.com
  memberOf:
    - payments-team
```

### Multi-Entity File

A single `catalog-info.yaml` can contain multiple entities using YAML document separators:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: payment-service
spec:
  type: service
  lifecycle: production
  owner: group:payments-team
  providesApis:
    - payment-api
---
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: payment-api
spec:
  type: openapi
  lifecycle: production
  owner: group:payments-team
  definition:
    $text: ./openapi.yaml
```

---

## 6. Software Templates (Scaffolder)

The Scaffolder is Backstage's system for creating new software projects using predefined templates. This is how organizations implement golden paths.

### How Templates Work

```
Developer                  Backstage                    Git Provider
    |                         |                              |
    |  1. Select template     |                              |
    |------------------------>|                              |
    |                         |                              |
    |  2. Fill in parameters  |                              |
    |  (service name, owner,  |                              |
    |   language, etc.)       |                              |
    |------------------------>|                              |
    |                         |                              |
    |                         |  3. Execute scaffolder       |
    |                         |     actions:                 |
    |                         |     - Fetch template         |
    |                         |     - Apply parameters       |
    |                         |     - Create repo            |
    |                         |  --------------------------->|
    |                         |                              |
    |                         |     - Set up CI/CD           |
    |                         |     - Register in catalog    |
    |                         |     - Create PR              |
    |                         |  --------------------------->|
    |                         |                              |
    |  4. Return repo URL     |                              |
    |<------------------------|                              |
```

### Template Definition

```yaml
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: nodejs-service
  title: Node.js Microservice
  description: |
    Creates a new Node.js microservice with Express,
    TypeScript, Docker, CI/CD, and monitoring pre-configured.
  tags:
    - nodejs
    - typescript
    - recommended
spec:
  owner: group:platform-team
  type: service

  parameters:
    - title: Service Information
      required:
        - name
        - owner
        - description
      properties:
        name:
          title: Service Name
          type: string
          description: Unique name for the service
          pattern: '^[a-z][a-z0-9-]*$'
          ui:autofocus: true
        description:
          title: Description
          type: string
        owner:
          title: Owner
          type: string
          description: Team that owns this service
          ui:field: OwnerPicker
          ui:options:
            catalogFilter:
              kind: Group

    - title: Infrastructure
      required:
        - database
        - cloud
      properties:
        database:
          title: Database
          type: string
          enum:
            - postgresql
            - mongodb
            - none
          default: postgresql
        cloud:
          title: Cloud Provider
          type: string
          enum:
            - aws
            - gcp
          default: aws
        enableMonitoring:
          title: Enable Monitoring
          type: boolean
          default: true

  steps:
    - id: fetch-template
      name: Fetch Template
      action: fetch:template
      input:
        url: ./skeleton
        values:
          name: ${{ parameters.name }}
          description: ${{ parameters.description }}
          owner: ${{ parameters.owner }}
          database: ${{ parameters.database }}

    - id: publish
      name: Publish to GitHub
      action: publish:github
      input:
        allowedHosts: ['github.com']
        repoUrl: github.com?owner=my-org&repo=${{ parameters.name }}
        description: ${{ parameters.description }}
        defaultBranch: main
        repoVisibility: internal

    - id: create-argocd-app
      name: Create ArgoCD Application
      action: argocd:create-resources
      input:
        appName: ${{ parameters.name }}
        projectName: default
        namespace: ${{ parameters.name }}
        repoUrl: https://github.com/my-org/${{ parameters.name }}

    - id: register
      name: Register in Catalog
      action: catalog:register
      input:
        repoContentsUrl: ${{ steps['publish'].output.repoContentsUrl }}
        catalogInfoPath: /catalog-info.yaml

  output:
    links:
      - title: Repository
        url: ${{ steps['publish'].output.remoteUrl }}
      - title: Open in Backstage
        icon: catalog
        entityRef: ${{ steps['register'].output.entityRef }}
```

### Built-in Scaffolder Actions

| Action | Description |
|--------|-------------|
| `fetch:template` | Fetch and template files using Nunjucks |
| `fetch:plain` | Fetch files without templating |
| `publish:github` | Create a GitHub repository |
| `publish:gitlab` | Create a GitLab project |
| `catalog:register` | Register entity in the Backstage catalog |
| `catalog:write` | Write a catalog-info.yaml file |
| `debug:log` | Log a message (for debugging templates) |

### Custom Actions

```typescript
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';

export const createSlackChannelAction = createTemplateAction<{
  channelName: string;
  description: string;
}>({
  id: 'custom:slack:create-channel',
  description: 'Creates a Slack channel for the new service',
  schema: {
    input: {
      required: ['channelName'],
      type: 'object',
      properties: {
        channelName: {
          type: 'string',
          title: 'Channel Name',
        },
        description: {
          type: 'string',
          title: 'Channel Description',
        },
      },
    },
  },
  async handler(ctx) {
    const { channelName, description } = ctx.input;
    ctx.logger.info(`Creating Slack channel: #${channelName}`);

    // Call Slack API to create channel
    const response = await fetch('https://slack.com/api/conversations.create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: channelName,
        description: description,
      }),
    });

    const result = await response.json();
    ctx.output('channelId', result.channel.id);
    ctx.output('channelUrl', `https://slack.com/channel/${result.channel.id}`);
  },
});
```

---

## 7. TechDocs (Docs-as-Code)

TechDocs is Backstage's built-in documentation solution that follows the docs-as-code approach — documentation lives alongside the code in the same repository.

### How TechDocs Works

```
Repository                     Build Process              Backstage
+------------------+          +------------------+       +------------------+
| /docs/           |          |                  |       |                  |
|   index.md       | -------> | MkDocs builds    | ----> | TechDocs         |
|   architecture.md|          | HTML from        |       | plugin renders   |
|   api-guide.md   |          | Markdown         |       | documentation    |
| mkdocs.yml       |          |                  |       |                  |
+------------------+          +------------------+       +------------------+
```

### Setting Up TechDocs

#### 1. Add mkdocs.yml to Your Repository

```yaml
site_name: Payment Service
site_description: Documentation for the Payment Service

nav:
  - Home: index.md
  - Architecture: architecture.md
  - API Guide: api-guide.md
  - Runbook: runbook.md
  - ADRs:
    - ADR-001 Database Choice: adrs/001-database.md
    - ADR-002 API Design: adrs/002-api-design.md

plugins:
  - techdocs-core
```

#### 2. Add TechDocs Annotation to catalog-info.yaml

```yaml
metadata:
  annotations:
    backstage.io/techdocs-ref: dir:.
```

#### 3. Write Documentation in Markdown

```markdown
# Payment Service

## Overview

The Payment Service handles all payment processing for the platform.

## Architecture

```
[Client] --> [API Gateway] --> [Payment Service] --> [Payment Provider]
                                     |
                                     v
                              [Payments DB]
```

## Running Locally

```bash
npm install
npm run dev
```
```

### TechDocs Generation Strategies

| Strategy | Description | When to Use |
|----------|-------------|-------------|
| **Local** | Backstage backend builds docs at read time | Development, small orgs |
| **External (CI/CD)** | Docs built in CI, stored in object storage | Production, large orgs |

```yaml
# app-config.yaml for external TechDocs
techdocs:
  builder: 'external'
  generator:
    runIn: 'local'
  publisher:
    type: 'awsS3'
    awsS3:
      bucketName: 'backstage-techdocs'
      region: 'us-east-1'
```

---

## 8. Plugin Ecosystem

Backstage's power comes from its extensible plugin architecture. Over 100 open-source plugins are available, and organizations can build custom ones.

### Popular Plugins

| Plugin | Category | Description |
|--------|----------|-------------|
| `@backstage/plugin-kubernetes` | Infrastructure | View K8s workloads per service |
| `@backstage/plugin-github-actions` | CI/CD | View GitHub Actions workflow runs |
| `@backstage/plugin-jenkins` | CI/CD | View Jenkins build status |
| `@backstage/plugin-tech-radar` | Visualization | Technology radar for the org |
| `@backstage/plugin-cost-insights` | FinOps | Cloud cost per team/service |
| `@backstage/plugin-pagerduty` | Incident Mgmt | PagerDuty integration |
| `@backstage/plugin-sonarqube` | Code Quality | SonarQube metrics |
| `@backstage/plugin-todo` | Developer Tools | Track TODOs in codebase |
| `@backstage/plugin-lighthouse` | Performance | Lighthouse audit results |
| `@backstage/plugin-api-docs` | API | Render OpenAPI/AsyncAPI specs |

### Kubernetes Plugin

```
+------------------------------------------------------------------+
|  Payment Service - Kubernetes Tab                                 |
|                                                                  |
|  Cluster: production-us-east-1                                   |
|  Namespace: payments                                             |
|                                                                  |
|  Deployments:                                                    |
|  +---------------------------+---------+----------+-----------+  |
|  | Name                      | Pods    | Status   | Version   |  |
|  +---------------------------+---------+----------+-----------+  |
|  | payment-service           | 3/3     | Healthy  | v2.4.1    |  |
|  | payment-worker            | 2/2     | Healthy  | v2.4.1    |  |
|  +---------------------------+---------+----------+-----------+  |
|                                                                  |
|  Recent Pod Events:                                              |
|  - payment-service-abc12: Started (2 min ago)                    |
|  - payment-service-def34: Pulled image (5 min ago)               |
+------------------------------------------------------------------+
```

### Building a Custom Plugin

```bash
# Create a new plugin
cd packages
npx @backstage/cli new --select plugin
# Enter plugin name: my-custom-plugin
```

```typescript
// plugins/my-custom-plugin/src/plugin.ts
import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

export const myCustomPlugin = createPlugin({
  id: 'my-custom-plugin',
  routes: {
    root: rootRouteRef,
  },
});

export const MyCustomPage = myCustomPlugin.provide(
  createRoutableExtension({
    name: 'MyCustomPage',
    component: () =>
      import('./components/MyCustomPage').then(m => m.MyCustomPage),
    mountPoint: rootRouteRef,
  }),
);
```

```typescript
// plugins/my-custom-plugin/src/components/MyCustomPage.tsx
import React from 'react';
import {
  Header,
  Page,
  Content,
  ContentHeader,
  SupportButton,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';

export const MyCustomPage = () => {
  const { entity } = useEntity();

  return (
    <Page themeId="tool">
      <Header title="My Custom Plugin" />
      <Content>
        <ContentHeader title={entity.metadata.name}>
          <SupportButton>Custom plugin for platform team.</SupportButton>
        </ContentHeader>
        {/* Plugin content here */}
      </Content>
    </Page>
  );
};
```

---

## 9. Search Platform

Backstage includes a built-in search platform that provides a unified search experience across all catalog entities, TechDocs, and plugin-provided content.

### Search Architecture

```
+------------------+
|   Search Bar     |
|   (Frontend)     |
+--------+---------+
         |
+--------v---------+
|  Search Backend   |
|  (Collators +     |
|   Search Engine)  |
+--------+---------+
         |
    +----+----+
    |         |
+---v---+ +---v-------+
|Lunr   | |Elasticsearch|
|(local)| |(production) |
+-------+ +-------------+
```

### Search Collators

Collators index content from various sources:

```typescript
// Custom search collator
import { Readable } from 'stream';
import { DocumentCollatorFactory } from '@backstage/plugin-search-common';

export class CustomCollatorFactory implements DocumentCollatorFactory {
  readonly type = 'custom-docs';

  async getCollator() {
    return Readable.from(this.execute());
  }

  private async *execute() {
    const items = await fetchCustomData();
    for (const item of items) {
      yield {
        title: item.name,
        text: item.description,
        location: `/custom/${item.id}`,
      };
    }
  }
}
```

---

## 10. Permissions Framework

The Backstage permissions framework provides fine-grained access control over catalog entities and plugin features.

### Permission Model

```
+------------------+     +------------------+     +------------------+
|   User Request   | --> | Permission       | --> | Policy Decision  |
|   (e.g., delete  |     | Evaluation       |     |                  |
|    a component)  |     |                  |     | ALLOW / DENY /   |
+------------------+     +--------+---------+     | CONDITIONAL      |
                                  |               +------------------+
                         +--------v---------+
                         | Permission       |
                         | Policy           |
                         | (custom logic)   |
                         +------------------+
```

### Defining a Permission Policy

```typescript
import {
  PolicyDecision,
  AuthorizeResult,
} from '@backstage/plugin-permission-common';
import {
  PermissionPolicy,
  PolicyQuery,
} from '@backstage/plugin-permission-node';
import { BackstageIdentityResponse } from '@backstage/plugin-auth-node';

class CustomPermissionPolicy implements PermissionPolicy {
  async handle(
    request: PolicyQuery,
    user?: BackstageIdentityResponse,
  ): Promise<PolicyDecision> {
    // Allow all read operations
    if (request.permission.attributes.action === 'read') {
      return { result: AuthorizeResult.ALLOW };
    }

    // Only owners can update or delete
    if (
      request.permission.attributes.action === 'update' ||
      request.permission.attributes.action === 'delete'
    ) {
      // Check if user is the owner of the entity
      const ownershipRefs = user?.identity.ownershipEntityRefs ?? [];
      return {
        result: AuthorizeResult.CONDITIONAL,
        pluginId: 'catalog',
        resourceType: 'catalog-entity',
        conditions: {
          rule: 'IS_ENTITY_OWNER',
          params: { claims: ownershipRefs },
        },
      };
    }

    return { result: AuthorizeResult.DENY };
  }
}
```

---

## 11. Setting Up Backstage

### Quick Start

```bash
# Create a new Backstage app
npx @backstage/create-app@latest

# Follow the prompts to name your app
# cd into the app directory

cd my-backstage-app

# Start in development mode
yarn dev
```

### Project Structure

```
my-backstage-app/
├── app-config.yaml              # Main configuration
├── app-config.production.yaml   # Production overrides
├── catalog-info.yaml            # Backstage's own catalog entry
├── packages/
│   ├── app/                     # Frontend application
│   │   ├── src/
│   │   │   ├── App.tsx          # App component with routes
│   │   │   └── components/      # Custom components
│   │   └── package.json
│   └── backend/                 # Backend application
│       ├── src/
│       │   └── index.ts         # Backend entry point
│       └── package.json
├── plugins/                     # Custom plugins directory
└── package.json
```

### Configuration (app-config.yaml)

```yaml
app:
  title: My Company Developer Portal
  baseUrl: http://localhost:3000

organization:
  name: My Company

backend:
  baseUrl: http://localhost:7007
  listen:
    port: 7007
  database:
    client: pg
    connection:
      host: localhost
      port: 5432
      user: backstage
      password: ${POSTGRES_PASSWORD}

auth:
  environment: development
  providers:
    github:
      development:
        clientId: ${GITHUB_CLIENT_ID}
        clientSecret: ${GITHUB_CLIENT_SECRET}

catalog:
  import:
    entityFilename: catalog-info.yaml
  rules:
    - allow: [Component, System, API, Resource, Location, Domain, Group, User, Template]
  locations:
    - type: file
      target: ../../examples/entities.yaml
    - type: file
      target: ../../examples/template/template.yaml
      rules:
        - allow: [Template]
  providers:
    github:
      myOrg:
        organization: 'my-org'
        catalogPath: '/catalog-info.yaml'
        schedule:
          frequency: { minutes: 30 }
          timeout: { minutes: 3 }

techdocs:
  builder: 'local'
  generator:
    runIn: 'local'
  publisher:
    type: 'local'

kubernetes:
  serviceLocatorMethod:
    type: 'multiTenant'
  clusterLocatorMethods:
    - type: 'config'
      clusters:
        - url: https://k8s.example.com
          name: production
          authProvider: 'serviceAccount'
          serviceAccountToken: ${K8S_TOKEN}
```

---

## 12. Customization

### Custom Theme

```typescript
import { createTheme, lightTheme } from '@backstage/theme';

const myTheme = createTheme({
  palette: {
    ...lightTheme.palette,
    primary: {
      main: '#1DB954', // Spotify green
    },
    secondary: {
      main: '#191414',
    },
    navigation: {
      background: '#191414',
      indicator: '#1DB954',
      color: '#ffffff',
      selectedColor: '#1DB954',
    },
  },
  defaultPageTheme: 'home',
  fontFamily: 'Inter, sans-serif',
});
```

### Custom Homepage

```typescript
import React from 'react';
import { HomePageToolkit, HomePageStarredEntities } from '@backstage/plugin-home';
import { SearchBar } from '@backstage/plugin-search-react';

export const HomePage = () => (
  <Page themeId="home">
    <Header title="Developer Portal" />
    <Content>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <SearchBar />
        </Grid>
        <Grid item xs={12} md={6}>
          <HomePageStarredEntities />
        </Grid>
        <Grid item xs={12} md={6}>
          <HomePageToolkit tools={[
            { url: '/create', label: 'Create Service', icon: <AddIcon /> },
            { url: '/docs', label: 'Documentation', icon: <DocsIcon /> },
          ]} />
        </Grid>
      </Grid>
    </Content>
  </Page>
);
```

---

## 13. Deploying Backstage

### Deployment Options

| Option | Pros | Cons |
|--------|------|------|
| **Kubernetes** | Scalable, standard | Requires K8s cluster |
| **Docker Compose** | Simple, local-friendly | Limited scalability |
| **VM/Cloud Instance** | Simple | Manual management |
| **Managed (Roadie, Spotify Portal)** | Zero ops | Less customization |

### Kubernetes Deployment

```yaml
# backstage-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backstage
  namespace: backstage
spec:
  replicas: 2
  selector:
    matchLabels:
      app: backstage
  template:
    metadata:
      labels:
        app: backstage
    spec:
      containers:
        - name: backstage
          image: my-org/backstage:latest
          ports:
            - containerPort: 7007
          env:
            - name: POSTGRES_HOST
              valueFrom:
                secretKeyRef:
                  name: backstage-secrets
                  key: postgres-host
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: backstage-secrets
                  key: postgres-password
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "500m"
          readinessProbe:
            httpGet:
              path: /healthcheck
              port: 7007
            initialDelaySeconds: 30
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: backstage
  namespace: backstage
spec:
  type: ClusterIP
  selector:
    app: backstage
  ports:
    - port: 80
      targetPort: 7007
```

### Dockerfile

```dockerfile
FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY . .

RUN yarn install --frozen-lockfile
RUN yarn tsc
RUN yarn build:backend

FROM node:20-bookworm-slim

WORKDIR /app

COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/app-config.yaml ./app-config.yaml
COPY --from=build /app/app-config.production.yaml ./app-config.production.yaml

RUN yarn install --frozen-lockfile --production

CMD ["node", "packages/backend", "--config", "app-config.yaml", "--config", "app-config.production.yaml"]
```

---

## 14. Common Interview Questions

### Architecture Questions

**Q: Explain the architecture of Backstage.**
A: Backstage has a three-tier architecture: (1) React frontend SPA using Material UI, where each plugin mounts as a route, (2) Node.js/Express backend with a plugin-based architecture where each plugin registers API routes, and (3) PostgreSQL database for persistent storage. Plugins span both frontend and backend, communicating via REST APIs. The system integrates with external services (GitHub, K8s, CI/CD) through plugin-specific backends.

**Q: What is the Software Catalog and what entity types does it support?**
A: The Software Catalog is Backstage's core feature that tracks all software assets and their relationships. It supports entity kinds including Component (services, libraries, websites), API (interfaces), System (collection of related components), Domain (business area), Resource (infrastructure), Group (teams), User (individuals), Location (where catalog data is found), and Template (scaffolding templates). Entities are defined in catalog-info.yaml files.

**Q: How does the Scaffolder work?**
A: The Scaffolder is Backstage's templating system. Templates are defined in YAML with parameters (form fields) and steps (actions). When a developer uses a template, they fill in parameters via a form, then the Scaffolder executes steps sequentially: fetching and rendering template files, creating a Git repository, setting up CI/CD, registering the new service in the catalog, and returning links. Custom actions can be created for organization-specific steps like creating Slack channels or Jira projects.

### Implementation Questions

**Q: How would you roll out Backstage to an organization with 200 engineers?**
A: Phase 1 (Month 1-2): Deploy Backstage with the Software Catalog populated via GitHub discovery. Register all existing services. Phase 2 (Month 3-4): Add TechDocs and create documentation standards. Build 2-3 software templates for the most common service types. Phase 3 (Month 5-6): Add plugins for K8s, CI/CD, and on-call. Phase 4 (Ongoing): Measure adoption, gather feedback, add custom plugins for internal tools. Start with a champion team, publicize their success, then expand. Never mandate — demonstrate value.

**Q: How would you handle Backstage catalog data going stale?**
A: Implement automated discovery (GitHub/GitLab providers) instead of manual registration. Set up catalog rules that require certain annotations. Build a "catalog health" scorecard that flags entities missing required metadata. Use entity processors to enrich data from external sources (deployment status, ownership from HR systems). Run periodic audits. Consider building a CI check that validates catalog-info.yaml on every PR.

**Q: How do you secure Backstage?**
A: Use the permissions framework for fine-grained access control. Integrate with an identity provider (Okta, Google, GitHub) for authentication. Apply RBAC so only owners can modify their entities. Secure the backend with network policies in K8s. Use secrets management (Vault) for sensitive configuration. Enable audit logging. Restrict template actions to prevent unauthorized resource creation.

---

## 15. Quick Reference

### Key Annotations

| Annotation | Purpose |
|-----------|---------|
| `backstage.io/techdocs-ref` | TechDocs source location |
| `backstage.io/kubernetes-id` | Kubernetes workload identifier |
| `github.com/project-slug` | GitHub repository reference |
| `jenkins.io/job-full-name` | Jenkins job reference |
| `pagerduty.com/service-id` | PagerDuty service ID |
| `sonarqube.org/project-key` | SonarQube project key |
| `backstage.io/source-location` | Source code location |

### Essential CLI Commands

```bash
# Create new Backstage app
npx @backstage/create-app@latest

# Start development
yarn dev

# Build backend
yarn build:backend

# Create new plugin
yarn new --select plugin

# Create new backend plugin
yarn new --select backend-plugin

# Run database migrations
yarn backstage-cli db:migrate
```

### Backstage Ecosystem

| Tool | Description |
|------|-------------|
| **Roadie** | Managed Backstage SaaS |
| **Spotify Portal** | Spotify's managed Backstage offering |
| **Backstage CLI** | Official development CLI |
| **Backstage Marketplace** | Community plugin directory |

### Mental Model

```
Backstage = Software Catalog (what exists)
           + Software Templates (create new things)
           + TechDocs (document things)
           + Plugins (integrate everything)
           + Search (find anything)
           + Permissions (control access)
```
