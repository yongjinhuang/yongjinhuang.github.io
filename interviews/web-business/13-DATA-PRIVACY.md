# Data Privacy & Compliance

## What Is It?

Data privacy is about protecting the personal information your app collects, stores, and processes. Compliance means following the laws that govern how you handle that data — GDPR in Europe, CCPA in California, LGPD in Brazil, PIPL in China, and many more. As a developer, you're the one actually building the systems that collect, store, and (when requested) delete personal data. If your code doesn't respect privacy rules, your company faces massive fines.

## Why Should You Care?

GDPR fines can be up to 4% of global annual revenue or 20 million euros, whichever is higher. Amazon got a 746 million euro fine. Meta got 1.2 billion euros. These aren't theoretical. Beyond fines, data breaches destroy user trust and make headlines. As a developer, privacy requirements directly affect how you design databases, APIs, analytics, and data flows. It's not a legal problem you can ignore — it shows up in your code.

## How It Works (The Business Flow)

### What Counts as Personal Data?

Anything that can identify a person, directly or indirectly:

- **Obviously personal**: Name, email, phone number, address, date of birth, photo
- **Less obvious**: IP address, device ID, cookie ID, location data, browsing history
- **Sensitive (extra protection needed)**: Race, ethnicity, health data, biometric data, sexual orientation, political opinions, criminal records

If you can link it back to a specific human, it's personal data.

### Lawful Basis for Processing

You need a legal reason to collect and use personal data. The main ones under GDPR:

1. **Consent**: User explicitly agrees (opt-in checkbox, cookie banner). Must be freely given, specific, and revocable.
2. **Contract**: You need the data to fulfill a contract (e.g., shipping address to deliver an order)
3. **Legitimate Interest**: You have a reasonable business need (e.g., fraud detection). Must be balanced against user rights
4. **Legal Obligation**: The law requires you to keep the data (e.g., financial records for tax purposes)

### User Rights (Data Subject Rights)

Users have rights over their data. Your system must support these:

| Right                                        | What It Means                                | Your System Must...                                     |
| -------------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| **Right to Access**                          | "Show me all data you have about me"         | Export user's data in a readable format                 |
| **Right to Rectification**                   | "Fix my incorrect data"                      | Allow users to edit their personal info                 |
| **Right to Erasure** (Right to be Forgotten) | "Delete all my data"                         | Delete user's data (with exceptions for legal holds)    |
| **Right to Data Portability**                | "Give me my data so I can take it elsewhere" | Export data in a machine-readable format (JSON, CSV)    |
| **Right to Restrict Processing**             | "Stop using my data but keep it"             | Flag account to prevent processing while retaining data |
| **Right to Object**                          | "Stop using my data for marketing"           | Opt-out of specific processing activities               |

### Consent Management

1. User visits your site for the first time
2. Cookie banner appears: "We use cookies for analytics and marketing. Accept/Reject/Customize"
3. User's choice is recorded (consent record with timestamp)
4. Only approved tracking is activated
5. User can change their preferences at any time
6. You must keep a log of who consented to what and when

### Data Breach Response

If personal data is compromised:

1. Investigate the scope of the breach (what data, how many users)
2. Notify the supervisory authority within 72 hours (GDPR requirement)
3. Notify affected users if the breach is high-risk
4. Document everything — what happened, what you did about it
5. Take steps to prevent recurrence

## Key Terms You'll Hear

| Term                   | What It Means                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| **GDPR**               | General Data Protection Regulation — EU privacy law. The most influential privacy regulation globally         |
| **CCPA / CPRA**        | California Consumer Privacy Act / California Privacy Rights Act — California's privacy law                    |
| **LGPD**               | Lei Geral de Proteção de Dados — Brazil's privacy law, modeled on GDPR                                        |
| **PIPL**               | Personal Information Protection Law — China's privacy law                                                     |
| **PII**                | Personally Identifiable Information — data that identifies a specific person                                  |
| **Data Controller**    | The entity that decides why and how data is processed (usually your company)                                  |
| **Data Processor**     | The entity that processes data on behalf of the controller (e.g., your cloud provider, analytics vendor)      |
| **DPA**                | Data Processing Agreement — a contract between controller and processor defining data handling rules          |
| **DPO**                | Data Protection Officer — a person responsible for privacy compliance within an organization                  |
| **DSAR / DSR**         | Data Subject Access Request — when a user formally exercises their privacy rights                             |
| **Data Minimization**  | Collect only the data you actually need. Don't hoard data "just in case"                                      |
| **Purpose Limitation** | Use data only for the purpose it was collected. Don't repurpose email addresses for marketing without consent |
| **Privacy by Design**  | Build privacy into your system from the start, not as an afterthought                                         |
| **Anonymization**      | Removing all identifying information so data can never be linked back to a person. Irreversible               |
| **Pseudonymization**   | Replacing identifiers with tokens. The data can be re-identified with the mapping key                         |

## Common Patterns

### Pattern 1: Privacy-First Architecture

Design your data model with privacy in mind from day one.

- Personal data is tagged and stored separately from non-personal data
- Each data field has a defined retention period
- Deletion capabilities are built into every data store
- Access to personal data is logged

**When it's used:** Greenfield projects, companies that take privacy seriously.

**Trade-off:** More upfront design work. But saves massive effort later when regulations change or a DSAR comes in.

### Pattern 2: Consent-Driven Data Collection

No data is collected without explicit consent. Different consent types enable different data processing.

```
Analytics consent    → Enable tracking
Marketing consent    → Enable email marketing, retargeting
Personalization consent → Enable recommendation engine
```

**When it's used:** Any user-facing app in jurisdictions with consent requirements.

**Trade-off:** Some users won't consent, reducing your data. But this is the law, not optional.

### Pattern 3: Data Retention Automation

Automated jobs that enforce retention policies:

1. Define retention periods per data type (transaction records: 7 years, analytics events: 2 years, session data: 90 days)
2. Scheduled job runs nightly, finds expired data, and deletes or anonymizes it
3. Deletion is logged for compliance audits

**When it's used:** Any app that stores personal data (which is basically every app).

**Trade-off:** Requires clear retention policies (business decision) and reliable automation.

## Gotchas & Edge Cases

- **Backups contain personal data**: You deleted a user's data from the live database, but it still exists in last week's backup. Have a strategy for backup data retention.
- **Third-party data sharing**: If you send user data to analytics tools, email providers, or ad networks, you need DPAs with each vendor. You're responsible for what your processors do with the data.
- **Logs contain PII**: Your application logs might contain user emails, IP addresses, request bodies with personal data. Scrub PII from logs or treat log storage as a personal data store.
- **Analytics vs privacy**: Your product team wants to track everything. Privacy law says collect the minimum. This tension is real and requires business-level decisions.
- **Cross-border data transfer**: EU user data stored on US servers is a legal issue (Schrems II ruling). Use Standard Contractual Clauses or ensure your cloud provider has EU data centers.
- **Children's data (COPPA)**: If your app might be used by children under 13 (in the US), you need parental consent and extra protections. Under 16 in the EU.
- **Right to erasure vs legal obligation**: A user wants deletion, but you're legally required to keep their tax records for 7 years. You must satisfy both — delete personal data but retain the legally required records (anonymized where possible).
- **Consent withdrawal**: If a user withdraws consent, you must stop processing AND delete data collected under that consent. This is retroactive.

## Quick Reference

| Regulation | Region     | Key Requirements                                                               |
| ---------- | ---------- | ------------------------------------------------------------------------------ |
| GDPR       | EU/EEA     | Consent, data subject rights, 72h breach notification, DPAs, data minimization |
| CCPA/CPRA  | California | Right to know, right to delete, right to opt-out of data sale                  |
| LGPD       | Brazil     | Similar to GDPR, consent-based, data subject rights                            |
| PIPL       | China      | Consent, data localization, cross-border transfer restrictions                 |
| PIPEDA     | Canada     | Consent, limited collection, accuracy, accountability                          |

| Action          | Compliance Requirement                     |
| --------------- | ------------------------------------------ |
| Collecting data | Have a lawful basis + privacy notice       |
| Storing data    | Encrypt, access-control, define retention  |
| Sharing data    | DPA with processor, user consent if needed |
| Deleting data   | Honor deletion requests within 30 days     |
| Breach occurs   | Notify authority within 72 hours (GDPR)    |
