# Virtual Private Cloud (VPC) and Networking

A VPC is your **isolated, private network** inside AWS. Think of it as your own data center's network, except it lives in the cloud and you define it entirely in software. Every resource you launch -- EC2 instances, RDS databases, Lambda functions in a VPC -- lives inside a VPC. You control the IP address ranges, subnets, route tables, gateways, and firewall rules. If you do not create a VPC explicitly, AWS gives you a default VPC in each region, but production workloads should always use a custom VPC with deliberate network design.

---

## 1. VPC Fundamentals

### 1.1 CIDR Blocks

When you create a VPC, you assign it a **CIDR block** (Classless Inter-Domain Routing) -- the range of private IP addresses available to your resources.

| CIDR Block    | IP Range                | Hosts   |
| ------------- | ----------------------- | ------- |
| `10.0.0.0/16` | 10.0.0.0 - 10.0.255.255 | ~65,536 |
| `10.0.0.0/20` | 10.0.0.0 - 10.0.15.255  | ~4,096  |
| `10.0.0.0/24` | 10.0.0.0 - 10.0.0.255   | ~256    |

**Rules of thumb:**

- Use `/16` for production VPCs (gives you room to grow)
- Use private IP ranges: `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16`
- Plan CIDR blocks carefully -- you cannot change them after creation (you can only add secondary CIDRs)
- Avoid overlapping CIDRs between VPCs if you ever plan to peer them

```bash
# Create a VPC
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications \
  'ResourceType=vpc,Tags=[{Key=Name,Value=prod-vpc}]'
```

### 1.2 AWS Reserves 5 IPs Per Subnet

In every subnet, AWS reserves 5 IP addresses:

| Address       | Purpose                                |
| ------------- | -------------------------------------- |
| `.0`          | Network address                        |
| `.1`          | VPC router                             |
| `.2`          | DNS server                             |
| `.3`          | Reserved for future use                |
| `.255` (last) | Broadcast (not supported but reserved) |

A `/24` subnet gives you 256 IPs minus 5 = **251 usable IPs**.

---

## 2. Subnets

A subnet is a **segment of a VPC's CIDR** that lives in a **single Availability Zone**. You place resources in subnets to control their network exposure and redundancy.

### 2.1 Public vs Private Subnets

| Aspect                  | Public Subnet                                   | Private Subnet                                           |
| ----------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| Route to internet       | Route table has `0.0.0.0/0 -> Internet Gateway` | No direct internet route (or routes through NAT Gateway) |
| Public IPs              | Instances can have public/Elastic IPs           | Instances have only private IPs                          |
| Use case                | Load balancers, bastion hosts, NAT Gateways     | Application servers, databases, internal services        |
| Reachable from internet | Yes (if security groups allow)                  | No                                                       |

### 2.2 Subnet Design Pattern

A common production layout across 3 AZs:

```
VPC: 10.0.0.0/16

AZ-a                    AZ-b                    AZ-c
------------------      ------------------      ------------------
Public  10.0.1.0/24     Public  10.0.2.0/24     Public  10.0.3.0/24
Private 10.0.11.0/24    Private 10.0.12.0/24    Private 10.0.13.0/24
Isolated 10.0.21.0/24   Isolated 10.0.22.0/24   Isolated 10.0.23.0/24
```

- **Public**: ALB, NAT Gateways, bastion hosts
- **Private**: Application servers, ECS tasks (can reach internet via NAT)
- **Isolated**: Databases, ElastiCache (no internet access at all)

```bash
# Create a subnet
aws ec2 create-subnet \
  --vpc-id vpc-0abc123 \
  --cidr-block 10.0.1.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=public-1a}]'

# Enable auto-assign public IPs for public subnets
aws ec2 modify-subnet-attribute \
  --subnet-id subnet-0abc123 \
  --map-public-ip-on-launch
```

---

## 3. Gateways

### 3.1 Internet Gateway (IGW)

An IGW connects your VPC to the internet. It is horizontally scaled, redundant, and highly available -- you never need more than one per VPC.

```bash
# Create and attach an Internet Gateway
aws ec2 create-internet-gateway --tag-specifications \
  'ResourceType=internet-gateway,Tags=[{Key=Name,Value=prod-igw}]'

aws ec2 attach-internet-gateway \
  --internet-gateway-id igw-0abc123 \
  --vpc-id vpc-0abc123
```

An IGW alone does nothing. You must also add a route in the subnet's route table pointing `0.0.0.0/0` to the IGW.

### 3.2 NAT Gateway

A NAT Gateway lets resources in **private subnets** make outbound requests to the internet (e.g., download packages, call external APIs) without being reachable from the internet.

```bash
# Allocate an Elastic IP for the NAT Gateway
aws ec2 allocate-address --domain vpc

# Create NAT Gateway in a PUBLIC subnet
aws ec2 create-nat-gateway \
  --subnet-id subnet-0abc123-public \
  --allocation-id eipalloc-0abc123
```

**Important details:**

- NAT Gateways live in **public** subnets (they need internet access themselves)
- Deploy one NAT Gateway per AZ for high availability
- They are not cheap: ~$0.045/hr + $0.045/GB processed
- For cost savings in dev/test, consider a NAT instance (t3.nano) instead

### 3.3 Egress-Only Internet Gateway

For IPv6 only. Allows outbound IPv6 traffic from private subnets while preventing inbound connections. The IPv6 equivalent of a NAT Gateway.

---

## 4. Route Tables

A route table contains **rules (routes)** that determine where network traffic is directed.

### 4.1 Main vs Custom Route Tables

| Type               | Scope                               | Notes                                                            |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------- |
| Main route table   | Created automatically with VPC      | Default for all subnets that do not have an explicit association |
| Custom route table | You create and associate explicitly | Best practice: always use custom route tables                    |

### 4.2 Example Route Tables

**Public subnet route table:**

| Destination   | Target     | Purpose                            |
| ------------- | ---------- | ---------------------------------- |
| `10.0.0.0/16` | local      | Traffic within the VPC             |
| `0.0.0.0/0`   | igw-abc123 | All other traffic goes to internet |

**Private subnet route table:**

| Destination   | Target     | Purpose                           |
| ------------- | ---------- | --------------------------------- |
| `10.0.0.0/16` | local      | Traffic within the VPC            |
| `0.0.0.0/0`   | nat-abc123 | Outbound internet via NAT Gateway |

**Isolated subnet route table:**

| Destination   | Target | Purpose                     |
| ------------- | ------ | --------------------------- |
| `10.0.0.0/16` | local  | Traffic within the VPC only |

```bash
# Create a route table
aws ec2 create-route-table --vpc-id vpc-0abc123

# Add a route to the internet via IGW
aws ec2 create-route \
  --route-table-id rtb-0abc123 \
  --destination-cidr-block 0.0.0.0/0 \
  --gateway-id igw-0abc123

# Associate route table with a subnet
aws ec2 associate-route-table \
  --route-table-id rtb-0abc123 \
  --subnet-id subnet-0abc123
```

---

## 5. Security Groups vs NACLs

These are your two layers of network firewall. They work at different levels and have different behaviors.

### 5.1 Security Groups

Security groups are **stateful** firewalls attached at the **instance level** (ENI).

| Aspect           | Detail                                                                               |
| ---------------- | ------------------------------------------------------------------------------------ |
| Level            | Instance (network interface)                                                         |
| Statefulness     | **Stateful** -- if you allow inbound, the response is automatically allowed outbound |
| Default behavior | All inbound DENIED, all outbound ALLOWED                                             |
| Rules            | Allow rules only (no deny rules)                                                     |
| Evaluation       | All rules evaluated together                                                         |
| Referencing      | Can reference other security groups by ID                                            |

```bash
# Create a security group
aws ec2 create-security-group \
  --group-name web-sg \
  --description "Allow HTTP and HTTPS" \
  --vpc-id vpc-0abc123

# Allow inbound HTTP
aws ec2 authorize-security-group-ingress \
  --group-id sg-0abc123 \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

# Allow inbound from another security group
aws ec2 authorize-security-group-ingress \
  --group-id sg-db-0abc123 \
  --protocol tcp \
  --port 5432 \
  --source-group sg-app-0abc123

# List security group rules
aws ec2 describe-security-groups --group-ids sg-0abc123
```

### 5.2 Network ACLs (NACLs)

NACLs are **stateless** firewalls attached at the **subnet level**.

| Aspect           | Detail                                                               |
| ---------------- | -------------------------------------------------------------------- |
| Level            | Subnet                                                               |
| Statefulness     | **Stateless** -- you must explicitly allow both inbound AND outbound |
| Default behavior | Allow all inbound and outbound                                       |
| Rules            | Both allow AND deny rules                                            |
| Evaluation       | Rules evaluated in **order** (lowest number first), first match wins |
| Use case         | Broad subnet-level blocking (e.g., block a known malicious IP range) |

**Most teams rely on security groups and leave NACLs at their defaults.** NACLs are useful as a second line of defense or for compliance requirements.

### 5.3 Comparison Table

| Feature         | Security Group | NACL                         |
| --------------- | -------------- | ---------------------------- |
| Scope           | Instance       | Subnet                       |
| Stateful        | Yes            | No                           |
| Allow/Deny      | Allow only     | Both                         |
| Rule evaluation | All rules      | Ordered by number            |
| Applied to      | ENI            | All traffic in/out of subnet |

---

## 6. VPC Peering and Transit Gateway

### 6.1 VPC Peering

A VPC peering connection is a **1:1 network link** between two VPCs. Traffic stays on the AWS backbone (never hits the public internet).

```bash
# Request peering
aws ec2 create-vpc-peering-connection \
  --vpc-id vpc-requester \
  --peer-vpc-id vpc-accepter \
  --peer-owner-id 111122223333

# Accept peering (run from the accepter account/VPC)
aws ec2 accept-vpc-peering-connection \
  --vpc-peering-connection-id pcx-0abc123
```

**Limitations:**

- Not transitive: if A peers with B and B peers with C, A cannot talk to C through B
- CIDR blocks must not overlap
- You must update route tables on both sides

### 6.2 Transit Gateway

Transit Gateway is a **hub-and-spoke** network hub. Connect many VPCs and on-premises networks through a single gateway.

| Feature            | VPC Peering               | Transit Gateway                |
| ------------------ | ------------------------- | ------------------------------ |
| Topology           | Point-to-point            | Hub-and-spoke                  |
| Transitive routing | No                        | Yes                            |
| Scale              | Dozens of connections     | Thousands of VPCs              |
| Cost               | Free (data transfer only) | Hourly + per-GB                |
| Complexity         | Simple                    | More complex but more scalable |

Use VPC peering for simple 2-3 VPC setups. Use Transit Gateway when you have many VPCs, multiple accounts, or hybrid connectivity.

---

## 7. VPC Endpoints

VPC endpoints let your resources access AWS services **without traversing the internet**. Traffic stays within the AWS network.

### 7.1 Gateway Endpoints

Available only for **S3 and DynamoDB**. Free. Implemented as a route table entry.

```bash
# Create a gateway endpoint for S3
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-0abc123 \
  --service-name com.amazonaws.us-east-1.s3 \
  --route-table-ids rtb-0abc123
```

### 7.2 Interface Endpoints (PrivateLink)

Available for most other AWS services (SQS, KMS, Secrets Manager, ECR, etc.). Creates an ENI in your subnet with a private IP.

```bash
# Create an interface endpoint for Secrets Manager
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-0abc123 \
  --service-name com.amazonaws.us-east-1.secretsmanager \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-0abc123 \
  --security-group-ids sg-0abc123
```

**Cost:** ~$0.01/hr per AZ + $0.01/GB processed. For high-traffic services (like S3), use the free gateway endpoint instead.

### 7.3 When to Use Endpoints

- Private subnets with no NAT Gateway
- Compliance requirements (traffic must not leave AWS network)
- Reducing NAT Gateway data processing costs (S3 traffic through a gateway endpoint is free)
- High-security environments

---

## 8. DNS Resolution

Two VPC settings control DNS behavior:

| Setting              | Default | Purpose                                                         |
| -------------------- | ------- | --------------------------------------------------------------- |
| `enableDnsSupport`   | true    | VPC provides a DNS server at `169.254.169.253` (the +2 address) |
| `enableDnsHostnames` | false   | Instances with public IPs get public DNS hostnames              |

**Both must be true** for VPC endpoints with private DNS to work, and for Route 53 private hosted zones.

```bash
# Enable DNS hostnames
aws ec2 modify-vpc-attribute \
  --vpc-id vpc-0abc123 \
  --enable-dns-hostnames '{"Value": true}'
```

---

## 9. Three-Tier Network Design Pattern

This is the most common production network architecture:

```
                    Internet
                       |
                  Internet Gateway
                       |
          +------ Public Subnets ------+
          |  ALB    NAT GW   Bastion   |
          +----------------------------+
                       |
          +------ Private Subnets -----+
          |  EC2    ECS    Lambda(VPC)  |
          +----------------------------+
                       |
          +------ Isolated Subnets ----+
          |  RDS    ElastiCache  ES    |
          +----------------------------+
```

| Tier        | Subnet Type | Internet Access           | Contains                  |
| ----------- | ----------- | ------------------------- | ------------------------- |
| Web/Edge    | Public      | Full (inbound + outbound) | ALB, NAT Gateway, bastion |
| Application | Private     | Outbound only (via NAT)   | App servers, containers   |
| Data        | Isolated    | None                      | Databases, caches         |

### Security Group Chaining

```
Internet -> ALB (sg-alb: allow 80/443 from 0.0.0.0/0)
         -> App (sg-app: allow 8080 from sg-alb)
         -> DB  (sg-db:  allow 5432 from sg-app)
```

Each layer only accepts traffic from the layer above it. The database security group references the application security group, not an IP range.

---

## 10. Essential CLI Commands

```bash
# VPC operations
aws ec2 create-vpc --cidr-block 10.0.0.0/16
aws ec2 describe-vpcs --filters "Name=tag:Name,Values=prod-vpc"
aws ec2 delete-vpc --vpc-id vpc-0abc123

# Subnet operations
aws ec2 create-subnet --vpc-id vpc-0abc123 --cidr-block 10.0.1.0/24 --availability-zone us-east-1a
aws ec2 describe-subnets --filters "Name=vpc-id,Values=vpc-0abc123" \
  --query 'Subnets[].{ID:SubnetId,CIDR:CidrBlock,AZ:AvailabilityZone}'

# Security group operations
aws ec2 describe-security-groups --filters "Name=vpc-id,Values=vpc-0abc123"
aws ec2 describe-security-group-rules --filter "Name=group-id,Values=sg-0abc123"

# Route table operations
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=vpc-0abc123"

# VPC Flow Logs (for debugging network issues)
aws ec2 create-flow-logs \
  --resource-type VPC \
  --resource-ids vpc-0abc123 \
  --traffic-type ALL \
  --log-destination-type cloud-watch-logs \
  --log-group-name vpc-flow-logs \
  --deliver-logs-permission-arn arn:aws:iam::123456789012:role/flow-logs-role
```

---

## 11. Common Gotchas

### 11.1 CIDR Overlap

If VPC A uses `10.0.0.0/16` and VPC B uses `10.0.0.0/16`, you **cannot peer them**. Plan your CIDR allocations before creating VPCs. Use a CIDR allocation spreadsheet or IPAM.

### 11.2 NAT Gateway Costs

NAT Gateways charge per hour AND per GB. A busy application downloading packages, calling external APIs, or transferring data can rack up hundreds of dollars. Mitigations:

- Use VPC endpoints for AWS service traffic (S3, DynamoDB, ECR)
- Cache package repositories inside your VPC
- Consolidate NAT Gateways in dev/staging (accept the AZ failure risk)

### 11.3 Ephemeral Ports in NACLs

Because NACLs are **stateless**, you must allow return traffic on ephemeral ports (1024-65535). Forgetting this is the number one NACL debugging headache.

```
# Inbound NACL rule: allow HTTP
Rule 100: Allow TCP 80 from 0.0.0.0/0

# Outbound NACL rule: allow response traffic
Rule 100: Allow TCP 1024-65535 to 0.0.0.0/0   <-- REQUIRED for stateless
```

### 11.4 Default Security Group Pitfall

The default security group in a VPC allows **all inbound traffic from itself** and **all outbound traffic**. If you accidentally attach the default SG, instances can talk to each other freely. Always create and use custom security groups.

### 11.5 One IGW Per VPC

You cannot attach more than one Internet Gateway to a VPC. You also cannot share an IGW across VPCs. This is a hard AWS limit.

### 11.6 Subnet Size Is Permanent

Once created, you cannot resize a subnet's CIDR. Plan ahead. If you need more IPs, create a new subnet with a larger CIDR and migrate.

### 11.7 Cross-AZ Data Transfer

Traffic between AZs within the same region costs $0.01/GB each way. For chatty microservices, this adds up. Place services that communicate frequently in the same AZ when possible, but do not sacrifice availability for cost.
