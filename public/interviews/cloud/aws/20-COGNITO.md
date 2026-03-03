# Cognito

Amazon Cognito is a managed authentication and authorization service that provides user sign-up, sign-in, and access control for web and mobile applications. It consists of two main components: User Pools (a managed user directory and OAuth 2.0/OIDC identity provider) and Identity Pools (Federated Identities, which exchange tokens for temporary AWS credentials). Cognito handles the heavy lifting of secure authentication so you do not have to build and maintain your own identity system.

## User Pools

A User Pool is a user directory that provides sign-up and sign-in functionality. It issues JWT tokens (ID, access, refresh) and acts as an OpenID Connect (OIDC) identity provider.

### Core Features

| Feature | Details |
|---------|---------|
| Sign-up/Sign-in | Email, phone, username-based registration |
| MFA | SMS, TOTP (authenticator apps), email |
| Password policies | Min length, require uppercase/lowercase/numbers/symbols |
| Account recovery | Email or phone verification codes |
| Email/Phone verification | Confirm ownership before activation |
| User migration | Lambda trigger to migrate users from existing directories |
| Custom attributes | Up to 50 custom attributes per user pool |

### User Pool Configuration

```bash
# Create a user pool
aws cognito-idp create-user-pool \
  --pool-name my-app-users \
  --auto-verified-attributes email \
  --mfa-configuration OPTIONAL \
  --policies '{"PasswordPolicy":{"MinimumLength":12,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true,"RequireSymbols":true}}' \
  --schema '[{"Name":"email","Required":true,"Mutable":true},{"Name":"custom:tenant_id","AttributeDataType":"String","Mutable":true}]'

# Create an app client
aws cognito-idp create-user-pool-client \
  --user-pool-id us-east-1_ABC123 \
  --client-name my-web-app \
  --generate-secret \
  --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --supported-identity-providers COGNITO Google \
  --callback-urls '["https://myapp.com/callback"]' \
  --logout-urls '["https://myapp.com/logout"]' \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client
```

## Lambda Triggers

User Pool triggers let you customize authentication flows with Lambda functions.

| Trigger | When It Fires | Common Use Cases |
|---------|--------------|------------------|
| Pre sign-up | Before user creation | Validate email domain, auto-confirm users, deny sign-up |
| Post confirmation | After user confirms | Send welcome email, create downstream records |
| Pre authentication | Before sign-in | Block users, check custom conditions |
| Post authentication | After successful sign-in | Log analytics, sync user data |
| Pre token generation | Before tokens are issued | Add/remove claims, modify groups in token |
| Custom message | Before sending verification/MFA code | Custom email/SMS templates |
| User migration | When user signs in but does not exist | Migrate from legacy auth system |
| Define auth challenge | Custom auth flow steps | Define challenge sequence |
| Create auth challenge | Generate challenge | Send custom challenge (CAPTCHA, etc.) |
| Verify auth challenge | Validate response | Verify custom challenge answer |

### Trigger Example: Pre Token Generation

```python
def handler(event, context):
    # Add custom claims to the ID token
    event['response']['claimsOverrideDetails'] = {
        'claimsToAddOrOverride': {
            'custom:role': 'admin',
            'custom:tenant': event['request']['userAttributes'].get('custom:tenant_id', 'default')
        },
        'claimsToSuppress': ['email_verified']
    }
    return event
```

### Trigger Example: User Migration

```python
def handler(event, context):
    if event['triggerSource'] == 'UserMigration_Authentication':
        # Validate against legacy system
        user = legacy_auth(event['userName'], event['request']['password'])
        if user:
            event['response']['userAttributes'] = {
                'email': user['email'],
                'email_verified': 'true',
                'custom:legacy_id': user['id']
            }
            event['response']['finalUserStatus'] = 'CONFIRMED'
            event['response']['messageAction'] = 'SUPPRESS'
    return event
```

## Identity Pools (Federated Identities)

Identity Pools exchange identity tokens (from Cognito User Pool, Google, Facebook, SAML, etc.) for temporary AWS credentials (STS). This lets authenticated users directly access AWS services like S3 or DynamoDB.

```
User --> Sign in (User Pool) --> ID Token
ID Token --> Identity Pool --> Temporary AWS Credentials (STS)
Credentials --> Access S3, DynamoDB, etc.
```

### User Pool vs Identity Pool

| Aspect | User Pool | Identity Pool |
|--------|-----------|---------------|
| Purpose | Authentication (who are you?) | Authorization (what can you access?) |
| Output | JWT tokens (ID, access, refresh) | Temporary AWS credentials (access key, secret key, session token) |
| User directory | Yes | No |
| Social sign-in | Yes (as IdP) | Yes (exchanges social tokens) |
| Direct AWS access | No (tokens only) | Yes (IAM credentials) |
| MFA | Yes | No (relies on upstream IdP) |

Typical architecture uses both: User Pool authenticates the user and issues tokens, Identity Pool exchanges those tokens for AWS credentials.

### Identity Pool IAM Roles

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::my-bucket/${cognito-identity.amazonaws.com:sub}/*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"],
      "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/UserData",
      "Condition": {
        "ForAllValues:StringEquals": {
          "dynamodb:LeadingKeys": ["${cognito-identity.amazonaws.com:sub}"]
        }
      }
    }
  ]
}
```

This policy scopes access to the user's own data using their Cognito identity ID as a partition key.

## Social and Enterprise Identity Providers

### Supported Providers

| Provider | Type | Configuration |
|----------|------|---------------|
| Google | Social (OIDC) | Client ID, Client Secret |
| Facebook | Social (OAuth) | App ID, App Secret |
| Apple | Social (OIDC) | Service ID, Team ID, Key ID |
| Amazon | Social (OAuth) | Client ID, Client Secret |
| SAML 2.0 | Enterprise | Metadata document (XML) |
| OIDC | Generic | Issuer URL, Client ID |

```bash
# Add Google as identity provider
aws cognito-idp create-identity-provider \
  --user-pool-id us-east-1_ABC123 \
  --provider-name Google \
  --provider-type Google \
  --provider-details '{"client_id":"xxx.apps.googleusercontent.com","client_secret":"xxx","authorize_scopes":"openid email profile"}' \
  --attribute-mapping '{"email":"email","name":"name","picture":"picture"}'
```

## Hosted UI vs Custom UI

| Aspect | Hosted UI | Custom UI |
|--------|-----------|-----------|
| Implementation | Zero-code, AWS-hosted | Build your own login pages |
| Customization | Logo, CSS (limited) | Full control |
| Social login | Built-in buttons | Manual integration |
| OAuth flows | Fully managed | Implement with SDK |
| Time to ship | Minutes | Days to weeks |
| Production use | Prototyping, internal apps | Consumer-facing apps |

```bash
# Configure hosted UI domain
aws cognito-idp create-user-pool-domain \
  --user-pool-id us-east-1_ABC123 \
  --domain my-app-auth

# Hosted UI URL:
# https://my-app-auth.auth.us-east-1.amazoncognito.com/login?
#   client_id=xxx&response_type=code&scope=openid+email&
#   redirect_uri=https://myapp.com/callback
```

## Tokens

Cognito issues three tokens upon successful authentication:

| Token | Purpose | Default Expiry | Contains |
|-------|---------|---------------|----------|
| ID Token | User identity claims | 1 hour | User attributes, groups, custom claims |
| Access Token | API authorization | 1 hour | Scopes, groups, client ID |
| Refresh Token | Obtain new ID/access tokens | 30 days (configurable 1 hour - 10 years) | Opaque token, not a JWT |

### Token Size Considerations

- ID token grows with user attributes and group memberships
- Maximum token size: approximately 8 KB for ID/access tokens
- Users in many groups can hit token size limits
- Use pre-token-generation trigger to control claims

## OAuth 2.0 Flows

| Flow | Use Case | Security Level |
|------|----------|---------------|
| Authorization Code | Server-side web apps | Highest (uses client secret) |
| Authorization Code + PKCE | SPAs, mobile apps | High (no client secret needed) |
| Implicit | Legacy SPAs (deprecated) | Lower (tokens in URL fragment) |
| Client Credentials | Machine-to-machine | Service-level (no user context) |

Always use **Authorization Code with PKCE** for browser-based applications.

## Groups and Role-Based Access

```bash
# Create a group
aws cognito-idp create-group \
  --user-pool-id us-east-1_ABC123 \
  --group-name admins \
  --description "Administrator group" \
  --role-arn arn:aws:iam::123456789012:role/CognitoAdminRole \
  --precedence 1

# Add user to group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id us-east-1_ABC123 \
  --username john@example.com \
  --group-name admins
```

Groups appear in the `cognito:groups` claim in both ID and access tokens. When using Identity Pools, group-role mappings determine which IAM role the user assumes.

## Advanced Security Features

Available with the Plus or Essentials feature plan:

| Feature | Description |
|---------|-------------|
| Adaptive authentication | Risk-based MFA (low/medium/high risk scoring) |
| Compromised credentials | Checks sign-in credentials against breached databases |
| IP address blocking | Block or allow sign-in from specific IP ranges |
| Advanced metrics | CloudWatch metrics for sign-in attempts, risk levels |
| Account takeover protection | Detect and respond to suspicious sign-in patterns |

```bash
# Enable advanced security
aws cognito-idp update-user-pool \
  --user-pool-id us-east-1_ABC123 \
  --user-pool-add-ons AdvancedSecurityMode=ENFORCED
```

## Common CLI Commands

```bash
# Create user pool
aws cognito-idp create-user-pool --pool-name my-users

# Admin create user (skips sign-up flow)
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_ABC123 \
  --username john@example.com \
  --user-attributes Name=email,Value=john@example.com Name=email_verified,Value=true \
  --temporary-password "TempP@ss123!"

# Sign up (self-registration)
aws cognito-idp sign-up \
  --client-id <app-client-id> \
  --username john@example.com \
  --password "MyP@ssw0rd!" \
  --user-attributes Name=email,Value=john@example.com

# Confirm sign up
aws cognito-idp confirm-sign-up \
  --client-id <app-client-id> \
  --username john@example.com \
  --confirmation-code 123456

# Admin initiate auth
aws cognito-idp admin-initiate-auth \
  --user-pool-id us-east-1_ABC123 \
  --client-id <app-client-id> \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=john@example.com,PASSWORD="MyP@ssw0rd!"

# List users
aws cognito-idp list-users --user-pool-id us-east-1_ABC123

# Admin disable user
aws cognito-idp admin-disable-user \
  --user-pool-id us-east-1_ABC123 \
  --username john@example.com

# Admin set user password (permanent)
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_ABC123 \
  --username john@example.com \
  --password "N3wP@ssw0rd!" \
  --permanent

# Delete user pool
aws cognito-idp delete-user-pool --user-pool-id us-east-1_ABC123
```

## Common Gotchas

| Issue | Details |
|-------|---------|
| Cannot rename a user pool | User pool names are immutable. Must create a new pool and migrate users. |
| 50 custom attributes max | Cannot add more than 50 custom attributes. Custom attributes cannot be removed after creation (only marked unused). |
| Token size limits | ID and access tokens max out around 8 KB. Users in many groups or with many custom attributes can hit this. |
| Refresh token rotation | Old refresh tokens remain valid until expiry even after new ones are issued (no automatic revocation). Enable token revocation in app client settings. |
| User migration Lambda | Only triggered on sign-in, not sign-up. Users must attempt to log in for migration to occur. Cannot bulk-migrate via Lambda trigger. |
| Hosted UI limitations | Limited CSS customization. No JavaScript injection. Cannot change layout or add custom components. |
| Email sending limits | Default: 50 emails/day with Cognito email. Must configure SES for production workloads. |
| Username immutability | Once a user picks a username, it cannot be changed. Use email or phone as alias if flexibility is needed. |
| Case sensitivity | Usernames are case-sensitive by default. Set `UsernameConfiguration.CaseSensitive=false` at pool creation. Cannot change after creation. |
| Quotas | Default: 10 user pools per account. UserCreation: 50 req/sec. Authentication: 120 req/sec. Request increases for production loads. |
