# Search & Filtering

## What Is It?

Search and filtering is how users find what they're looking for in your app. It's the search bar, the filter sidebar, the sort dropdown, the autocomplete suggestions. Whether it's an e-commerce site with 10,000 products, a job board with listings, or an internal dashboard with thousands of records — search is how people navigate your content. It seems simple from the outside, but the business logic behind relevance, ranking, and faceted filtering is surprisingly deep.

## Why Should You Care?

Bad search drives users away. If someone searches for "blue running shoes" and gets winter boots, they leave. Studies show that site search users convert at 2-3x the rate of non-searchers — they know what they want and they're ready to act. As a developer, you'll build search features in almost every data-heavy app. Understanding the business side (what "relevance" means, how facets work, why autocomplete matters) helps you build search that actually helps people.

## How It Works (The Business Flow)

### Basic Search Flow

1. User types a query into a search bar
2. Client sends the query to the server (with any active filters)
3. Server searches the index/database for matching results
4. Results are ranked by relevance
5. Results page shows items with highlighting, pagination, and filter options
6. User refines with filters or tries a new query

### Full-Text Search

Unlike database `LIKE` queries, full-text search understands language:

1. **Indexing**: Content is processed at write time — tokenized (split into words), stemmed (running → run), and stored in an inverted index
2. **Querying**: User's search query goes through the same processing
3. **Matching**: The engine finds documents that contain the processed query terms
4. **Scoring**: Results are ranked by relevance (how many terms matched, where they appear, how rare the terms are)

### Faceted Filtering

Facets are the filter sidebar you see on e-commerce sites:

```
Category:     [Electronics] [Clothing] [Books]
Price Range:  [$0-25] [$25-50] [$50-100] [$100+]
Brand:        [Nike (42)] [Adidas (38)] [Puma (15)]
Color:        [Red (12)] [Blue (28)] [Black (55)]
Rating:       [4+ stars (120)]
```

Each facet shows available values AND the count of matching items. Selecting a facet narrows results and updates other facet counts in real-time.

**How it works:**

1. User applies a filter (e.g., Brand = Nike)
2. Query re-executes with the filter applied
3. Results narrow to Nike products only
4. Other facets update their counts (Color might now show Red (3), Blue (8))
5. The selected facet stays highlighted so users know what's active

### Autocomplete & Suggestions

1. User starts typing in the search bar
2. After 2-3 characters, the system returns suggestions
3. Suggestions come from: popular searches, product names, category names, recent user searches
4. User can click a suggestion or keep typing
5. "Did you mean...?" handles typos (fuzzy matching)

### Sorting

Results can be sorted by different criteria. The default is usually "relevance" (best match first), but users can switch to:

- **Price: Low to High / High to Low**
- **Newest First** (most recently added)
- **Most Popular** (best sellers, most views)
- **Rating** (highest rated)
- **Distance** (nearest, for location-based search)

## Key Terms You'll Hear

| Term                 | What It Means                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Full-Text Search** | Searching content by words/phrases with language awareness (stemming, synonyms)                            |
| **Inverted Index**   | A data structure that maps words to documents. The secret sauce behind fast search                         |
| **Relevance**        | How well a result matches the user's intent. The hardest part of search                                    |
| **Facet**            | A filterable dimension of the data (category, price range, brand) with counts                              |
| **Tokenization**     | Breaking text into individual words or terms for indexing                                                  |
| **Stemming**         | Reducing words to their root form (running, runs, ran → run)                                               |
| **Synonyms**         | Treating different words as equivalent (couch = sofa, laptop = notebook)                                   |
| **Fuzzy Matching**   | Finding results even when the query has typos (iphne → iPhone)                                             |
| **Boosting**         | Giving extra weight to certain fields or documents in ranking (title matches count more than body matches) |
| **Zero Results**     | When a search returns nothing. A major UX failure — always offer alternatives                              |
| **Search Analytics** | Tracking what people search for, what they click, and where they give up                                   |
| **Elasticsearch**    | The most popular open-source search engine. Built on Apache Lucene                                         |

## Common Patterns

### Pattern 1: Database Search (SQL LIKE / ILIKE)

Use the database's built-in search capabilities. PostgreSQL has solid full-text search with `tsvector` and `tsquery`.

**When it's used:** Small datasets (<100K records), simple search needs, don't want extra infrastructure.

**Trade-off:** Limited relevance ranking, no faceting, slower on large datasets.

### Pattern 2: Dedicated Search Engine (Elasticsearch / OpenSearch)

Data is indexed in a separate search engine. Your app queries the search engine for searches and the primary database for other operations.

**When it's used:** Any app with serious search needs — e-commerce, content platforms, SaaS with lots of data.

**Trade-off:** Additional infrastructure. Data must be synced between your database and the search index.

### Pattern 3: Search-as-a-Service (Algolia, Typesense, Meilisearch)

Managed search service. You push data to their API, they handle indexing, ranking, and serving.

**When it's used:** Teams that want great search without managing infrastructure.

**Trade-off:** Cost scales with usage. Less control over ranking algorithms. Vendor lock-in.

### Pattern 4: AI/Vector Search

Semantic search using embeddings. Instead of matching keywords, it understands meaning ("comfortable shoes" finds "ergonomic sneakers").

**When it's used:** Product discovery, knowledge bases, chat-with-your-docs features.

**Trade-off:** Requires embedding generation, vector database (Pinecone, pgvector). Can feel "too smart" — sometimes users want exact keyword match.

## Gotchas & Edge Cases

- **Zero results page**: Never show a blank page. Offer: spelling suggestions, popular items, relaxed filters. "No results for 'bleu shoes'. Did you mean 'blue shoes'?"
- **Search index lag**: When you add a product, it might not appear in search for a few seconds/minutes until the index updates. Users get confused when they can see a product page but can't find it via search.
- **Facet count accuracy**: Counts must be accurate or users lose trust. If "Nike (42)" is shown but filtering returns 38 items, something is wrong.
- **Performance with many facets**: Each facet requires aggregation. Too many facets = slow queries. Limit to the most useful 5-8 facets.
- **Empty filters**: Don't show filter values that would return zero results. If no products are red, don't show "Red (0)."
- **URL-driven search**: Encode search state in the URL (`?q=shoes&brand=nike&sort=price_asc`). This makes search results shareable and bookmarkable.
- **Search abuse**: People will search for SQL injection, XSS payloads, and garbage. Sanitize queries and set length limits.
- **Language-specific search**: English stemming doesn't work for Chinese or Japanese. Different languages need different analyzers.

## Quick Reference

| Dataset Size         | Recommended Approach                       |
| -------------------- | ------------------------------------------ |
| <10K records         | Database LIKE/full-text search             |
| 10K-1M records       | PostgreSQL full-text search or Meilisearch |
| 1M+ records          | Elasticsearch / OpenSearch                 |
| Need managed service | Algolia or Typesense                       |
| Semantic / AI search | Vector search (pgvector, Pinecone)         |
| Autocomplete only    | Prefix-based index or trie structure       |
