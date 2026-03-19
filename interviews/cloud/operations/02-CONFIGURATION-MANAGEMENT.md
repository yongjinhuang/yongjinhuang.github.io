# Configuration Management — Pushing Config to 10K Hosts

> Operations Interview Prep | Cloud Operations Series

---

## 1. Why Configuration Management Matters at Scale

### The Configuration Chaos Problem

Without systematic configuration management, infrastructure degrades into chaos over time. Three failure modes dominate:

**Configuration Drift**
Servers that started identical slowly diverge through manual changes, failed deployments, or OS patches applied at different times. After 6 months, no two hosts are the same.

```
Month 0                    Month 6
+---------+               +---------+
| web-001 |               | web-001 | <- nginx 1.24, openssl 3.0.x
| nginx   |               +---------+
| openssl |               +---------+
| same    |               | web-002 | <- nginx 1.22, openssl 1.1.x (CVE!)
+---------+               +---------+
                          +---------+
                          | web-003 | <- nginx 1.24, custom config
+---------+               +---------+
| web-002 |
| same    |               Drift = Security Risk + Debugging Nightmare
+---------+
```

**Snowflake Servers**
Hosts configured exclusively through manual SSH sessions. Nobody knows what's on them. The engineer who built them left two years ago. Touching them is terrifying.

```
"Works on web-047 but not anywhere else"
       |
       v
  ssh web-047
  ls /etc/nginx/conf.d/
  # 47 config files, none in git
  # Last modified 2021
  # Timestamp: 3am
```

**Compliance Failures**
Auditors require proof that every host meets CIS benchmarks, has specific TLS versions, or runs only approved software. Manual verification across thousands of hosts is impossible without tooling.

### The Business Case for Config Management

```
Problem                  Without CM             With CM
---------------------------------------------------------------------------
Deploy a config change   SSH to 500 hosts       1 playbook run, 8 minutes
                         4 engineers, 2 hours
---------------------------------------------------------------------------
Detect a config drift    Quarterly audit        Continuous, automated alerts
                         finds issues after     within 30 minutes of change
                         months
---------------------------------------------------------------------------
Prove compliance         Manual spot checks     Automated reports, full
                         50% coverage           audit trail, 100% coverage
---------------------------------------------------------------------------
Recover from incident    "What was on that      Rebuild from code, 15 min
                         server?"               to identical state
---------------------------------------------------------------------------
Onboard new host         Manual runbook         Zero-touch, auto-configured
                         30 steps, error-prone  on first Puppet run
---------------------------------------------------------------------------
```

### Core Principles

**Desired State vs Imperative Commands**
Config management tools express WHAT you want, not HOW to get there. The tool figures out the steps.

```bash
# Imperative (wrong approach at scale)
apt-get install -y nginx
sed -i 's/worker_processes 1/worker_processes 4/' /etc/nginx/nginx.conf
systemctl enable nginx
systemctl start nginx

# Declarative (config management approach)
# Just declare the desired state:
package { 'nginx': ensure => installed }
file { '/etc/nginx/nginx.conf': content => template('nginx/nginx.conf.erb') }
service { 'nginx': ensure => running, enable => true }
```

**Idempotency**
Running the same configuration 100 times produces the same result as running it once. No side effects from repeated application.

---

## 2. Tool Comparison: Ansible vs Puppet vs Chef vs Salt

### Architecture Overview

```
ANSIBLE (Agentless, Push)
+-----------+     SSH/WinRM     +----------+
|  Control  | --------------->  |  Host 1  |
|   Node    | --------------->  |  Host 2  |
| (your box)|                   |  Host N  |
+-----------+                   +----------+
  Playbooks                     No agent required
  Inventory


PUPPET (Agent-based, Pull)
+----------------+     HTTPS/8140    +------------------+
|  Puppet Server |  <--------------  | puppetd (agent)  | Host 1
|  (Compile +    |  <--------------  | puppetd (agent)  | Host 2
|   Serve        |                   | puppetd (agent)  | Host N
|   Catalogs)    |                   +------------------+
+----------------+                   Agents pull every 30min
  PuppetDB


CHEF (Agent-based, Pull)
+-------------+  +----------+     Pulls     +------------------+
| Chef Server |  | Chef     | <-----------  | chef-client      | Host 1
| (API)       |  | Workstati|              | chef-client      | Host 2
+-------------+  +----------+              +------------------+
   Cookbooks    knife CLI tool


SALT (Flexible: Push OR Pull)
+-------------+     ZeroMQ (4505/4506)    +------------------+
| Salt Master |  <---------------------->  | Salt Minion     | Host 1
|             |  <---------------------->  | Salt Minion     | Host 2
+-------------+                            +------------------+
  Pillars/States                         OR: Salt SSH (agentless)
```

### Detailed Comparison Table

```
Feature            Ansible          Puppet           Chef             SaltStack
---------------------------------------------------------------------------
Architecture       Agentless        Agent-pull        Agent-pull       Agent (ZeroMQ)
                                                                       or agentless

Language           YAML (playbooks) Puppet DSL / Ruby Ruby (recipes)   YAML (states)
                                                                       + Jinja2

Push vs Pull       Push (default)   Pull (default)   Pull (default)   Both

Agent Required     No               Yes (puppetd)    Yes (chef-client) Optional

Initial Speed      Fast (SSH)       Slow (30min pull) Slow (30min)    Very fast (ZeroMQ)

Execution Speed    Moderate         Fast after compile Moderate       Very fast

Learning Curve     Low              Medium-High       High             Medium

Idempotency        Module-dependent Built-in           Built-in        Built-in

Scalability        Moderate (SSH)   High (pull)       High (pull)     Very high (ZeroMQ)

Windows Support    Good (WinRM)     Good              Good             Moderate

Secrets            Ansible Vault    Hiera+eyaml       data_bags+       Pillar + ext
                                                      chef-vault       pillar

Community          Very large       Large             Large            Medium

Enterprise         AWX / Tower      Puppet Enterprise Chef Automate    SaltStack Ent.

Best For           Ad-hoc tasks,    Large-scale       Large-scale      Very large scale,
                   simple envs,     infra, compliance config mgmt,     event-driven,
                   push-based       enforcement       Ruby shops       real-time ops
```

### When to Choose Which

```
Choose ANSIBLE when:
  - Team is new to config management
  - Need agentless (can't install software on hosts)
  - Mixed workloads (infra + app deployments)
  - Small-medium scale (<1000 hosts typically fine)
  - Need to run ad-hoc commands quickly

Choose PUPPET when:
  - Large enterprise, compliance-heavy
  - Need guaranteed state enforcement (pull model)
  - Large existing Puppet ecosystem
  - Dedicated ops team comfortable with Puppet DSL

Choose CHEF when:
  - Ruby shop, developers own infra
  - Complex conditional logic in configs
  - Large cookbook ecosystem already in use

Choose SALT when:
  - Very large scale (10K+ hosts)
  - Need real-time event-driven automation
  - Want both push and pull capabilities
  - High-frequency config changes
```

---

## 3. Ansible Deep Dive

### Inventory: Defining Your Fleet

```ini
# /etc/ansible/hosts or project-local inventory/hosts.ini

[webservers]
web-001.prod.example.com
web-002.prod.example.com
web-[003:099].prod.example.com  # Pattern: web-003 through web-099

[dbservers]
db-primary.prod.example.com ansible_user=postgres
db-replica-[01:05].prod.example.com

[prod:children]   # Group of groups
webservers
dbservers

[prod:vars]       # Group variables
ansible_user=deploy
ansible_ssh_private_key_file=~/.ssh/prod_deploy_key
environment=production
```

**Dynamic Inventory** (AWS example):

```bash
# Use AWS dynamic inventory plugin
# ansible.cfg
[inventory]
enable_plugins = aws_ec2

# aws_ec2.yml
plugin: aws_ec2
regions:
  - us-east-1
  - us-west-2
filters:
  instance-state-name: running
  tag:Environment: production
keyed_groups:
  - key: tags.Role
    prefix: role
  - key: placement.region
    prefix: region
hostnames:
  - private-ip-address
```

### Playbook Structure

```yaml
# deploy-nginx.yml
---
- name: Configure nginx web servers
  hosts: webservers
  become: true # sudo
  gather_facts: true
  serial: '20%' # Rolling updates: 20% of hosts at a time
  max_fail_percentage: 10 # Abort if >10% fail

  vars:
    nginx_worker_processes: '{{ ansible_processor_vcpus }}'
    nginx_version: '1.24.0'

  pre_tasks:
    - name: Update apt cache
      apt:
        update_cache: true
        cache_valid_time: 3600
      when: ansible_os_family == "Debian"

  roles:
    - common
    - nginx
    - monitoring-agent

  post_tasks:
    - name: Verify nginx is responding
      uri:
        url: 'http://localhost/health'
        status_code: 200
      retries: 3
      delay: 5
```

### Role Structure

```
roles/
  nginx/
    tasks/
      main.yml          # Entry point for tasks
      install.yml       # Installation tasks
      configure.yml     # Configuration tasks
    handlers/
      main.yml          # Handlers (restart nginx, reload config)
    templates/
      nginx.conf.j2     # Jinja2 template
      vhost.conf.j2
    files/
      dhparams.pem      # Static files
    vars/
      main.yml          # Role variables (high precedence)
    defaults/
      main.yml          # Default variables (low precedence, overridable)
    meta/
      main.yml          # Role dependencies
    README.md
```

```yaml
# roles/nginx/tasks/main.yml
---
- import_tasks: install.yml
- import_tasks: configure.yml

# roles/nginx/tasks/install.yml
---
- name: Install nginx
  package:
    name: "nginx={{ nginx_version }}"
    state: present
  notify: Restart nginx

- name: Ensure nginx directories exist
  file:
    path: "{{ item }}"
    state: directory
    owner: www-data
    group: www-data
    mode: '0755'
  loop:
    - /etc/nginx/conf.d
    - /etc/nginx/ssl
    - /var/log/nginx

# roles/nginx/templates/nginx.conf.j2
worker_processes {{ nginx_worker_processes }};
worker_rlimit_nofile {{ nginx_worker_rlimit | default(65535) }};

events {
    worker_connections {{ nginx_worker_connections | default(1024) }};
    use epoll;
    multi_accept on;
}

http {
    sendfile on;
    tcp_nopush on;
    keepalive_timeout {{ nginx_keepalive_timeout | default(65) }};

    {% if nginx_gzip_enabled | default(true) %}
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript;
    {% endif %}

    include /etc/nginx/conf.d/*.conf;
}

# roles/nginx/handlers/main.yml
---
- name: Restart nginx
  service:
    name: nginx
    state: restarted

- name: Reload nginx
  service:
    name: nginx
    state: reloaded
```

### Ansible Vault — Encrypting Secrets

```bash
# Encrypt a file
ansible-vault encrypt group_vars/prod/secrets.yml

# Encrypt a single string (for embedding in playbooks)
ansible-vault encrypt_string 'supersecret' --name 'db_password'

# Run playbook with vault password
ansible-playbook deploy.yml --ask-vault-pass
# Or from file (for CI/CD)
ansible-playbook deploy.yml --vault-password-file ~/.vault_pass

# Rotate vault password
ansible-vault rekey secrets.yml
```

```yaml
# group_vars/prod/secrets.yml (encrypted at rest)
---
db_password: !vault |
  $ANSIBLE_VAULT;1.1;AES256
  38653365623735633764316337323535343561613462333730316332336436
  3765623439613464376131383233343363646234666439360a613434336535
  ...
```

### AWX / Ansible Tower

AWX is the open-source upstream of Red Hat Ansible Tower. It provides:

```
AWX Architecture:
+------------------+
|   Web UI / API   |  <- REST API, RBAC, auditing
+------------------+
|   Task Engine    |  <- Celery workers, job scheduling
+------------------+
|   Messaging      |  <- Redis/RabbitMQ
+------------------+
|   Database       |  <- PostgreSQL (job history, inventory)
+------------------+

Key Features:
- Role-based access control (who can run what against which hosts)
- Job templates (parameterized playbook runs)
- Credential management (SSH keys, vault passwords, cloud creds)
- Inventory sync (AWS, GCP, Azure, VMware)
- Workflow templates (chain multiple playbooks)
- Scheduled runs
- Webhook triggers (from GitHub, GitLab)
- Full audit log
```

### Execution Strategies

```yaml
# Strategy: linear (default) — all hosts complete each task before moving on
- hosts: all
  strategy: linear

# Strategy: free — each host runs as fast as it can
- hosts: all
  strategy: free

# Strategy: serial — rolling updates
- hosts: webservers
  serial: 5          # 5 hosts at a time
  # or
  serial: "10%"      # 10% of fleet at a time
  # or staged
  serial:
    - 1              # canary: 1 host first
    - "10%"          # then 10%
    - "100%"         # then the rest
```

### Callback Plugins

```yaml
# ansible.cfg
[defaults]
callback_plugins = ./callback_plugins
stdout_callback = yaml       # Better output formatting
callback_whitelist = timer, profile_tasks, slack

# Result: profile_tasks shows slowest tasks
# custom callback plugin: callback_plugins/notify_slack.py
```

---

## 4. Puppet Deep Dive

### Agent-Server Model

```
Puppet Run Cycle (every 30 minutes by default):

  +-------------+                    +---------------+
  | Puppet      |                    | Puppet Server |
  | Agent       |                    |               |
  | (Host)      |                    |               |
  +------+------+                    +-------+-------+
         |                                   |
         | 1. Send facts (facter)            |
         |   {os: ubuntu, ram: 8gb, ...}     |
         +---------------------------------> |
         |                                   |
         |   2. Compile catalog              |
         |   (Hiera lookups + manifests)     |
         |                                   |
         | 3. Receive catalog                |
         | (desired state for THIS host)     |
         | <---------------------------------+
         |                                   |
         | 4. Apply catalog                  |
         |   (make reality match desired)    |
         |                                   |
         | 5. Send report                    |
         |   (changed/unchanged/failed)      |
         +---------------------------------> |
                                             |
                                     +-------+-------+
                                     |   PuppetDB    |
                                     | (store facts, |
                                     |  reports,     |
                                     |  catalogs)    |
                                     +---------------+
```

### Manifests and Resources

```puppet
# /etc/puppetlabs/code/environments/production/manifests/site.pp

# Node classification
node 'web-001.prod.example.com' {
  include profile::webserver
  include profile::monitoring
}

# Pattern matching
node /^web-\d+\.prod\./ {
  include profile::webserver
}

# Default
node default {
  include profile::base
}
```

```puppet
# modules/nginx/manifests/init.pp
class nginx (
  String  $version            = '1.24.0',
  Integer $worker_processes   = $facts['processors']['count'],
  Boolean $gzip_enabled       = true,
  Integer $keepalive_timeout  = 65,
) {

  package { 'nginx':
    ensure => $version,
  }

  file { '/etc/nginx/nginx.conf':
    ensure  => file,
    owner   => 'root',
    group   => 'root',
    mode    => '0644',
    content => epp('nginx/nginx.conf.epp', {
      worker_processes  => $worker_processes,
      gzip_enabled      => $gzip_enabled,
      keepalive_timeout => $keepalive_timeout,
    }),
    require => Package['nginx'],
    notify  => Service['nginx'],
  }

  service { 'nginx':
    ensure  => running,
    enable  => true,
    require => [Package['nginx'], File['/etc/nginx/nginx.conf']],
  }
}
```

### Hiera — Hierarchical Data Lookup

```yaml
# hiera.yaml (hierarchy definition)
---
version: 5
defaults:
  datadir: data
  data_hash: yaml_data

hierarchy:
  - name: 'Node-specific data'
    path: 'nodes/%{trusted.certname}.yaml'

  - name: 'Environment data'
    path: 'environments/%{server_facts.environment}.yaml'

  - name: 'Role data'
    path: 'roles/%{facts.role}.yaml'

  - name: 'OS family data'
    path: 'os/%{facts.os.family}.yaml'

  - name: 'Common data'
    path: 'common.yaml'
```

```yaml
# data/environments/production.yaml
nginx::version: '1.24.0'
nginx::worker_processes: 8
nginx::keepalive_timeout: 120

# data/roles/webserver.yaml
nginx::gzip_enabled: true
nginx::worker_connections: 2048

# data/nodes/web-001.prod.example.com.yaml
nginx::worker_processes: 16  # Override for this specific host
```

```
Hiera Lookup Order (most specific wins):
nodes/web-001.prod.example.com.yaml   <- WINS if defined here
environments/production.yaml
roles/webserver.yaml
os/Debian.yaml
common.yaml
```

### Roles and Profiles Pattern

```puppet
# The Roles and Profiles design pattern

# PROFILE: Technology-specific configuration
# modules/profile/manifests/webserver.pp
class profile::webserver {
  include nginx
  include php_fpm
  include logrotate

  nginx::vhost { 'app':
    server_name => $facts['fqdn'],
    root        => '/var/www/app',
  }
}

# ROLE: Business-specific node classification
# modules/role/manifests/app_server.pp
class role::app_server {
  include profile::base
  include profile::webserver
  include profile::monitoring
  include profile::security_hardening
}
```

### PuppetDB Queries

```bash
# Query PuppetDB for hosts with a specific fact
puppet query 'nodes[certname] { facts { name = "os.release.major" and value = "22.04" } }'

# Find hosts that failed their last run
puppet query 'nodes[certname] { latest_report_status = "failed" }'

# Find all hosts running nginx < 1.24
puppet query 'resources[certname, parameters] {
  type = "Package" and title = "nginx"
  and parameters.ensure < "1.24.0"
}'

# Count hosts by role
puppet query 'facts[value, count()] {
  name = "role"
  group by value
}'
```

---

## 5. Configuration Drift Detection and Remediation

### What is Drift?

```
Desired State (in Git/Puppet/Ansible)    Actual State (on host)
-----------------------------------------+---------------------------
nginx version: 1.24.0                    nginx version: 1.22.1  DRIFT
worker_processes: 4                      worker_processes: 4    OK
keepalive_timeout: 65                    keepalive_timeout: 120 DRIFT
/etc/nginx/conf.d/app.conf: (template)   /etc/nginx/conf.d/app.conf: (manual edit) DRIFT
firewall: port 22, 80, 443               firewall: port 22, 80, 443, 3306 DRIFT (!)
```

### Detection Methods

```bash
# Ansible: Check mode (dry run — shows what WOULD change)
ansible-playbook site.yml --check --diff

# Output shows drift:
# TASK [nginx : Configure nginx]
# --- before: /etc/nginx/nginx.conf
# +++ after: /etc/nginx/nginx.conf
# @@ -1,3 +1,3 @@
# -keepalive_timeout 120;
# +keepalive_timeout 65;

# Puppet: Noop mode
puppet agent --noop
# Shows what would change without applying

# Linux built-in: aide (Advanced Intrusion Detection Environment)
aide --check  # Compare filesystem against database
```

**Centralized Drift Dashboard:**

```
+--------------------------------------------+
|          CONFIGURATION DRIFT REPORT        |
|          Generated: 2024-01-15 06:00 UTC   |
+--------------------------------------------+
| Total Hosts:     10,247                    |
| Compliant:        9,891  (96.5%)           |
| Drifted:            312  ( 3.0%)           |
| Failed Agent:        44  ( 0.4%)           |
+--------------------------------------------+
| TOP DRIFT CATEGORIES:                      |
|  1. Package versions        187 hosts      |
|  2. File content changes     82 hosts      |
|  3. Service state             31 hosts     |
|  4. Firewall rules            12 hosts     |
+--------------------------------------------+
```

### Auto-Remediation vs Alert-Only

```
Decision Framework:

  Is the change in a critical path?
  (auth, firewall, kernel params)
         |
         +--YES--> Alert immediately + page on-call
         |         DO NOT auto-remediate
         |
         +--NO---> Is environment production?
                          |
                          +--YES--> Alert team + schedule
                          |         remediation window
                          |
                          +--NO---> Auto-remediate
                                    Log + notify
```

```yaml
# Ansible: Auto-remediation scheduled job
# In AWX/Tower: schedule this playbook to run every 30 minutes
- name: Drift remediation
  hosts: all
  gather_facts: true

  tasks:
    - name: Enforce base configuration
      include_role:
        name: '{{ item }}'
      loop:
        - common
        - security-hardening
        - monitoring-agent
```

### Compliance Scanning

```bash
# OpenSCAP — CIS benchmark scanning
oscap xccdf eval \
  --profile xccdf_org.ssgproject.content_profile_cis \
  --results scan-results.xml \
  --report scan-report.html \
  /usr/share/xml/scap/ssg/content/ssg-ubuntu2204-ds.xml

# Inspec (Chef's compliance framework, standalone)
inspec exec https://github.com/dev-sec/linux-baseline \
  -t ssh://root@web-001.prod.example.com \
  --reporter cli json:/tmp/results.json

# Run against all hosts in parallel
# inspec-parallel with 50 concurrent connections
```

---

## 6. Secrets Management in Configuration

### The Problem with Config + Secrets

```
NEVER DO THIS:
# group_vars/prod/vars.yml (in Git)
db_password: "ProdP@ssw0rd123!"
api_key: "sk-prod-abc123def456"
ssl_private_key: |
  -----BEGIN RSA PRIVATE KEY-----
  MIIEowIBAAKCAQEA...
```

### HashiCorp Vault Integration

```
Architecture:
+----------+   Authenticate   +----------+   Store/Retrieve   +--------+
| Ansible  |  ------------>   |  Vault   |  <-------------    | Consul |
| Playbook |  (AppRole/AWS)   |  Server  |  (encrypted KV)    | (HA)   |
+----------+                  +----------+                    +--------+
     |                             |
     | Get secret at runtime       | Audit log every access
     v                             v
No secrets ever in         Who accessed what
playbook or git            and when
```

```yaml
# Using HashiCorp Vault in Ansible
# requirements: pip install hvac

- name: Retrieve database credentials from Vault
  community.hashi_vault.vault_kv2_get:
    url: 'https://vault.internal.example.com:8200'
    path: 'prod/databases/mysql'
    auth_method: aws_iam # Use EC2 instance IAM role
  register: vault_data
  no_log: true # Don't log the secret values

- name: Configure application with database credentials
  template:
    src: app.conf.j2
    dest: /etc/app/app.conf
    mode: '0600'
  vars:
    db_password: '{{ vault_data.secret.password }}'
  no_log: true
```

### AWS Secrets Manager

```yaml
# Ansible lookup plugin for AWS Secrets Manager
- name: Get RDS password from Secrets Manager
  set_fact:
    db_password: "{{ lookup('amazon.aws.aws_secret',
                    'prod/rds/mysql-primary',
                    region='us-east-1') | from_json | json_query('password') }}"
  no_log: true

# In Puppet with hiera-eyaml or AWS SSM
# hiera-eyaml: asymmetric encryption for secrets in Hiera
# puppet/data/environments/production.yaml
profile::database::password: >
  ENC[PKCS7,MIIBeQYJKoZIhvc...]
```

### Sealed Secrets (Kubernetes)

```yaml
# SealedSecret: encrypted Secret safe to store in Git
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: db-credentials
  namespace: production
spec:
  encryptedData:
    password: AgA3m8W9Xk2... # Encrypted with cluster's public key
    username: AgBd7nR2Yp1... # Only decryptable by this cluster's controller
```

### Rotation Strategy

```
Secret Rotation Workflow:

1. Generate new secret in Vault
2. Write new secret to Vault path v2 (keeps old version)
3. Deploy new secret to config (rolling, no downtime)
4. Verify all hosts using new secret
5. Revoke old secret version in Vault
6. Alert on any remaining uses of old version
```

---

## 7. GitOps for Configuration

### Git as the Single Source of Truth

```
GitOps Configuration Flow:

  Engineer          Git Repo          CI/CD           Production
     |                  |               |                  |
     | 1. PR with       |               |                  |
     |    config change |               |                  |
     +----------------> |               |                  |
     |                  |               |                  |
     | 2. Code review   |               |                  |
     |    + automated   |               |                  |
     |    testing       |               |                  |
     | <--------------> |               |                  |
     |                  |               |                  |
     | 3. Merge to main |               |                  |
     +----------------> |               |                  |
                        | 4. Trigger    |                  |
                        +-------------> |                  |
                                        | 5. Run Ansible   |
                                        |    or trigger    |
                                        |    Puppet r10k   |
                                        +----------------> |
                                                           |
                                                  6. Config applied
                                                     Report back
```

### Repository Structure

```
infrastructure-config/
  inventories/
    production/
      hosts.ini
      group_vars/
        all/
          common.yml
          secrets.yml  (ansible-vault encrypted)
        webservers/
          nginx.yml
        dbservers/
          mysql.yml
    staging/
      ...
  roles/
    common/
    nginx/
    mysql/
    ...
  playbooks/
    site.yml              # Full convergence
    webservers.yml        # Web tier only
    rolling-update.yml    # Zero-downtime update
  .github/
    workflows/
      lint.yml            # ansible-lint on every PR
      dry-run.yml         # --check on PRs to staging
      deploy.yml          # Apply on merge to main
```

### PR-Based Config Changes

```yaml
# .github/workflows/ansible-pr.yml
name: Validate Config Change

on:
  pull_request:
    paths:
      - 'inventories/**'
      - 'roles/**'
      - 'playbooks/**'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install ansible-lint
        run: pip install ansible-lint

      - name: Lint playbooks
        run: ansible-lint playbooks/

  dry-run-staging:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - name: Ansible check mode on staging
        run: |
          ansible-playbook site.yml \
            -i inventories/staging/hosts.ini \
            --check --diff \
            --vault-password-file ${{ secrets.VAULT_PASS_FILE }}
```

### Puppet r10k — Git-Driven Environments

```ruby
# r10k maps git branches to Puppet environments
# Puppetfile (in control repo)
forge "https://forge.puppet.com"

mod 'puppetlabs-stdlib',   '9.4.1'
mod 'puppetlabs-apache',   '11.1.0'
mod 'puppetlabs-mysql',    '15.0.0'

# Internal modules from git
mod 'profile',
  git: 'https://github.com/example/puppet-profile',
  ref: 'main'
```

```bash
# When you push to a git branch, r10k creates a Puppet environment
# git branch 'feature/nginx-update' -> Puppet environment 'feature_nginx_update'
# git branch 'main' -> Puppet environment 'production'

r10k deploy environment production --puppetfile
# Downloads all modules from Puppetfile
# Makes them available to Puppet server immediately
```

---

## 8. Idempotency — Why It's Critical

### What Idempotency Means

```
Idempotent Operation:
  f(f(x)) = f(x)

  First run:  system in state A -> apply config -> system in state B
  Second run: system in state B -> apply config -> system in state B (no change)
  Nth run:    system in state B -> apply config -> system in state B (no change)

Non-Idempotent Example (WRONG):
  Task: "Add line to /etc/hosts"
  Run 1: 127.0.0.1 myapp  <- adds line
  Run 2: 127.0.0.1 myapp  <- adds ANOTHER line
  Run 3: 127.0.0.1 myapp  <- adds ANOTHER line
  Result: file has 3 duplicate entries
```

### How Each Tool Handles Idempotency

```
PUPPET (built-in, declarative):
  package { 'nginx': ensure => installed }
  # Puppet checks if nginx is installed, only installs if not present
  # Native resource types are ALWAYS idempotent

ANSIBLE (module-dependent):
  # GOOD: Using idempotent module
  - package:
      name: nginx
      state: present
  # Checks if installed, skips if already there

  # BAD: Using shell/command (not idempotent without care)
  - shell: echo "127.0.0.1 myapp" >> /etc/hosts
  # Will add duplicate lines every run

  # FIXED: Using creates or changed_when
  - shell: echo "127.0.0.1 myapp" >> /etc/hosts
    args:
      creates: /etc/.hosts-configured  # Skip if this file exists
  # Or use lineinfile module (idempotent):
  - lineinfile:
      path: /etc/hosts
      line: "127.0.0.1 myapp"
      state: present

CHEF:
  package 'nginx' do
    action :install  # only installs if not present
  end

  # template resource is idempotent - only writes if content differs
  template '/etc/nginx/nginx.conf' do
    source 'nginx.conf.erb'
    notifies :restart, 'service[nginx]'
  end
```

### Testing Idempotency

```bash
# Ansible: Run twice, second run should show 0 changes
ansible-playbook site.yml | grep -E "changed|failed"
# First run:  changed=47 failed=0
ansible-playbook site.yml | grep -E "changed|failed"
# Second run: changed=0  failed=0  <- IDEMPOTENT

# Molecule (Ansible testing framework)
# molecule/default/molecule.yml
platforms:
  - name: instance
    image: geerlingguy/docker-ubuntu2204-ansible

verifier:
  name: ansible

# molecule/default/verify.yml
- name: Verify idempotency
  hosts: all
  tasks:
    - name: Run role again (idempotency check)
      include_role:
        name: nginx
      register: result

    - name: Assert no changes
      assert:
        that: not result.changed
        fail_msg: "Role is not idempotent!"

# Run full test cycle
molecule test  # create -> converge -> idempotency -> verify -> destroy
```

---

## 9. Scaling Config Management to 10K Hosts

### The Core Scaling Challenge

```
Scale Reality:
  100 hosts:   SSH push to all, done in 5 minutes
  1,000 hosts: SSH push takes 30-60 minutes (forks limit)
  10,000 hosts: Push model breaks completely

  Solutions:
  1. Pull model (Puppet/Salt) — agents pull on schedule
  2. Increase parallelism (Ansible forks)
  3. Hierarchical execution (proxy nodes)
  4. Compilation caching
```

### Ansible at Scale

```ini
# ansible.cfg — tuning for large inventories
[defaults]
forks = 100                  # Parallel connections (default: 5!)
host_key_checking = False
gathering = smart            # Cache facts, don't regather each run
fact_caching = redis
fact_caching_connection = localhost:6379
fact_caching_timeout = 86400  # 24 hour cache

pipelining = True            # Reduces SSH operations (3x speedup)
ssh_args = -o ControlMaster=auto -o ControlPersist=60s  # SSH multiplexing

[ssh_connection]
retries = 3
timeout = 30
```

```yaml
# Execution with batching
- hosts: webservers
  strategy: free     # Don't wait for slowest host
  serial:
    - 1              # First: 1 canary host
    - "5%"           # Then: 5% (500 hosts)
    - "25%"          # Then: 25% (2500 hosts)
    - "100%"         # Then: rest

# For maximum speed: split by region and run in parallel
# Run all these simultaneously:
ansible-playbook site.yml -i inventories/us-east-1/ &
ansible-playbook site.yml -i inventories/us-west-2/ &
ansible-playbook site.yml -i inventories/eu-west-1/ &
wait
```

### Puppet at Scale

```
Puppet Scale Architecture for 10K Hosts:

  +--------------------+
  |   Load Balancer    |  <- ha-proxy or AWS ELB
  |  puppet.example.com|
  +----+---+---+-------+
       |   |   |
  +----+   +   +----+
  |        |        |
+--+--+ +--+--+ +--+--+
| PS1 | | PS2 | | PS3 |   <- Puppet Server compile nodes
+--+--+ +--+--+ +--+--+   3 nodes handle 10K agents
   |       |       |      (~3,300 agents per compiler)
   +-------+-------+
           |
     +-----+------+
     |  PuppetDB  |  <- PostgreSQL backend
     | (primary + |     Stores facts, reports, catalogs
     |  replica)  |
     +------------+

Sizing Guide:
  1 Puppet Server:    ~1,500-2,000 agents (4 CPU, 8GB RAM)
  10K agents total:   ~5-7 compile nodes + HA load balancer
  PuppetDB:           16 CPU, 32GB RAM, fast SSD
```

```puppet
# Puppet Server tuning (/etc/puppetlabs/puppetserver/conf.d/puppetserver.conf)
jruby-puppet: {
    max-active-instances: 8      # JRuby instances per server (= CPU cores)
    max-requests-per-instance: 100000
}

# Stagger agent runs to avoid thundering herd
# /etc/puppetlabs/puppet/puppet.conf (on agents)
[agent]
runinterval = 1800              # 30 minutes
splaylimit = 1800               # Random splay up to 30 minutes
splay = true                    # Enable splay
```

### SaltStack at Scale

```
SaltStack ZeroMQ Architecture (fastest at 10K+):

  +-------------+  PUB 4505   +-----------+
  | Salt Master |  ---------> | Minion 1  |
  |             |  ---------> | Minion 2  |  <- Receives
  |             |  ---------> | Minion N  |     published jobs
  |             |  <--------- | (results) |     instantly
  |             |  REP 4506   +-----------+     via ZeroMQ
  +-------------+                               pub/sub

  Execution time for 10K hosts:
  Salt:    5-30 seconds for simple commands
  Ansible: 30-60 minutes with forks=50
  Puppet:  30 minutes (next scheduled run)
```

```bash
# Salt: target subsets for canary rollouts
# Run on 1 host first
salt -G 'role:webserver' -N 1 state.apply nginx

# Run on 10% via batch
salt '*' state.apply nginx --batch-size 10%

# Run on specific grain (fact)
salt -G 'datacenter:us-east-1' state.apply

# Async: fire and forget, collect results later
salt '*' state.apply nginx --async
salt-run jobs.lookup_jid 20240115123456789
```

---

## 10. Real-World Patterns

### Role-Based Configuration

```
Host Classification Strategy:

  Facts/Tags on Host         ->    Role Assignment    ->    Config Applied
  --------------------------       ----------------        ---------------
  role=webserver                   profile::webserver      nginx, php-fpm
  environment=production           profile::prod           prod settings
  team=payments                    profile::pci_hardening  PCI-DSS config
  datacenter=us-east-1             profile::aws_east       region config

  Final config = intersection of all applicable profiles
```

```yaml
# Ansible: Role assignment via tags/facts
- name: Apply role-based configuration
  hosts: all
  tasks:
    - include_role:
        name: common
      # Always applied

    - include_role:
        name: '{{ host_role }}' # host_role from inventory/fact
      when: host_role is defined

    - include_role:
        name: security-hardening
      when: environment == 'production'

    - include_role:
        name: pci-hardening
      when: "'payments' in group_names"
```

### Environment Hierarchies

```
Environment Promotion Pipeline:

  dev -> staging -> canary (5% prod) -> production

  Config precedence (last wins):
  common/defaults
    <- environment overrides (dev/staging/prod)
      <- region overrides (us-east-1, eu-west-1)
        <- host-group overrides (webservers, dbservers)
          <- host-specific overrides (web-001.prod.example.com)

  Hiera example:
  data/
    common.yaml                       # Base: all hosts
    environments/development.yaml     # Dev overrides
    environments/staging.yaml         # Staging overrides
    environments/production.yaml      # Prod overrides
    regions/us-east-1.yaml            # Regional settings
    roles/webserver.yaml              # Role settings
    nodes/web-001.prod.example.com.yaml  # Host-specific
```

### Canary Configuration Rollouts

```
Canary Config Rollout Process:

  Step 1: Deploy to canary group (1-2% of fleet)
  +---------+   new config   +---+
  | Config  | -------------> | C | canary hosts
  | Change  |                +---+
  +---------+

  Step 2: Monitor for 30 minutes
  - Error rate baseline vs canary
  - Latency comparison
  - Application metrics

  Step 3: Automated gate check
  if error_rate_canary > error_rate_baseline * 1.1:
      ROLLBACK canary
      alert on-call
  else:
      PROCEED to next wave

  Step 4: Progressive rollout
  5% -> 25% -> 50% -> 100%   (with monitoring gates)
```

```yaml
# Ansible: Canary config rollout implementation
---
- name: Canary config deployment
  hosts: "{{ target_hosts | default('webservers') }}"
  serial:
    - '{{ canary_count | default(2) }}' # Start with 2 hosts
  vars:
    canary_wait_minutes: 30

  tasks:
    - name: Apply new configuration
      include_role:
        name: nginx

    - name: Wait for canary validation
      pause:
        minutes: '{{ canary_wait_minutes }}'
      run_once: true
      when: ansible_play_batch_size == (canary_count | default(2) | int)

    - name: Check canary metrics (Prometheus query)
      uri:
        url: 'http://prometheus:9090/api/v1/query'
        body_format: form-urlencoded
        body:
          query: "rate(http_requests_total{status=~'5..',job='nginx',host='{{ inventory_hostname }}'}[5m])"
      register: error_rate
      run_once: true
      delegate_to: localhost
      when: ansible_play_batch_size == (canary_count | default(2) | int)

    - name: Fail if canary error rate is elevated
      fail:
        msg: 'Canary error rate too high, aborting rollout'
      when:
        - ansible_play_batch_size == (canary_count | default(2) | int)
        - (error_rate.json.data.result[0].value[1] | float) > 0.05
```

### Immutable Infrastructure vs Config Management

```
Philosophy Comparison:

  MUTABLE (Config Management approach)
  +--------+  config change  +--------+
  | server | ------------->  | server |  same server, updated
  | v1     |                 | v2     |
  +--------+                 +--------+
  Pro: Fast updates, no downtime during rollout
  Con: Drift accumulates over time

  IMMUTABLE (Phoenix/Cattle approach)
  +--------+                 +--------+
  | server |  terminate      | server |  brand new server
  | v1     | ------------->  | v2     |  from new AMI/image
  +--------+                 +--------+
  Pro: No drift possible, rollback = redeploy old image
  Con: Slower, harder for stateful services

  HYBRID (Best practice for most orgs)
  - Config management for: OS settings, security, monitoring
  - Immutable for: application deployments
  - AMI/container baking: use Packer + Ansible to bake configs
    into base images, reducing runtime config surface
```

### Packer + Ansible: Baking Config into Images

```json
{
  "builders": [
    {
      "type": "amazon-ebs",
      "region": "us-east-1",
      "source_ami_filter": {
        "filters": {
          "name": "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"
        }
      },
      "instance_type": "t3.medium",
      "ami_name": "webapp-base-{{timestamp}}"
    }
  ],
  "provisioners": [
    {
      "type": "ansible",
      "playbook_file": "playbooks/base-image.yml",
      "extra_arguments": ["--vault-password-file", "~/.vault_pass"]
    },
    {
      "type": "shell",
      "inline": [
        "sudo /usr/bin/cloud-init clean --logs",
        "sudo rm -f /etc/ssh/ssh_host_*"
      ]
    }
  ]
}
```

---

## Quick Reference: Common Operations Commands

### Ansible

```bash
# Run playbook against all hosts
ansible-playbook -i inventories/prod/ site.yml

# Run against specific host pattern
ansible-playbook site.yml --limit "web-001*"

# Run only specific tags
ansible-playbook site.yml --tags "nginx,security"

# Skip specific tags
ansible-playbook site.yml --skip-tags "slow-task"

# Dry run
ansible-playbook site.yml --check --diff

# Run ad-hoc command
ansible webservers -m shell -a "systemctl status nginx" -i inventories/prod/

# Debug specific host variables
ansible -i inventories/prod/ web-001.prod.example.com -m debug -a "var=hostvars[inventory_hostname]"

# Encrypt new vault file
ansible-vault create group_vars/prod/secrets.yml

# View encrypted file
ansible-vault view group_vars/prod/secrets.yml
```

### Puppet

```bash
# Trigger immediate agent run
puppet agent -t --noop    # dry run
puppet agent -t           # apply

# Check agent status
puppet agent --configprint runinterval
puppet resource service puppet

# Query PuppetDB
puppet query 'nodes[certname] { latest_report_status = "failed" }'

# Sign certificate for new agent
puppetserver ca sign --certname new-host.example.com

# Validate manifest syntax
puppet parser validate manifests/site.pp

# Compile catalog for specific node (debug)
puppet catalog compile web-001.prod.example.com

# r10k: deploy specific environment
r10k deploy environment production -v

# View agent run report
puppet report print --last
```

### SaltStack

```bash
# Run state on all minions
salt '*' state.apply

# Target by grain
salt -G 'role:webserver' state.apply nginx

# Target by compound matcher
salt -C 'G@role:webserver and G@environment:production' state.apply

# Single command
salt '*' cmd.run 'uptime'

# Check connectivity
salt '*' test.ping

# Gather grains (facts)
salt 'web-001*' grains.items

# Run with batch size (canary)
salt '*' state.apply --batch-size 10%

# Refresh pillar data on minions
salt '*' saltutil.refresh_pillar
```

---

## Interview Questions to Expect

```
Q: "How would you push a config change to 10,000 hosts safely?"
A: Canary first (1%), monitor metrics, progressive rollout (5% -> 25% -> 100%).
   Use pull model (Puppet/Salt) with staggered run intervals.
   Git PR -> review -> merge -> automated rollout.
   Automated rollback gate: if error rate > baseline + 10%, halt.

Q: "How do you handle secrets in config management?"
A: Never in Git. HashiCorp Vault + Ansible Vault for at-rest encryption.
   Vault AppRole for machine auth. Secrets injected at runtime, not stored.
   Regular rotation. Audit log all access. no_log: true in Ansible tasks.

Q: "How do you detect and fix configuration drift?"
A: Puppet noop / Ansible --check on schedule. Dashboard showing compliance %.
   Auto-remediate non-critical drift. Alert + manual review for security-sensitive.
   OpenSCAP/Inspec for compliance benchmarks.

Q: "What does idempotency mean and why does it matter?"
A: Running config 100x = same result as running once.
   Matters because: scheduled runs, reruns after failures, CI/CD pipelines.
   Shell/command tasks are NOT idempotent by default.
   Use modules (package, file, service) which are idempotent.
   Test: run twice, second run should show 0 changes.

Q: "Push vs pull — when would you choose each?"
A: Push (Ansible): ad-hoc tasks, small fleets, immediate need.
   Pull (Puppet/Salt minions): large fleets, guaranteed convergence,
   survives network partitions (agents retry), no central bottleneck.
   At 10K hosts: pull is usually better for steady-state config.
   Hybrid: pull for base config, push for emergency changes.
```

---

_Part of the Cloud Operations Interview Prep Series_
_Previous: 01-INCIDENT-RESPONSE.md | Next: 03-OBSERVABILITY.md_
