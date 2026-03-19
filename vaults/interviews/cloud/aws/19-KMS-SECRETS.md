# KMS & Secrets Manager

AWS Key Management Service (KMS) is a managed service for creating, controlling, and auditing encryption keys used to protect your data across AWS services. AWS Secrets Manager complements KMS by providing a managed store for secrets (database credentials, API keys, tokens) with built-in automatic rotation. Together they form the foundation of AWS's encryption and secrets management story -- KMS handles the keys, Secrets Manager handles the secrets those keys protect.

## KMS Key Types

| Key Type                     | Managed By             | Rotation                | Use Case                                                       |
| ---------------------------- | ---------------------- | ----------------------- | -------------------------------------------------------------- |
| AWS owned keys               | AWS                    | Automatic, varies       | Default encryption for services (S3-SSE, SQS)                  |
| AWS managed keys             | AWS (in your account)  | Automatic (yearly)      | Service-specific encryption (alias `aws/s3`, `aws/ebs`)        |
| Customer managed keys (CMKs) | You                    | Optional (configurable) | Full control: key policies, grants, aliases, rotation schedule |
| Custom key stores            | You (CloudHSM cluster) | Manual                  | Regulatory requirements, HSM-backed keys                       |

## Symmetric vs Asymmetric Keys

| Property                | Symmetric                                 | Asymmetric                       |
| ----------------------- | ----------------------------------------- | -------------------------------- |
| Algorithm               | AES-256-GCM                               | RSA, ECC, SM2                    |
| Key material            | Single shared key (never leaves KMS)      | Public + private key pair        |
| Use cases               | Encrypt/decrypt data, envelope encryption | Sign/verify, encrypt outside AWS |
| Public key export       | Not applicable                            | Yes, public key downloadable     |
| AWS service integration | All services                              | Limited                          |
| Default                 | Yes                                       | No                               |

Use symmetric keys unless you specifically need to encrypt data outside AWS or perform digital signatures.

## Key Policies and Grants

### Key Policies

Every KMS key has exactly one key policy. This is the primary authorization mechanism.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Enable root account full access",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::123456789012:root" },
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "Allow use of the key",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::123456789012:role/AppRole" },
      "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "*"
    }
  ]
}
```

### Grants

Grants provide temporary, scoped access without modifying the key policy. Useful for cross-service delegation.

```bash
# Create a grant
aws kms create-grant \
  --key-id arn:aws:kms:us-east-1:123456789012:key/abc-123 \
  --grantee-principal arn:aws:iam::123456789012:role/LambdaRole \
  --operations Encrypt Decrypt \
  --retiring-principal arn:aws:iam::123456789012:role/AdminRole
```

## Envelope Encryption

Envelope encryption is how you encrypt data larger than 4 KB with KMS. KMS generates a **data key**, you encrypt your data locally with that key, then KMS encrypts the data key itself.

```
1. Call GenerateDataKey --> returns plaintext data key + encrypted data key
2. Encrypt your data with the plaintext data key (locally)
3. Store the encrypted data + encrypted data key together
4. Discard the plaintext data key from memory

Decryption:
1. Send encrypted data key to KMS Decrypt
2. KMS returns plaintext data key
3. Decrypt data locally with plaintext data key
```

```bash
# Generate a data key
aws kms generate-data-key \
  --key-id alias/my-app-key \
  --key-spec AES_256

# Response contains:
# - Plaintext (base64 encoded data key for local encryption)
# - CiphertextBlob (encrypted data key to store alongside encrypted data)
# - KeyId (KMS key ARN used)
```

This pattern is used by S3, EBS, and virtually every AWS service that encrypts data.

## Key Rotation

| Rotation Type | How It Works                                                            | When to Use                                 |
| ------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| Automatic     | AWS generates new key material yearly; old material kept for decryption | Default for customer managed symmetric keys |
| On-demand     | Trigger rotation manually via API                                       | When you need rotation on your schedule     |
| Manual        | Create new key, re-encrypt data, update aliases                         | Asymmetric keys, imported key material      |

```bash
# Enable automatic rotation
aws kms enable-key-rotation --key-id alias/my-app-key

# Check rotation status
aws kms get-key-rotation-status --key-id alias/my-app-key

# Trigger on-demand rotation
aws kms rotate-key-on-demand --key-id alias/my-app-key
```

Old key material is preserved indefinitely so existing ciphertext can still be decrypted. No re-encryption needed.

## Multi-Region Keys

Replicate a KMS key across regions for cross-region encryption/decryption without cross-region API calls.

```bash
# Create a multi-region primary key
aws kms create-key --multi-region --description "Multi-region primary"

# Replicate to another region
aws kms replicate-key \
  --key-id mrk-abc123 \
  --replica-region eu-west-1
```

Multi-region keys share the same key ID and key material. Data encrypted in one region can be decrypted in another region using the replica key, avoiding cross-region KMS calls.

## Secrets Manager

### Core Concepts

Secrets Manager stores secrets as key-value pairs encrypted with KMS. Each secret has:

- A name (path-like, e.g., `prod/myapp/database`)
- A secret value (string or binary, up to 65 KB)
- Versioning (AWSCURRENT, AWSPREVIOUS, AWSPENDING)
- Optional automatic rotation

```bash
# Create a secret
aws secretsmanager create-secret \
  --name prod/myapp/db-credentials \
  --secret-string '{"username":"admin","password":"s3cur3P@ss!","host":"db.example.com","port":5432}'

# Retrieve a secret
aws secretsmanager get-secret-value \
  --secret-id prod/myapp/db-credentials

# Update a secret
aws secretsmanager update-secret \
  --secret-id prod/myapp/db-credentials \
  --secret-string '{"username":"admin","password":"n3wP@ss!","host":"db.example.com","port":5432}'

# Delete a secret (with recovery window)
aws secretsmanager delete-secret \
  --secret-id prod/myapp/db-credentials \
  --recovery-window-in-days 7
```

### Secret Rotation

Automatic rotation uses a Lambda function to periodically update the secret and the resource it protects (e.g., database password).

```bash
# Enable rotation with AWS-provided Lambda
aws secretsmanager rotate-secret \
  --secret-id prod/myapp/db-credentials \
  --rotation-lambda-arn arn:aws:lambda:us-east-1:123456789012:function:SecretsRotation \
  --rotation-rules AutomaticallyAfterDays=30

# Trigger immediate rotation
aws secretsmanager rotate-secret \
  --secret-id prod/myapp/db-credentials
```

Rotation follows a four-step process:

1. **createSecret** -- generate new credentials, store as `AWSPENDING`
2. **setSecret** -- update the resource (e.g., change DB password)
3. **testSecret** -- verify new credentials work
4. **finishSecret** -- move `AWSPENDING` to `AWSCURRENT`, old value to `AWSPREVIOUS`

### Native Database Rotation

Secrets Manager has built-in rotation support for:

| Service           | How                                       |
| ----------------- | ----------------------------------------- |
| Amazon RDS        | AWS-provided rotation Lambda templates    |
| Amazon Aurora     | Same as RDS, supports multi-user rotation |
| Amazon Redshift   | AWS-provided rotation Lambda              |
| Amazon DocumentDB | AWS-provided rotation Lambda              |

## Secrets Manager vs Parameter Store

| Feature               | Secrets Manager                          | Parameter Store                              |
| --------------------- | ---------------------------------------- | -------------------------------------------- |
| Cost                  | $0.40/secret/month + $0.05/10K API calls | Free tier (standard), $0.05/10K for advanced |
| Max size              | 65 KB                                    | 4 KB (standard), 8 KB (advanced)             |
| Automatic rotation    | Built-in with Lambda                     | Manual (no native rotation)                  |
| Cross-account access  | Resource-based policies                  | Shared via RAM or cross-account IAM          |
| Versioning            | AWSCURRENT, AWSPREVIOUS, AWSPENDING      | Version numbers + labels                     |
| Encryption            | Always encrypted (KMS)                   | Optional encryption (KMS)                    |
| Native DB integration | Yes (RDS, Aurora, Redshift, DocumentDB)  | No                                           |
| Hierarchy             | Flat names                               | Path-based hierarchy (`/app/prod/db/host`)   |

**Decision guide**: Use Secrets Manager when you need automatic rotation or store database credentials. Use Parameter Store for application configuration, feature flags, and non-sensitive values where cost matters.

## Accessing Secrets from Compute

### Lambda

```python
import boto3
import json

def handler(event, context):
    client = boto3.client('secretsmanager')
    response = client.get_secret_value(SecretId='prod/myapp/db-credentials')
    secret = json.loads(response['SecretString'])
    db_host = secret['host']
    db_password = secret['password']
```

### ECS Task Definition

```json
{
  "containerDefinitions": [
    {
      "name": "app",
      "secrets": [
        {
          "name": "DB_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/myapp/db-credentials:password::"
        }
      ]
    }
  ],
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole"
}
```

### EC2 (via IAM role)

```bash
# From an EC2 instance with appropriate IAM role
aws secretsmanager get-secret-value \
  --secret-id prod/myapp/db-credentials \
  --query SecretString --output text | jq -r '.password'
```

## Common CLI Commands

```bash
# --- KMS ---

# Create a symmetric CMK
aws kms create-key --description "Application encryption key"

# Create an alias
aws kms create-alias --alias-name alias/my-app-key --target-key-id <key-id>

# Encrypt data (up to 4 KB)
aws kms encrypt \
  --key-id alias/my-app-key \
  --plaintext fileb://secret.txt \
  --output text --query CiphertextBlob | base64 --decode > encrypted.bin

# Decrypt data
aws kms decrypt \
  --ciphertext-blob fileb://encrypted.bin \
  --output text --query Plaintext | base64 --decode > decrypted.txt

# Generate data key (for envelope encryption)
aws kms generate-data-key --key-id alias/my-app-key --key-spec AES_256

# List keys
aws kms list-keys

# Describe key
aws kms describe-key --key-id alias/my-app-key

# Schedule key deletion (minimum 7 day waiting period)
aws kms schedule-key-deletion --key-id <key-id> --pending-window-in-days 7

# --- Secrets Manager ---

# Create secret
aws secretsmanager create-secret --name my-secret --secret-string "my-value"

# Get secret value
aws secretsmanager get-secret-value --secret-id my-secret

# List secrets
aws secretsmanager list-secrets

# Rotate secret
aws secretsmanager rotate-secret --secret-id my-secret

# Restore deleted secret
aws secretsmanager restore-secret --secret-id my-secret
```

## Common Gotchas

| Issue                            | Details                                                                                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KMS request quotas               | Shared quota per account per region (5,500-30,000 req/sec depending on operation). High-throughput encryption may need quota increase or data key caching. |
| Cross-account key sharing        | Requires key policy update AND IAM policy in consuming account. Both sides must be configured.                                                             |
| Key deletion is destructive      | Minimum 7-day waiting period. Once deleted, all data encrypted with that key is unrecoverable.                                                             |
| Secrets Manager cost             | $0.40/secret/month adds up. 1,000 secrets = $400/month. Use Parameter Store for non-rotating, non-sensitive config.                                        |
| Rotation downtime window         | Brief window during rotation where old credentials are invalidated. Use multi-user rotation strategy to avoid downtime.                                    |
| 4 KB direct encryption limit     | KMS Encrypt API only handles up to 4 KB. Use envelope encryption (GenerateDataKey) for larger payloads.                                                    |
| Imported key material            | Cannot be automatically rotated. Must manually create new key and re-encrypt data.                                                                         |
| Secret version staging           | During rotation, `AWSPENDING` label exists temporarily. Applications should always request `AWSCURRENT`.                                                   |
| Parameter Store free tier limits | Standard parameters: 10,000 max, 4 KB max size, no throughput limit. Advanced: $0.05/parameter/month.                                                      |
