# Internationalization

## What Is It?

Internationalization (i18n) is making your app work for people around the world — different languages, currencies, date formats, number formats, text directions, and cultural conventions. Localization (l10n) is the actual work of adapting for a specific locale (translating text, formatting dates for Germany, etc.). As a developer, i18n is building the infrastructure that makes localization possible. You're creating the framework; translators fill in the content.

## Why Should You Care?

Going global is a business growth strategy, and developers make it possible or impossible. If your app hardcodes English strings, American date formats, and USD prices into the code, adding another language means rewriting huge chunks of the app. If you plan for i18n from the start, adding a new language is mostly a translation exercise. Even if your app is English-only today, building with i18n patterns saves enormous pain later.

## How It Works (The Business Flow)

### Text Translation

The core of i18n — all user-facing text comes from translation files, not hardcoded strings.

```
// WRONG: Hardcoded
<h1>Welcome back!</h1>

// RIGHT: Translation key
<h1>{t('welcome_back')}</h1>
```

Translation files:
```json
// en.json
{ "welcome_back": "Welcome back!" }

// zh.json
{ "welcome_back": "欢迎回来！" }

// de.json
{ "welcome_back": "Willkommen zurück!" }
```

### Locale Detection & Selection

How the app decides which language to show:

1. **URL-based**: `/en/about`, `/zh/about` — language in the URL path
2. **Subdomain**: `en.yourapp.com`, `zh.yourapp.com`
3. **Browser preference**: Read the `Accept-Language` header
4. **User setting**: User picks their language in profile settings
5. **Cookie/Storage**: Remember the user's last choice

Priority usually goes: User setting > URL > Cookie > Browser > Default.

### Date, Time, and Number Formatting

These vary wildly by locale:

| Format | US (en-US) | Germany (de-DE) | China (zh-CN) | Japan (ja-JP) |
|--------|-----------|-----------------|---------------|---------------|
| Date | 03/01/2026 | 01.03.2026 | 2026/03/01 | 2026年3月1日 |
| Number | 1,234.56 | 1.234,56 | 1,234.56 | 1,234.56 |
| Currency | $1,234.56 | 1.234,56 € | ¥1,234.56 | ¥1,234 |
| Time | 3:30 PM | 15:30 | 15:30 | 15:30 |

Use the `Intl` API (built into JavaScript) to format these correctly.

### Currency Handling

Currency is NOT just "add a dollar sign":

1. Store amounts in the smallest unit (cents) as integers — never floats
2. Store the currency code alongside the amount (USD, EUR, CNY)
3. Display using the locale's formatting rules
4. Exchange rates are external data — fetch from a service (Open Exchange Rates, fixer.io)
5. Currency conversion should happen server-side with clearly stated rates

### Pluralization

Different languages have different plural rules:

- **English**: 1 item, 2 items (2 forms)
- **Chinese**: 1 个项目 (1 form — no plural distinction)
- **Arabic**: 0 items, 1 item, 2 items, few items, many items, other items (6 forms!)

Your i18n library must handle this. ICU MessageFormat is the standard:

```
{count, plural, =0 {No items} one {1 item} other {{count} items}}
```

### Right-to-Left (RTL) Languages

Arabic, Hebrew, Farsi, and Urdu are written right-to-left. This affects:

- Text alignment flips
- Layout mirrors (sidebar on the right, back buttons on the right)
- Icons may need to flip (directional arrows)
- CSS uses `direction: rtl` and logical properties (`margin-inline-start` instead of `margin-left`)

## Key Terms You'll Hear

| Term | What It Means |
|------|---------------|
| **i18n** | Internationalization — building the system to support multiple locales |
| **l10n** | Localization — adapting the product for a specific locale |
| **Locale** | A combination of language + region (en-US, zh-CN, pt-BR). Determines formatting rules |
| **Translation Key** | An identifier that maps to translated text (e.g., `welcome_back`) |
| **Translation File** | A file (JSON, YAML, PO) containing all translations for a locale |
| **ICU MessageFormat** | A standard for handling complex translation patterns (plurals, gender, select) |
| **RTL** | Right-to-Left — languages like Arabic and Hebrew that read right to left |
| **Locale Fallback** | If `zh-TW` translation is missing, fall back to `zh`, then to `en` |
| **String Extraction** | Automatically finding translatable strings in code and generating translation files |
| **TMS** | Translation Management System — a platform where translators work (Crowdin, Phrase, Lokalise) |
| **Machine Translation** | Using AI to generate initial translations (Google Translate, DeepL). Usually needs human review |
| **Pseudo-Localization** | Replacing English text with accented characters (Ŵéĺçöḿé) to visually test i18n without real translations |

## Common Patterns

### Pattern 1: JSON Translation Files

One JSON file per locale, bundled with the app. Loaded at build time or on demand.

**When it's used:** Most web apps. Frameworks like Next.js, React (react-i18next, next-intl) use this.

**Trade-off:** Simple to implement. But updating translations requires a code deployment.

### Pattern 2: Remote Translation (CMS-Driven)

Translations are stored in a CMS or TMS and fetched at runtime. Translators update text without a deploy.

**When it's used:** Large apps with frequent copy changes, marketing-heavy content.

**Trade-off:** Runtime dependency on the translation service. Need caching strategy.

### Pattern 3: Locale-Based Routing

Each locale has its own URL path. The locale is part of the route, not just a cookie.

```
/en/pricing
/zh/pricing
/de/pricing
```

**When it's used:** SEO-important sites (search engines index different language versions separately).

**Trade-off:** More routing complexity. But best for SEO and shareability.

### Pattern 4: Separate Builds per Locale

Each locale gets its own build (or bundle). Only the relevant translations are included.

**When it's used:** High-performance apps where bundle size matters.

**Trade-off:** Smaller bundles per locale but longer build times. More complex deployment.

## Gotchas & Edge Cases

- **Text expansion**: German text is ~30% longer than English. Chinese is ~30% shorter. Your UI must handle both. Buttons that say "Submit" in English might say "Formular absenden" in German. Don't set fixed widths on text elements.
- **Don't concatenate strings**: `"Hello " + name + ", you have " + count + " messages"` — this breaks in languages where word order is different. Use template variables: `"Hello {name}, you have {count} messages"`.
- **Images with text**: If your images contain text (banners, diagrams), they need separate versions per locale. Better: use CSS text overlays on images.
- **Sorting and comparison**: Alphabetical order is different in different languages. Use `Intl.Collator` for locale-aware sorting.
- **Input validation**: Email addresses can contain international characters (IDN). Names can have accents, diacritics, and characters from any script. Don't validate with ASCII-only regex.
- **Timezone is not locale**: A French speaker in New York needs French text but US Eastern time. Don't assume locale = timezone.
- **Legal content**: Privacy policies, terms of service, and cookie banners may need to be in the local language by law (GDPR requires it in the user's language).
- **Numbers in translations**: "You have 5 messages" — the number 5 should be formatted according to the locale (5 in English, ٥ in Arabic). Most i18n libraries handle this.

## Quick Reference

| Aspect | Implementation |
|--------|---------------|
| Text | Translation keys + JSON files per locale |
| Dates | `Intl.DateTimeFormat` with locale parameter |
| Numbers | `Intl.NumberFormat` with locale parameter |
| Currency | Store in cents + currency code, format with `Intl.NumberFormat` |
| Plurals | ICU MessageFormat or library support (i18next, FormatJS) |
| RTL | CSS `direction: rtl`, logical properties, mirrored layouts |
| URL routing | `/[locale]/path` pattern |
| Fallback | Specific locale → language → default locale |
