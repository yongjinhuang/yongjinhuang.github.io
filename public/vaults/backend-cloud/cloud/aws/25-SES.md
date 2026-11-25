# Amazon Simple Email Service (SES)

SES is a scalable, cost-effective email service for sending and receiving email. It handles transactional emails (order confirmations, password resets), marketing campaigns, and bulk notifications. At $0.10 per 1,000 emails (even cheaper from EC2), it is significantly cheaper than SendGrid, Mailgun, or Postmark. SES also handles the hard parts of email: reputation management, bounce processing, deliverability optimization, and compliance with authentication standards like DKIM, SPF, and DMARC.

---

## 1. Sending Email

SES offers three ways to send email:

| Method             | Use Case                                  | Protocol            |
| ------------------ | ----------------------------------------- | ------------------- |
| **SES API (v2)**   | Application-integrated sending via SDK    | HTTPS               |
| **SMTP Interface** | Legacy apps, frameworks with SMTP support | SMTP (port 587/465) |
| **SES Console**    | Testing and one-off sends                 | Web UI              |

### 1.1 Sending via API (SDK)

```bash
# Send a simple email via CLI (SES v2)
aws sesv2 send-email \
  --from-email-address "noreply@example.com" \
  --destination '{"ToAddresses":["user@example.com"]}' \
  --content '{
    "Simple": {
      "Subject": {"Data": "Order Confirmation"},
      "Body": {
        "Html": {"Data": "<h1>Order #1234 confirmed</h1>"},
        "Text": {"Data": "Order #1234 confirmed"}
      }
    }
  }'
```

### 1.2 Sending via SMTP

SES provides an SMTP endpoint at `email-smtp.<region>.amazonaws.com` on port 587 (STARTTLS) or 465 (TLS wrapper). SMTP credentials are derived from IAM access keys (not the same as IAM credentials -- you must generate them in the SES console or via a specific signing process).

```
Host: email-smtp.us-east-1.amazonaws.com
Port: 587
Username: <SMTP username from SES console>
Password: <SMTP password from SES console>
TLS: Required
```

### 1.3 Email Types

| Type              | Characteristics                          | Example                            |
| ----------------- | ---------------------------------------- | ---------------------------------- |
| **Transactional** | Triggered by user action, time-sensitive | Password reset, order confirmation |
| **Marketing**     | Bulk, scheduled, requires unsubscribe    | Newsletter, promotional campaign   |
| **Notification**  | System-generated alerts                  | Monitoring alerts, billing notices |

---

## 2. Identity Verification

Before sending email, you must verify ownership of the sending identity (email address or domain).

### 2.1 Email Address Verification

Quick for testing. SES sends a verification link to the address.

```bash
# Verify a single email address (v1 API)
aws ses verify-email-identity --email-address sender@example.com

# Create an email identity (v2 API)
aws sesv2 create-email-identity --email-identity sender@example.com
```

### 2.2 Domain Verification (Production)

Verify an entire domain to send from any address at that domain. Requires adding DNS records.

```bash
# Verify a domain
aws sesv2 create-email-identity --email-identity example.com

# Get the DKIM tokens to add to DNS
aws sesv2 get-email-identity --email-identity example.com
```

SES returns three CNAME records for DKIM. Add them to your DNS:

```
Selector                              Value
abc123._domainkey.example.com    ->   abc123.dkim.amazonses.com
def456._domainkey.example.com    ->   def456.dkim.amazonses.com
ghi789._domainkey.example.com    ->   ghi789.dkim.amazonses.com
```

### 2.3 Authentication Standards

| Standard  | Purpose                                         | How to Set Up                                                          |
| --------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| **DKIM**  | Proves the email was not modified in transit    | SES provides CNAME records (Easy DKIM)                                 |
| **SPF**   | Declares which servers can send for your domain | Add `include:amazonses.com` to SPF TXT record                          |
| **DMARC** | Policy for handling auth failures               | Add TXT record: `v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com` |

**All three are required for good deliverability.** Without them, emails land in spam.

---

## 3. Sandbox vs Production Mode

New SES accounts start in **sandbox mode** with severe restrictions:

| Feature              | Sandbox                 | Production                             |
| -------------------- | ----------------------- | -------------------------------------- |
| **Sending to**       | Verified addresses only | Anyone                                 |
| **Daily send limit** | 200 emails/day          | Based on reputation (starts at 50,000) |
| **Max send rate**    | 1 email/second          | Based on reputation                    |
| **From address**     | Verified only           | Verified domain/address                |

```bash
# Check your account's sending status
aws sesv2 get-account

# Request production access (done via AWS console or support ticket)
# Submit a detailed use case explaining:
# - What type of email you send
# - How you handle bounces and complaints
# - How recipients opt in
```

---

## 4. Configuration Sets

Configuration sets group email-related settings: event tracking, IP pools, and sending rules.

```bash
# Create a configuration set
aws sesv2 create-configuration-set \
  --configuration-set-name transactional-emails

# Add an event destination (track opens, clicks, bounces)
aws sesv2 create-configuration-set-event-destination \
  --configuration-set-name transactional-emails \
  --event-destination-name kinesis-events \
  --event-destination '{
    "Enabled": true,
    "MatchingEventTypes": ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "OPEN", "CLICK"],
    "KinesisFirehoseDestination": {
      "IamRoleArn": "arn:aws:iam::123456789012:role/ses-kinesis-role",
      "DeliveryStreamArn": "arn:aws:firehose:us-east-1:123456789012:deliverystream/ses-events"
    }
  }'
```

Event destinations can publish to: SNS, Kinesis Firehose, CloudWatch, Pinpoint, or EventBridge.

---

## 5. Email Templates

SES supports Handlebars-based templates for personalized bulk sending.

```bash
# Create a template
aws sesv2 create-email-template \
  --template-name OrderConfirmation \
  --template-content '{
    "Subject": "Order {{orderId}} Confirmed",
    "Html": "<h1>Hi {{name}},</h1><p>Your order {{orderId}} for ${{total}} has been confirmed.</p>",
    "Text": "Hi {{name}}, Your order {{orderId}} for ${{total}} has been confirmed."
  }'

# Send a templated email
aws sesv2 send-email \
  --from-email-address "orders@example.com" \
  --destination '{"ToAddresses":["customer@example.com"]}' \
  --content '{
    "Template": {
      "TemplateName": "OrderConfirmation",
      "TemplateData": "{\"name\":\"Alice\",\"orderId\":\"12345\",\"total\":\"99.99\"}"
    }
  }'

# Send bulk templated emails
aws sesv2 send-bulk-email \
  --from-email-address "orders@example.com" \
  --default-content '{"Template":{"TemplateName":"OrderConfirmation","TemplateData":"{\"total\":\"0.00\"}"}}' \
  --bulk-email-entries '[
    {"Destination":{"ToAddresses":["alice@example.com"]},"ReplacementEmailContent":{"ReplacementTemplate":{"ReplacementTemplateData":"{\"name\":\"Alice\",\"orderId\":\"001\",\"total\":\"49.99\"}"}}},
    {"Destination":{"ToAddresses":["bob@example.com"]},"ReplacementEmailContent":{"ReplacementTemplate":{"ReplacementTemplateData":"{\"name\":\"Bob\",\"orderId\":\"002\",\"total\":\"129.99\"}"}}}
  ]'
```

---

## 6. Bounce and Complaint Handling

Handling bounces and complaints is not optional -- it directly affects your sending reputation and ability to send email.

### 6.1 Bounce Types

| Type            | Meaning                                       | Action                                |
| --------------- | --------------------------------------------- | ------------------------------------- |
| **Hard bounce** | Address does not exist                        | Remove immediately, never send again  |
| **Soft bounce** | Temporary failure (mailbox full, server down) | Retry, remove after repeated failures |
| **Complaint**   | Recipient marked email as spam                | Remove immediately                    |

### 6.2 SNS Notifications

```bash
# Set up SNS notification for bounces
aws sesv2 put-configuration-set-event-destination \
  --configuration-set-name transactional-emails \
  --event-destination-name bounce-notifications \
  --event-destination '{
    "Enabled": true,
    "MatchingEventTypes": ["BOUNCE", "COMPLAINT"],
    "SnsDestination": {
      "TopicArn": "arn:aws:sns:us-east-1:123456789012:ses-bounces"
    }
  }'
```

### 6.3 Account-Level Suppression List

SES automatically adds hard-bounced and complained addresses to an account-level suppression list. Future sends to these addresses are blocked.

```bash
# Check if an address is on the suppression list
aws sesv2 get-suppressed-destination --email-address bounced@example.com

# Remove an address from suppression (if the issue was resolved)
aws sesv2 delete-suppressed-destination --email-address bounced@example.com

# List suppressed destinations
aws sesv2 list-suppressed-destinations --reasons BOUNCE COMPLAINT
```

---

## 7. Receiving Email

SES can receive email for your domain and route it to S3, Lambda, SNS, or other services. Only available in select regions (us-east-1, us-west-2, eu-west-1).

### 7.1 Receipt Rules

```bash
# Create a receipt rule set
aws ses create-receipt-rule-set --rule-set-name my-rules

# Activate the rule set
aws ses set-active-receipt-rule-set --rule-set-name my-rules

# Create a receipt rule (store in S3 and notify via SNS)
aws ses create-receipt-rule \
  --rule-set-name my-rules \
  --rule '{
    "Name": "store-and-notify",
    "Enabled": true,
    "Recipients": ["support@example.com"],
    "Actions": [
      {
        "S3Action": {
          "BucketName": "my-email-bucket",
          "ObjectKeyPrefix": "incoming/"
        }
      },
      {
        "SNSAction": {
          "TopicArn": "arn:aws:sns:us-east-1:123456789012:incoming-email"
        }
      }
    ]
  }'
```

### 7.2 Available Receipt Actions

| Action       | What It Does                                            |
| ------------ | ------------------------------------------------------- |
| **S3**       | Store the raw email in an S3 bucket                     |
| **SNS**      | Publish notification (or full email content) to a topic |
| **Lambda**   | Invoke a function to process the email                  |
| **Bounce**   | Return a bounce response to the sender                  |
| **Stop**     | Stop processing further rules                           |
| **WorkMail** | Forward to Amazon WorkMail                              |

---

## 8. Dedicated IPs vs Shared IPs

| Feature        | Shared IPs                  | Dedicated IPs                              |
| -------------- | --------------------------- | ------------------------------------------ |
| **Cost**       | Included                    | $24.95/IP/month                            |
| **Reputation** | Shared across SES customers | Your reputation only                       |
| **Warm-up**    | Pre-warmed                  | Must warm up manually                      |
| **Volume**     | Any volume                  | Need enough IPs for your volume            |
| **Use case**   | Most senders                | High-volume (100K+/day), strict compliance |

**Decision rule:** Start with shared IPs. Move to dedicated only if you send high volume and need isolated reputation control.

---

## 9. Sending Quotas and Monitoring

```bash
# Check your sending quota and usage
aws sesv2 get-account

# Response includes:
# - SendingEnabled: true/false
# - MaxSendRate: emails per second
# - Max24HourSend: daily sending limit
# - SentLast24Hours: current usage
```

Monitor these CloudWatch metrics:

- `Send`, `Delivery`, `Bounce`, `Complaint`, `Reject`, `Open`, `Click`
- **Bounce rate** must stay under **5%** (SES may suspend at 10%)
- **Complaint rate** must stay under **0.1%** (SES may suspend at 0.5%)

---

## 10. Common Gotchas

| Gotcha                                  | Details                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Sandbox limits**                      | New accounts can only send to verified addresses. Max 200/day. Request production access early. |
| **Domain auth required for production** | DKIM, SPF, and DMARC are practically mandatory for inbox delivery.                              |
| **Bounce rate threshold**               | Keep under 5%. SES places your account under review at 5% and may suspend at 10%.               |
| **Complaint rate threshold**            | Keep under 0.1%. SES suspends sending at 0.5%. Process complaints immediately.                  |
| **Limited regions for receiving**       | SES receiving is only available in us-east-1, us-west-2, and eu-west-1.                         |
| **SMTP credentials are not IAM keys**   | SMTP credentials are derived from IAM access keys using a specific signing algorithm.           |
| **Template data is a JSON string**      | `TemplateData` must be a JSON-encoded string, not a JSON object. Easy to get wrong.             |
| **Email size limit**                    | 10 MB for API, 40 MB for SMTP. Includes attachments and encoding overhead.                      |
| **Sending from EC2**                    | Port 25 is blocked by default on EC2. Use port 587 or 465 for SMTP, or use the API.             |
| **No built-in unsubscribe management**  | You must implement your own unsubscribe mechanism. Include List-Unsubscribe headers.            |
