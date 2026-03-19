# AWS Identity and Access Management (IAM)

IAM is the service that controls **who** can do **what** to **which resources** in your AWS account. Every single AWS API call is authenticated and authorized through IAM. It is global (not region-scoped), free, and the first thing you must understand before touching anything else in AWS. Get IAM wrong and you either lock yourself out or leave the front door wide open.

---

## 1. Mental Model

IAM boils down to three concepts:

| Concept       | What It Is                        | Example                                                                     |
| ------------- | --------------------------------- | --------------------------------------------------------------------------- |
| **Principal** | The entity making the request     | IAM user, IAM role, AWS service, federated user                             |
| **Action**    | The API operation being attempted | `s3:GetObject`, `ec2:RunInstances`                                          |
| **Resource**  | The AWS resource being acted upon | `arn:aws:s3:::my-bucket/*`, `arn:aws:ec2:us-east-1:123456789012:instance/*` |

A **policy** is the glue: it defines which principals can perform which actions on which resources, under what conditions.

```
Principal --> wants to perform --> Action --> on --> Resource
                                    |
                              Policy says YES or NO
```

---

## 2. Users, Groups, and Roles

### 2.1 IAM Users

An IAM user represents a **person or application** with long-lived credentials (password for console, access keys for CLI/SDK).

```bash
# Create a user
aws iam create-user --user-name deploy-bot

# Create access keys for programmatic access
aws iam create-access-key --user-name deploy-bot

# Add user to a group
aws iam add-user-to-group --user-name deploy-bot --group-name developers
```

**When to use:** Rarely in modern setups. Prefer IAM Identity Center (SSO) for humans and IAM roles for machines.

### 2.2 IAM Groups

A group is a **collection of users**. You attach policies to the group, and every user in the group inherits those permissions. Groups cannot be nested.

```bash
# Create a group and attach a managed policy
aws iam create-group --group-name developers
aws iam attach-group-policy \
  --group-name developers \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess
```

**When to use:** Whenever you have IAM users. Never attach policies directly to users -- always go through groups.

### 2.3 IAM Roles

A role is an **identity with no permanent credentials**. Instead, whoever "assumes" the role gets temporary credentials via STS. Roles are the workhorse of IAM.

```bash
# Create a role that EC2 instances can assume
aws iam create-role \
  --role-name web-server-role \
  --assume-role-policy-document file://ec2-trust-policy.json

# Attach a policy to the role
aws iam attach-role-policy \
  --role-name web-server-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
```

**When to use:**

| Scenario                              | Role Type                               |
| ------------------------------------- | --------------------------------------- |
| EC2 instance needs to call AWS APIs   | Instance profile (role attached to EC2) |
| Lambda function needs DynamoDB access | Execution role                          |
| ECS task needs to pull from S3        | Task role                               |
| Cross-account access                  | AssumeRole with external trust          |
| Federated users (SSO, SAML)           | Identity provider role                  |

---

## 3. Policy Structure

Every IAM policy is a JSON document with this structure:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3ReadWrite",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::my-app-bucket/*",
      "Condition": {
        "IpAddress": {
          "aws:SourceIp": "203.0.113.0/24"
        }
      }
    }
  ]
}
```

### 3.1 Statement Fields

| Field       | Required                        | Description                                              |
| ----------- | ------------------------------- | -------------------------------------------------------- |
| `Effect`    | Yes                             | `Allow` or `Deny`                                        |
| `Action`    | Yes                             | API actions (supports wildcards: `s3:Get*`)              |
| `Resource`  | Yes                             | ARN(s) the statement applies to (`*` = all)              |
| `Condition` | No                              | Conditions that must be true (IP range, MFA, time, tags) |
| `Sid`       | No                              | Human-readable identifier for the statement              |
| `Principal` | Only in resource-based policies | Who this statement applies to                            |

### 3.2 Common Condition Keys

| Condition Key                | Use Case                             |
| ---------------------------- | ------------------------------------ |
| `aws:SourceIp`               | Restrict by IP address               |
| `aws:MultiFactorAuthPresent` | Require MFA                          |
| `aws:PrincipalOrgID`         | Restrict to your AWS Organization    |
| `aws:RequestedRegion`        | Restrict to specific regions         |
| `s3:prefix`                  | Restrict S3 access to a key prefix   |
| `aws:TagKeys`                | Enforce tagging on resource creation |

---

## 4. Identity-Based vs Resource-Based Policies

| Aspect                | Identity-Based                                          | Resource-Based                                      |
| --------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| Attached to           | User, group, or role                                    | The resource itself (S3 bucket, SQS queue, KMS key) |
| Has `Principal` field | No (implicit -- it's whoever the policy is attached to) | Yes (specifies who is allowed)                      |
| Cross-account         | Requires role assumption on both sides                  | Can grant access directly to external account       |
| Example               | IAM user policy allowing `s3:GetObject`                 | S3 bucket policy allowing account B to read         |

**Cross-account access tip:** Resource-based policies are simpler for cross-account because the external principal does not need to assume a role. They just call the API directly and the resource policy grants access.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCrossAccountRead",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::111122223333:root"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::shared-data-bucket/*"
    }
  ]
}
```

---

## 5. Roles for AWS Services

### 5.1 EC2 Instance Profiles

An instance profile is a container for an IAM role that you attach to an EC2 instance. The instance gets temporary credentials automatically via the instance metadata service.

```bash
# Create role, create instance profile, add role to profile
aws iam create-role --role-name ec2-app-role \
  --assume-role-policy-document file://ec2-trust.json

aws iam create-instance-profile --instance-profile-name ec2-app-profile

aws iam add-role-to-instance-profile \
  --instance-profile-name ec2-app-profile \
  --role-name ec2-app-role

# Launch EC2 with the instance profile
aws ec2 run-instances \
  --image-id ami-0abcdef1234567890 \
  --instance-type t3.micro \
  --iam-instance-profile Name=ec2-app-profile
```

The trust policy (`ec2-trust.json`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

### 5.2 Lambda Execution Roles

Every Lambda function needs an execution role. Lambda assumes this role when your function runs.

```bash
aws iam create-role --role-name lambda-exec-role \
  --assume-role-policy-document file://lambda-trust.json

# Attach the basic execution policy (CloudWatch Logs)
aws iam attach-role-policy \
  --role-name lambda-exec-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
```

### 5.3 ECS Task Roles

ECS has two role types:

| Role                    | Purpose                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| **Task execution role** | Lets ECS agent pull images from ECR and write logs to CloudWatch |
| **Task role**           | Lets your application code inside the container call AWS APIs    |

Do not confuse them. The execution role is for the infrastructure; the task role is for your code.

---

## 6. STS and Cross-Account Access

AWS Security Token Service (STS) issues **temporary credentials** when a principal assumes a role.

### 6.1 AssumeRole Flow

```
Account A (caller)          Account B (target)
     |                           |
     |--- sts:AssumeRole ------->|
     |    "I want to assume      |
     |     role X in account B"  |
     |                           |--- Trust policy checks:
     |                           |    Is account A allowed?
     |<-- Temporary credentials -|
     |    (access key, secret,   |
     |     session token, expiry)|
     |                           |
     |--- s3:GetObject --------->|  (using temp creds)
```

### 6.2 CLI Commands

```bash
# Check who you currently are
aws sts get-caller-identity

# Assume a role in another account
aws sts assume-role \
  --role-arn arn:aws:iam::111122223333:role/cross-account-reader \
  --role-session-name my-session

# Use the returned credentials
export AWS_ACCESS_KEY_ID=ASIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...

# Or use named profiles (preferred)
# In ~/.aws/config:
# [profile target-account]
# role_arn = arn:aws:iam::111122223333:role/cross-account-reader
# source_profile = default
aws s3 ls --profile target-account
```

---

## 7. Best Practices

### 7.1 Root Account Lockdown

- Enable MFA on the root account immediately
- Do not create access keys for root
- Use root only for tasks that require it (e.g., changing account settings, closing the account)
- Set up an IAM admin user or use IAM Identity Center for day-to-day work

### 7.2 Least Privilege

- Start with zero permissions, add only what is needed
- Use `Access Analyzer` to identify unused permissions
- Review and trim policies quarterly
- Never use `"Action": "*"` or `"Resource": "*"` in production

### 7.3 MFA Everywhere

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyAllExceptMFA",
      "Effect": "Deny",
      "NotAction": [
        "iam:CreateVirtualMFADevice",
        "iam:EnableMFADevice",
        "iam:ListMFADevices",
        "sts:GetSessionToken"
      ],
      "Resource": "*",
      "Condition": {
        "BoolIfExists": {
          "aws:MultiFactorAuthPresent": "false"
        }
      }
    }
  ]
}
```

### 7.4 Service Control Policies (SCPs)

SCPs are guardrails at the AWS Organizations level. They restrict what any account in the organization can do, even if the account's IAM policies allow it.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyNonApprovedRegions",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": ["us-east-1", "us-west-2", "eu-west-1"]
        }
      }
    }
  ]
}
```

**Key point:** SCPs do not grant permissions. They only restrict. An identity needs both the SCP to allow the action AND an IAM policy to grant it.

---

## 8. Essential CLI Commands

```bash
# User management
aws iam create-user --user-name alice
aws iam delete-user --user-name alice
aws iam list-users --output table

# Policy management
aws iam create-policy --policy-name my-policy --policy-document file://policy.json
aws iam attach-user-policy --user-name alice --policy-arn arn:aws:iam::123456789012:policy/my-policy
aws iam attach-role-policy --role-name my-role --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess
aws iam list-attached-role-policies --role-name my-role

# Role management
aws iam create-role --role-name my-role --assume-role-policy-document file://trust.json
aws iam list-roles --query 'Roles[].RoleName'

# Identity verification
aws sts get-caller-identity

# Simulate a policy (test without actually calling the API)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:user/alice \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::my-bucket/file.txt

# Generate credential report
aws iam generate-credential-report
aws iam get-credential-report --output text --query Content | base64 -d
```

---

## 9. Common Gotchas

### 9.1 Policy Evaluation Logic

IAM evaluates policies in this order:

```
1. Explicit Deny?        --> YES --> DENY (game over)
2. SCP allows it?        --> NO  --> DENY (implicit)
3. Resource-based Allow?  --> YES --> ALLOW (for same-account)
4. Permission boundary?   --> NO  --> DENY (implicit)
5. Identity-based Allow?  --> YES --> ALLOW
6. None of the above      --> DENY (default deny)
```

**The golden rule:** An explicit `Deny` always wins, no matter what. There is no way to override it.

### 9.2 Permission Boundaries

A permission boundary limits the **maximum permissions** an IAM entity can have. Even if a policy grants `s3:*`, a permission boundary restricting to `s3:GetObject` means the entity can only read.

Use boundaries to let developers create their own roles without accidentally granting admin access.

### 9.3 Wildcard Pitfalls

```json
// DANGEROUS: grants all actions on all resources
{ "Effect": "Allow", "Action": "*", "Resource": "*" }

// STILL DANGEROUS: grants all S3 actions on all buckets
{ "Effect": "Allow", "Action": "s3:*", "Resource": "*" }

// BETTER: scoped to specific bucket and specific actions
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::my-app-bucket/*"
}
```

### 9.4 Access Keys Rotation

- Access keys do not expire by default
- Rotate keys every 90 days
- Use `aws iam generate-credential-report` to audit key age
- Better yet, stop using access keys entirely -- use roles and SSO

### 9.5 The "New Account" Trap

A brand-new IAM user has **zero permissions** by default. They cannot even see the console dashboard. This is by design (default deny). Always attach policies before handing out credentials.

---

## 10. Quick Reference: Trust Policy Templates

### EC2

```json
{ "Service": "ec2.amazonaws.com" }
```

### Lambda

```json
{ "Service": "lambda.amazonaws.com" }
```

### ECS Tasks

```json
{ "Service": "ecs-tasks.amazonaws.com" }
```

### Cross-Account

```json
{ "AWS": "arn:aws:iam::TARGET_ACCOUNT_ID:root" }
```

### SAML Federation

```json
{ "Federated": "arn:aws:iam::ACCOUNT_ID:saml-provider/PROVIDER_NAME" }
```

Each of these goes in the `Principal` field of the role's trust policy (the `AssumeRolePolicyDocument`).
