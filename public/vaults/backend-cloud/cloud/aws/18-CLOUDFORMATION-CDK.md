# CloudFormation & CDK

CloudFormation is AWS's native Infrastructure as Code (IaC) service that lets you model and provision AWS resources using declarative YAML or JSON templates. AWS CDK (Cloud Development Kit) builds on top of CloudFormation by letting you define infrastructure using general-purpose programming languages like TypeScript, Python, Java, C#, and Go. Both ultimately produce CloudFormation templates that AWS executes to create and manage resources as atomic units called stacks.

## Template Anatomy

Every CloudFormation template follows this structure. Only `Resources` is required.

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'My application stack'

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, staging, prod]
    Default: dev

Mappings:
  RegionMap:
    us-east-1:
      AMI: ami-0abcdef1234567890
    eu-west-1:
      AMI: ami-0fedcba9876543210

Conditions:
  IsProd: !Equals [!Ref Environment, prod]

Resources:
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub 'my-app-${Environment}-assets'
      VersioningConfiguration:
        Status: !If [IsProd, Enabled, Suspended]

Outputs:
  BucketArn:
    Description: 'S3 bucket ARN'
    Value: !GetAtt MyBucket.Arn
    Export:
      Name: !Sub '${AWS::StackName}-BucketArn'
```

| Section                    | Purpose                                             |
| -------------------------- | --------------------------------------------------- |
| `AWSTemplateFormatVersion` | Template version (always `2010-09-09`)              |
| `Description`              | Human-readable stack description                    |
| `Parameters`               | Input values at deploy time                         |
| `Mappings`                 | Static lookup tables (region-to-AMI, env-to-config) |
| `Conditions`               | Conditional resource creation                       |
| `Resources`                | AWS resources to create (REQUIRED)                  |
| `Outputs`                  | Values to export or display after deployment        |

## Intrinsic Functions

These are the functions you will use constantly in templates.

| Function       | Purpose                            | Example                                           |
| -------------- | ---------------------------------- | ------------------------------------------------- |
| `!Ref`         | Reference parameter or resource ID | `!Ref MyBucket`                                   |
| `!GetAtt`      | Get resource attribute             | `!GetAtt MyBucket.Arn`                            |
| `!Sub`         | String interpolation               | `!Sub "arn:aws:s3:::${BucketName}/*"`             |
| `!Join`        | Join strings with delimiter        | `!Join ["-", [my, app, bucket]]`                  |
| `!If`          | Conditional value                  | `!If [IsProd, 3, 1]`                              |
| `!Select`      | Select from list by index          | `!Select [0, !GetAZs ""]`                         |
| `!Split`       | Split string into list             | `!Split [",", "a,b,c"]`                           |
| `!FindInMap`   | Lookup from Mappings               | `!FindInMap [RegionMap, !Ref "AWS::Region", AMI]` |
| `!ImportValue` | Import cross-stack output          | `!ImportValue SharedVPC-SubnetId`                 |
| `!GetAZs`      | Get AZs for region                 | `!GetAZs ""`                                      |

## Stacks and Stack Sets

A **stack** is a single unit of deployment. All resources in a template are created, updated, or deleted together.

**Stack Sets** extend stacks across multiple accounts and regions.

```bash
# Create a stack set
aws cloudformation create-stack-set \
  --stack-set-name my-org-baseline \
  --template-body file://baseline.yaml \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false

# Deploy to target accounts/regions
aws cloudformation create-stack-instances \
  --stack-set-name my-org-baseline \
  --deployment-targets OrganizationalUnitIds=ou-abc123 \
  --regions us-east-1 eu-west-1
```

### Nested Stacks

Break large templates into reusable child stacks.

```yaml
Resources:
  NetworkStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: https://s3.amazonaws.com/my-templates/network.yaml
      Parameters:
        VpcCidr: '10.0.0.0/16'

  AppStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: https://s3.amazonaws.com/my-templates/app.yaml
      Parameters:
        VpcId: !GetAtt NetworkStack.Outputs.VpcId
```

### Cross-Stack References

Use `Export` in outputs and `!ImportValue` to share values between independent stacks.

```yaml
# Stack A - exports
Outputs:
  VpcId:
    Value: !Ref MyVPC
    Export:
      Name: SharedVPC-Id

# Stack B - imports
Resources:
  MyInstance:
    Type: AWS::EC2::Instance
    Properties:
      SubnetId: !ImportValue SharedVPC-SubnetId
```

## Change Sets

Preview what CloudFormation will modify before applying changes. This is critical for production stacks.

```bash
# Create a change set
aws cloudformation create-change-set \
  --stack-name my-stack \
  --change-set-name my-changes \
  --template-body file://updated-template.yaml

# Review the change set
aws cloudformation describe-change-set \
  --stack-name my-stack \
  --change-set-name my-changes

# Execute if changes look correct
aws cloudformation execute-change-set \
  --stack-name my-stack \
  --change-set-name my-changes
```

## Stack Updates and Rollback

### Update Policies

Control how updates affect resources like Auto Scaling Groups.

```yaml
Resources:
  ASG:
    Type: AWS::AutoScaling::AutoScalingGroup
    UpdatePolicy:
      AutoScalingRollingUpdate:
        MaxBatchSize: 2
        MinInstancesInService: 1
        PauseTime: PT5M
        WaitOnResourceSignals: true
```

### Rollback Configuration

```bash
# Update with rollback monitoring
aws cloudformation update-stack \
  --stack-name my-stack \
  --template-body file://template.yaml \
  --rollback-configuration \
    RollbackTriggers=[{Arn=arn:aws:cloudwatch:us-east-1:123456789:alarm:HighErrors,Type=AWS::CloudWatch::Alarm}] \
    MonitoringTimeInMinutes=10
```

## Drift Detection

Detect when actual resource configuration has drifted from the template definition.

```bash
# Initiate drift detection
aws cloudformation detect-stack-drift --stack-name my-stack

# Check drift status
aws cloudformation describe-stack-drift-detection-status \
  --stack-drift-detection-id abc123

# View drifted resources
aws cloudformation describe-stack-resource-drifts \
  --stack-name my-stack \
  --stack-resource-drift-status-filters MODIFIED DELETED
```

## Custom Resources

Extend CloudFormation with custom provisioning logic via Lambda.

```yaml
Resources:
  CustomLookup:
    Type: Custom::AMILookup
    Properties:
      ServiceToken: !GetAtt LookupFunction.Arn
      Region: !Ref 'AWS::Region'
      OS: 'AmazonLinux2'

  LookupFunction:
    Type: AWS::Lambda::Function
    Properties:
      Runtime: python3.12
      Handler: index.handler
      Code:
        ZipFile: |
          import cfnresponse
          import boto3
          def handler(event, context):
              if event['RequestType'] == 'Delete':
                  cfnresponse.send(event, context, cfnresponse.SUCCESS, {})
                  return
              ec2 = boto3.client('ec2')
              # ... lookup logic ...
              cfnresponse.send(event, context, cfnresponse.SUCCESS,
                  {'AmiId': 'ami-0abcdef1234567890'})
```

## AWS CDK

### Construct Levels

| Level | Name          | Description                             | Example                                 |
| ----- | ------------- | --------------------------------------- | --------------------------------------- |
| L1    | CFN Resources | 1:1 mapping to CloudFormation resources | `CfnBucket`                             |
| L2    | Curated       | Opinionated defaults, helper methods    | `Bucket` (with encryption defaults)     |
| L3    | Patterns      | Multi-resource architectures            | `LambdaRestApi` (API GW + Lambda + IAM) |

### CDK Example (TypeScript)

```typescript
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export class MyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'DataBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(90),
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
    });

    const fn = new lambda.Function(this, 'Processor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        BUCKET_NAME: bucket.bucketName,
      },
    });

    bucket.grantRead(fn);
  }
}
```

### CDK CLI Commands

```bash
# Initialize a new CDK project
cdk init app --language typescript

# Synthesize CloudFormation template (preview what will be generated)
cdk synth

# Show diff between deployed and local
cdk diff

# Deploy the stack
cdk deploy --require-approval broadening

# Deploy multiple stacks
cdk deploy --all

# Destroy the stack
cdk destroy

# Bootstrap CDK in a new account/region (creates S3 bucket + IAM roles)
cdk bootstrap aws://123456789012/us-east-1
```

## CDK vs CloudFormation vs Terraform

| Criteria        | CloudFormation       | CDK                              | Terraform                       |
| --------------- | -------------------- | -------------------------------- | ------------------------------- |
| Language        | YAML/JSON            | TypeScript, Python, Java, C#, Go | HCL                             |
| State           | Managed by AWS       | Managed by AWS (via CFN)         | Self-managed or Terraform Cloud |
| Multi-cloud     | AWS only             | AWS only                         | Multi-cloud                     |
| Abstraction     | Low (resource-level) | High (constructs, patterns)      | Medium (modules)                |
| Drift detection | Built-in             | Via CloudFormation               | `terraform plan`                |
| Learning curve  | Moderate             | Lower (familiar languages)       | Moderate                        |
| Ecosystem       | AWS only             | CDK Construct Hub                | Large provider ecosystem        |
| Import existing | `resource-import`    | `cdk import`                     | `terraform import`              |

**Decision guide**: Use CDK if AWS-only and your team prefers real programming languages. Use Terraform if multi-cloud or already invested in HashiCorp tooling. Use raw CloudFormation for simple stacks or when CDK is overkill.

## Common CLI Commands

```bash
# Validate template syntax
aws cloudformation validate-template --template-body file://template.yaml

# Create stack
aws cloudformation create-stack \
  --stack-name my-stack \
  --template-body file://template.yaml \
  --parameters ParameterKey=Env,ParameterValue=prod \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM

# Update stack
aws cloudformation update-stack \
  --stack-name my-stack \
  --template-body file://template.yaml

# Describe stack (check status, outputs)
aws cloudformation describe-stacks --stack-name my-stack

# List stack resources
aws cloudformation list-stack-resources --stack-name my-stack

# Delete stack
aws cloudformation delete-stack --stack-name my-stack

# Wait for stack operation to complete
aws cloudformation wait stack-create-complete --stack-name my-stack

# Import existing resources into a stack
aws cloudformation create-change-set \
  --stack-name my-stack \
  --change-set-name import-existing \
  --change-set-type IMPORT \
  --resources-to-import "[{\"ResourceType\":\"AWS::S3::Bucket\",\"LogicalResourceId\":\"MyBucket\",\"ResourceIdentifier\":{\"BucketName\":\"existing-bucket\"}}]" \
  --template-body file://template.yaml
```

## Common Gotchas

| Issue                     | Details                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Stack rollback stuck      | A resource failed to delete (e.g., non-empty S3 bucket). Use `--retain-resources` to skip it, then clean up manually.       |
| 500 resource limit        | Each stack supports max 500 resources. Use nested stacks to break up large deployments.                                     |
| Circular dependencies     | Resource A depends on B, B depends on A. Refactor with `DependsOn`, break into separate stacks, or use `!GetAtt` carefully. |
| Import existing resources | Only supported via change sets with `IMPORT` type. Resource must not already belong to another stack.                       |
| Replacement updates       | Some property changes cause resource replacement (new physical ID). Always check change set before applying.                |
| CloudFormation drift      | Resources modified outside CFN will drift. Run drift detection regularly. Drifted resources are not auto-corrected.         |
| CDK bootstrap required    | CDK deploy fails in new accounts/regions without `cdk bootstrap`. Each account-region pair needs bootstrapping once.        |
| Template size limits      | 51,200 bytes for direct upload, 460,800 bytes via S3. Use S3 for larger templates.                                          |
| Deletion protection       | Enable `termination-protection` on production stacks to prevent accidental deletion.                                        |
