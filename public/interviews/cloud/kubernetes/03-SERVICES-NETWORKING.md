# Kubernetes Services and Networking — Deep-Dive

Networking is where Kubernetes goes from "orchestrator" to "platform." The networking model is deceptively simple on the surface — every pod gets an IP, every service gets a virtual IP — but underneath lies a sophisticated stack of CNI plugins, iptables rules, DNS resolution, and proxy layers. Mastering this is essential for debugging production issues.

---

## Mental Model

Kubernetes networking solves **four distinct problems**:

```
1. Container-to-Container  │  Solved by: Pod network namespace (localhost)
                           │
2. Pod-to-Pod              │  Solved by: CNI plugin (flat network, no NAT)
                           │
3. Pod-to-Service          │  Solved by: kube-proxy (iptables/IPVS/eBPF)
                           │
4. External-to-Service     │  Solved by: NodePort / LoadBalancer / Ingress
```

**The fundamental rule:** Every Pod gets its own IP address. Pods can communicate with each other directly using these IPs, without NAT, regardless of which node they are on. This "flat network" model is enforced by the CNI plugin.

---

## 1. The Kubernetes Network Model

### 1.1 Requirements (every CNI must satisfy these)

1. Every pod gets a unique IP address
2. Pods on the same node can communicate without NAT
3. Pods on different nodes can communicate without NAT
4. Agents on a node (kubelet, kube-proxy) can communicate with all pods on that node

### 1.2 How It Works Under the Hood

```
Node 1 (10.0.1.5)                    Node 2 (10.0.2.8)
┌──────────────────────┐              ┌──────────────────────┐
│                      │              │                      │
│  Pod A (10.244.1.2)  │              │  Pod C (10.244.2.5)  │
│    │ veth pair        │              │    │ veth pair        │
│    └──┬──────────────│              │    └──┬──────────────│
│       │              │              │       │              │
│  cbr0 / cni0 bridge  │              │  cbr0 / cni0 bridge  │
│  (10.244.1.0/24)     │              │  (10.244.2.0/24)     │
│       │              │              │       │              │
│  Pod B (10.244.1.3)  │              │  Pod D (10.244.2.6)  │
│    │ veth pair        │              │    │ veth pair        │
│    └──┘              │              │    └──┘              │
│                      │              │                      │
│  eth0               │              │  eth0               │
└──────────┬───────────┘              └──────────┬───────────┘
           │                                      │
           └──────── Overlay or BGP ──────────────┘
           (VXLAN, IPIP, native routing)
```

Each node gets a **pod CIDR** (e.g., 10.244.1.0/24). The CNI plugin:
1. Creates a virtual ethernet (veth) pair for each pod
2. One end goes in the pod's network namespace, the other in the host
3. Connects the host end to a bridge or directly routes it
4. Sets up routes between nodes (overlay tunnel or BGP)

---

## 2. CNI Plugins

CNI (Container Network Interface) is a standard that defines how container runtimes set up networking. The kubelet calls the CNI plugin when a pod is created or deleted.

### 2.1 Plugin Comparison

| Feature | Calico | Cilium | Flannel | WeaveNet |
|---------|--------|--------|---------|----------|
| **Data plane** | iptables or eBPF | eBPF | VXLAN overlay | VXLAN overlay |
| **Routing** | BGP (native) or IPIP/VXLAN tunnel | Direct routing or VXLAN | VXLAN only | Encrypted VXLAN |
| **Network Policy** | Yes (full) | Yes (full + extended) | No | Yes (partial) |
| **Encryption** | WireGuard | WireGuard or IPsec | No | IPsec (sleeve) |
| **kube-proxy replacement** | Partial (eBPF mode) | Yes (full eBPF) | No | No |
| **Observability** | Flow logs | Hubble (deep L3-L7) | Minimal | Minimal |
| **Performance** | High (BGP) | Highest (eBPF) | Moderate | Moderate |
| **Complexity** | Medium | Medium-High | Low | Low |
| **Best for** | Production, multi-cloud | Production, security-focused | Dev/test, simple clusters | Small clusters |

### 2.2 Calico Deep-Dive

Calico uses **BGP (Border Gateway Protocol)** to distribute routes for pod IPs across nodes. Each node runs a BGP agent (BIRD) that advertises its pod CIDR to peers.

```
Node 1                           Node 2
┌─────────────────┐             ┌─────────────────┐
│ Pod CIDR:        │    BGP     │ Pod CIDR:        │
│ 10.244.1.0/24   │<──peering──>│ 10.244.2.0/24   │
│                  │             │                  │
│ Route table:     │             │ Route table:     │
│ 10.244.2.0/24    │             │ 10.244.1.0/24    │
│   via 10.0.2.8  │             │   via 10.0.1.5  │
└─────────────────┘             └─────────────────┘
```

**IPIP mode:** When nodes are not on the same L2 network (different subnets, cloud VPCs), Calico encapsulates pod traffic in IP-in-IP tunnels. This adds a small overhead but works across L3 boundaries.

**VXLAN mode:** Alternative to IPIP for environments that block IP protocol 4 (some cloud providers).

### 2.3 Cilium Deep-Dive

Cilium uses **eBPF** (extended Berkeley Packet Filter) programs attached directly to the Linux kernel. This bypasses iptables entirely, providing better performance and observability.

```
Traditional (iptables):
  Packet → netfilter → iptables rules (O(n)) → routing → delivery

Cilium (eBPF):
  Packet → eBPF program (O(1)) → direct delivery
  (no iptables, no conntrack overhead for service routing)
```

**Hubble:** Cilium's observability layer that provides deep visibility into network flows (L3/L4/L7), DNS queries, HTTP requests, and Kafka messages — all without sidecar proxies.

```bash
# Cilium observability with Hubble
hubble observe --namespace production --protocol http
# Shows: source pod → destination pod, HTTP method, path, status code, latency
```

### 2.4 Flannel Deep-Dive

Flannel is the simplest CNI. It creates a **VXLAN overlay** network:

```
Pod A (10.244.1.2) sends packet to Pod B (10.244.2.3)
      │
      v
flannel.1 (VXLAN interface) on Node 1:
  - Encapsulates original packet in UDP (port 8472)
  - Outer source: Node 1 IP
  - Outer destination: Node 2 IP
      │
      v
Physical network carries UDP packet to Node 2
      │
      v
flannel.1 on Node 2:
  - Decapsulates, delivers original packet to Pod B
```

Flannel does NOT support Network Policies. If you need them, pair Flannel with Calico (canal) or switch to Calico/Cilium.

---

## 3. Service Types

A Service provides a **stable network endpoint** for a set of pods. Pods are ephemeral (they come and go), but Services persist.

### 3.1 ClusterIP (default)

Creates a virtual IP (VIP) accessible only within the cluster.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: ClusterIP
  selector:
    app: web           # Matches pods with label app=web
  ports:
  - port: 80           # Service port (what clients connect to)
    targetPort: 8080   # Pod port (where traffic is forwarded)
    protocol: TCP
```

**How it works internally:**

```
Client pod (10.244.1.5) → web service (10.96.45.12:80)
      │
      v
kube-proxy iptables/IPVS rule:
  DNAT 10.96.45.12:80 → one of:
    - 10.244.1.10:8080 (pod 1)
    - 10.244.2.15:8080 (pod 2)
    - 10.244.3.20:8080 (pod 3)
```

The ClusterIP is virtual — it does not correspond to any network interface. It exists only as iptables/IPVS rules on every node.

### 3.2 NodePort

Extends ClusterIP by exposing the service on a static port (30000-32767) on every node.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-nodeport
spec:
  type: NodePort
  selector:
    app: web
  ports:
  - port: 80
    targetPort: 8080
    nodePort: 30080    # Optional: auto-assigned if omitted
```

**Traffic flow:**

```
External client → NodeIP:30080 → kube-proxy → Pod:8080
                  (any node, even nodes without the pod)
```

**Drawback:** External clients need to know node IPs. Not suitable for production without an external load balancer.

### 3.3 LoadBalancer

Extends NodePort by provisioning a cloud load balancer (AWS NLB/ALB, GCP LB, Azure LB).

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-lb
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    service.beta.kubernetes.io/aws-load-balancer-scheme: "internet-facing"
spec:
  type: LoadBalancer
  selector:
    app: web
  ports:
  - port: 80
    targetPort: 8080
```

**Traffic flow:**

```
Internet → Cloud LB (public IP) → NodePort → kube-proxy → Pod
```

**externalTrafficPolicy:**

| Policy | Behavior | Pros | Cons |
|--------|----------|------|------|
| `Cluster` (default) | Traffic may be forwarded to pods on any node | Even distribution | Extra hop, source IP lost |
| `Local` | Traffic only sent to pods on the receiving node | Preserves source IP, no extra hop | Uneven distribution if pods are not spread evenly |

### 3.4 ExternalName

Creates a CNAME record, redirecting to an external DNS name. No proxying, no ClusterIP.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: external-db
spec:
  type: ExternalName
  externalName: mydb.example.com
```

`external-db.default.svc.cluster.local` resolves to `mydb.example.com`. Useful for referencing external services with a Kubernetes-native name.

### 3.5 Headless Service (ClusterIP: None)

A headless service has **no ClusterIP**. DNS returns the individual pod IPs instead.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres-headless
spec:
  clusterIP: None        # Headless
  selector:
    app: postgres
  ports:
  - port: 5432
```

```bash
# DNS lookup for a headless service returns pod IPs
nslookup postgres-headless.default.svc.cluster.local
# Returns:
# 10.244.1.10
# 10.244.2.15
# 10.244.3.20

# With a StatefulSet, individual pods are addressable:
# postgres-0.postgres-headless.default.svc.cluster.local → 10.244.1.10
# postgres-1.postgres-headless.default.svc.cluster.local → 10.244.2.15
```

**Used for:** StatefulSets (database replicas need to discover each other), client-side load balancing, service mesh endpoints.

---

## 4. kube-proxy Modes

### 4.1 iptables Mode (Default)

```bash
# Example iptables rules for a service with 3 endpoints
# (simplified, actual rules are more complex)

-A KUBE-SERVICES -d 10.96.45.12/32 -p tcp --dport 80 -j KUBE-SVC-XXX
-A KUBE-SVC-XXX -m statistic --mode random --probability 0.33 -j KUBE-SEP-AAA
-A KUBE-SVC-XXX -m statistic --mode random --probability 0.50 -j KUBE-SEP-BBB
-A KUBE-SVC-XXX -j KUBE-SEP-CCC
-A KUBE-SEP-AAA -p tcp -j DNAT --to-destination 10.244.1.10:8080
-A KUBE-SEP-BBB -p tcp -j DNAT --to-destination 10.244.2.15:8080
-A KUBE-SEP-CCC -p tcp -j DNAT --to-destination 10.244.3.20:8080
```

**Performance characteristics:**
- Rule evaluation is O(n) where n = number of services
- For 10,000 services: iptables has ~50,000 rules, adding latency
- Backend selection is random (no round-robin, no least-connections)
- Session affinity available via `sessionAffinity: ClientIP`

### 4.2 IPVS Mode

IPVS (IP Virtual Server) is a Linux kernel load balancer that operates at L4.

```bash
# Enable IPVS mode
# In kube-proxy configmap:
# mode: "ipvs"

# View IPVS rules
ipvsadm -Ln
# TCP  10.96.45.12:80 rr
#   -> 10.244.1.10:8080    Masq    1      0          0
#   -> 10.244.2.15:8080    Masq    1      0          0
#   -> 10.244.3.20:8080    Masq    1      0          0
```

**Advantages over iptables:**
- O(1) lookup using hash tables (scales to 10,000+ services)
- Multiple load balancing algorithms: `rr` (round-robin), `lc` (least connection), `dh` (destination hash), `sh` (source hash), `sed` (shortest expected delay)
- Better performance for large clusters

### 4.3 eBPF Mode (Cilium kube-proxy replacement)

Cilium can completely replace kube-proxy:

```bash
# Install Cilium without kube-proxy
helm install cilium cilium/cilium \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost=${API_SERVER_IP} \
  --set k8sServicePort=${API_SERVER_PORT}
```

**Advantages:**
- No iptables rules at all (less kernel overhead)
- O(1) lookups via eBPF hash maps
- Preserves source IP by default
- Socket-level load balancing (bypasses entire netfilter stack for local traffic)
- Maglev consistent hashing for better connection distribution

---

## 5. DNS in Kubernetes

### 5.1 CoreDNS

CoreDNS runs as a Deployment in `kube-system` and is the cluster DNS server. Every pod is configured to use it.

```bash
# CoreDNS pods
kubectl -n kube-system get pods -l k8s-app=kube-dns

# CoreDNS configuration
kubectl -n kube-system get cm coredns -o yaml
```

### 5.2 DNS Record Formats

| Resource | DNS Record | Example |
|----------|-----------|---------|
| Service (ClusterIP) | `<svc>.<ns>.svc.cluster.local` | `web.default.svc.cluster.local` |
| Service (Headless) | Returns pod IPs directly | `postgres-headless.default.svc.cluster.local` |
| StatefulSet Pod | `<pod>.<svc>.<ns>.svc.cluster.local` | `postgres-0.postgres-headless.default.svc.cluster.local` |
| Pod (if enabled) | `<pod-ip-dashed>.<ns>.pod.cluster.local` | `10-244-1-5.default.pod.cluster.local` |
| SRV record | `_<port>._<proto>.<svc>.<ns>.svc.cluster.local` | `_http._tcp.web.default.svc.cluster.local` |

### 5.3 Pod DNS Policy

```yaml
spec:
  dnsPolicy: ClusterFirst      # Default: use CoreDNS, fall back to node DNS
  # Other options:
  # Default:       Use node's DNS (bypass CoreDNS)
  # ClusterFirstWithHostNet: Use CoreDNS even with hostNetwork: true
  # None:          Custom DNS via dnsConfig

  dnsConfig:                    # Custom DNS settings (used with dnsPolicy: None)
    nameservers:
    - 8.8.8.8
    searches:
    - my.dns.search.suffix
    options:
    - name: ndots
      value: "5"
```

### 5.4 ndots and DNS Resolution Performance

The `ndots` setting (default: 5) controls when a DNS query is treated as absolute vs relative. A name with fewer than `ndots` dots is searched in all search domains first.

```
Pod resolves "api.example.com" (2 dots, less than ndots=5):
  1. api.example.com.default.svc.cluster.local    → NXDOMAIN
  2. api.example.com.svc.cluster.local             → NXDOMAIN
  3. api.example.com.cluster.local                 → NXDOMAIN
  4. api.example.com.ec2.internal                  → NXDOMAIN
  5. api.example.com.                              → RESOLVED!

  Total: 5 DNS queries for one resolution!
```

**Optimization:** For external domain calls, append a trailing dot (`api.example.com.`) to skip search domain expansion, or reduce `ndots` to 2 (at the cost of requiring FQDN for cluster-internal lookups).

---

## 6. Ingress

### 6.1 Ingress Resource

An Ingress defines rules for routing external HTTP/HTTPS traffic to internal services.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx        # Which Ingress controller handles this
  tls:
  - hosts:
    - app.example.com
    secretName: tls-secret       # TLS certificate (kubernetes.io/tls secret)
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 80
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend-service
            port:
              number: 80
```

### 6.2 Ingress Controller Comparison

| Controller | Proxy | Key Features | Best For |
|-----------|-------|-------------|----------|
| **NGINX Ingress** | NGINX | Most popular, rich annotations, TCP/UDP | General purpose |
| **Traefik** | Traefik | Auto-discovery, Let's Encrypt, middleware | Simple setups, auto-TLS |
| **AWS ALB Controller** | AWS ALB | Native AWS integration, WAF, Cognito | AWS environments |
| **Istio Gateway** | Envoy | Service mesh integration, mTLS, traffic splitting | Service mesh users |
| **Contour** | Envoy | HTTPProxy CRD (more expressive than Ingress) | Envoy-based routing |
| **HAProxy Ingress** | HAProxy | High performance, TCP passthrough | Performance-critical |

### 6.3 Traffic Flow Through Ingress

```
User browser
      │
      v
DNS → app.example.com → Cloud LB public IP
      │
      v
Cloud Load Balancer (L4)
      │
      v
NodePort on Ingress controller service
      │
      v
Ingress controller pod (NGINX/Envoy)
  - TLS termination
  - Host matching: app.example.com
  - Path matching: /api → api-service, / → frontend-service
      │
      v
ClusterIP service → Pod
```

---

## 7. Gateway API

The Gateway API is the **successor to Ingress**, designed to be more expressive, extensible, and role-oriented.

### 7.1 Resource Model

```
Infrastructure Provider          Cluster Operator          App Developer
        │                              │                        │
        v                              v                        v
  GatewayClass ──────────────> Gateway ──────────────> HTTPRoute
  (what type of LB)           (listener config)        (routing rules)
```

```yaml
# GatewayClass (managed by infrastructure provider)
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: nginx
spec:
  controllerName: nginx.org/gateway-controller

---
# Gateway (managed by cluster operator)
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: production
spec:
  gatewayClassName: nginx
  listeners:
  - name: https
    port: 443
    protocol: HTTPS
    tls:
      certificateRefs:
      - name: tls-secret

---
# HTTPRoute (managed by application developer)
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-route
spec:
  parentRefs:
  - name: production
  hostnames:
  - "api.example.com"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /v1
    backendRefs:
    - name: api-v1
      port: 80
      weight: 90
    - name: api-v2
      port: 80
      weight: 10          # Canary: 10% to v2
```

**Advantages over Ingress:**
- Role-based: infrastructure, cluster, and app concerns are separated
- Native traffic splitting (weights for canary/blue-green)
- Protocol-specific routes: HTTPRoute, GRPCRoute, TLSRoute, TCPRoute, UDPRoute
- More expressive matching (headers, query params, method)
- No more annotation hacks for advanced routing

---

## 8. Network Policies

Network Policies are Kubernetes-native firewall rules that control traffic flow at the pod level.

**Critical prerequisite:** Your CNI must support Network Policies. Flannel does NOT. Calico and Cilium do.

### 8.1 Default Behavior

By default, Kubernetes allows ALL traffic between all pods in all namespaces. Network Policies are additive — they whitelist traffic. If a pod is selected by any NetworkPolicy, all non-whitelisted traffic to/from that pod is denied.

### 8.2 Default Deny Patterns

```yaml
# Deny all ingress to all pods in namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: production
spec:
  podSelector: {}           # Selects ALL pods
  policyTypes:
  - Ingress                 # No ingress rules = deny all ingress

---
# Deny all egress from all pods in namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-egress
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Egress                  # No egress rules = deny all egress
```

### 8.3 Practical Network Policy Example

```yaml
# Allow web pods to receive traffic only from the API gateway
# Allow web pods to send traffic only to the database
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: web
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: api-gateway
    ports:
    - protocol: TCP
      port: 8080
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  - to:                       # Allow DNS (critical — often forgotten!)
    - namespaceSelector: {}
      podSelector:
        matchLabels:
          k8s-app: kube-dns
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
```

### 8.4 Namespace Isolation

```yaml
# Only allow traffic from pods in the same namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: namespace-isolation
  namespace: team-a
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: team-a
```

---

## 9. Service Mesh Concepts

A service mesh provides infrastructure-level networking features without changing application code.

### 9.1 What a Service Mesh Adds

```
Without mesh:
  Pod A ────HTTP────> Pod B

With mesh (sidecar):
  Pod A → Envoy proxy ──mTLS──> Envoy proxy → Pod B
           │                      │
           └── metrics, traces, retries, circuit breaking
```

### 9.2 Key Capabilities

| Feature | Description |
|---------|-------------|
| **mTLS** | Automatic mutual TLS between all services (zero-trust) |
| **Traffic management** | Retries, timeouts, circuit breaking, rate limiting |
| **Traffic splitting** | Canary releases, A/B testing, header-based routing |
| **Observability** | Request metrics (latency, error rate, throughput), distributed tracing |
| **Access control** | L7 authorization policies (which service can call which endpoint) |

### 9.3 Istio vs Linkerd

| Aspect | Istio | Linkerd |
|--------|-------|---------|
| Proxy | Envoy (feature-rich, heavier) | linkerd2-proxy (Rust, ultralight) |
| Resource overhead | Higher (~50-100MB per sidecar) | Lower (~10-20MB per sidecar) |
| Complexity | Higher (more features, more config) | Lower (simpler, opinionated) |
| L7 protocols | HTTP, gRPC, TCP, MongoDB, Redis, etc. | HTTP, gRPC, TCP |
| Multi-cluster | Yes (complex) | Yes (simpler) |
| Best for | Complex traffic management, multi-protocol | Simplicity, performance-sensitive |

---

## 10. Common Gotchas

### 10.1 NetworkPolicy Does Not Block Same-Pod Traffic

Network Policies operate on pod-to-pod traffic. Traffic between containers within the same pod (localhost) is never affected by Network Policies.

### 10.2 Forgetting DNS Egress in Default-Deny

If you set a default-deny egress policy but forget to allow DNS (port 53 to CoreDNS), ALL DNS resolution breaks. Every service discovery call fails silently. This is the most common NetworkPolicy mistake.

### 10.3 ExternalTrafficPolicy: Local Breaks Even Distribution

With `externalTrafficPolicy: Local`, traffic only goes to pods on the receiving node. If one node has 3 pods and another has 1 pod, the single pod gets the same traffic volume as the group of 3. Use topology-aware hints or pod topology spread constraints.

### 10.4 Service Selector Mismatch

If your Service selector does not match any pod labels, the Service has zero endpoints. Traffic goes to the service IP but gets dropped. Always verify with `kubectl get endpoints <svc>`.

### 10.5 NodePort Range Is Limited

NodePort range is 30000-32767 by default. You cannot use standard ports (80, 443) without changing the API server configuration. Use LoadBalancer or Ingress for standard ports.

### 10.6 DNS Resolution Is Case-Sensitive

Kubernetes DNS names are lowercase. `MY-SERVICE.default.svc.cluster.local` will not resolve. Always use lowercase.

### 10.7 Headless Services Do Not Load Balance

DNS for headless services returns ALL pod IPs. The client is responsible for load balancing. If the client picks one IP and caches it (as many HTTP clients do), all traffic goes to one pod.

### 10.8 Ingress Does Not Handle TCP/UDP

Standard Ingress only handles HTTP/HTTPS. For TCP/UDP load balancing, use a LoadBalancer Service, or the Gateway API's TCPRoute/UDPRoute.

### 10.9 ClusterIP Is Not Pingable

ClusterIP is virtual — it has no real network interface. You cannot ping it (ICMP). But you CAN connect to it via TCP/UDP on the service port. This confuses many people during debugging.

### 10.10 ndots: 5 Causes DNS Amplification

The default ndots:5 setting means any external domain with fewer than 5 dots triggers 4-5 extra DNS queries. For applications making many external API calls, this can overwhelm CoreDNS. Set ndots:2 or use FQDN with trailing dots.

---

## 11. Interview Questions

### Q1: "Explain how traffic flows from a user's browser to a pod inside the cluster."

**Deep answer:** The user types `app.example.com`. DNS resolves to the cloud load balancer's public IP (the LoadBalancer Service or Ingress controller's external IP). The load balancer forwards to a NodePort on one of the cluster nodes. If using an Ingress controller: the node receives traffic on the Ingress controller's NodePort, the Ingress controller pod (NGINX/Envoy) receives it, performs TLS termination, matches the host and path against Ingress rules, and proxies to the backend Service's ClusterIP. kube-proxy's iptables/IPVS rules on the node DNAT the ClusterIP to one of the pod IPs. The CNI plugin routes the packet to the correct node (if the pod is on a different node, via overlay tunnel or BGP route). The packet arrives at the pod's network namespace via the veth pair. The application container receives the request. The response follows the reverse path. Key nuance: with `externalTrafficPolicy: Cluster`, the traffic may traverse an extra node hop. With `Local`, it stays on the receiving node but distribution may be uneven.

### Q2: "Compare iptables and IPVS kube-proxy modes. When would you switch to IPVS?"

**Deep answer:** iptables mode creates one chain per service and one rule per endpoint. For N services with M average endpoints, you get approximately N + N*M rules. Rule evaluation is linear — the kernel walks the chain from top to bottom. At ~5,000 services, you may notice increased latency for connection establishment. Backend selection is random (via the `--probability` flag on iptables rules), giving approximately uniform distribution but not true round-robin. IPVS uses kernel-space hash tables for O(1) lookups regardless of service count. It supports real load balancing algorithms: round-robin, least connections, source hashing. Switch to IPVS when you have more than 1,000 services, need algorithmic backend selection, or observe connection setup latency from iptables rule walking. The third option is eBPF via Cilium, which removes kube-proxy entirely, provides O(1) lookups, preserves source IP, and enables socket-level load balancing that bypasses the netfilter stack for local traffic.

### Q3: "What is a headless service and when would you use one?"

**Deep answer:** A headless service has `clusterIP: None`. Instead of getting a virtual IP with load balancing, DNS queries return the individual pod IPs directly. There are two main use cases. First, StatefulSets: each pod needs a stable, individually addressable DNS name (postgres-0.svc, postgres-1.svc) so that database replicas can discover each other for replication. The headless service provides these DNS records. Second, client-side load balancing: when you want the client to implement its own load balancing logic (e.g., gRPC, which uses persistent connections and benefits from client-side round-robin rather than random connection-level LB). The trade-off is that you lose kube-proxy's load balancing — if a client resolves the DNS once and caches the result, it will always hit the same pod until the DNS TTL expires. This is a common source of uneven traffic distribution.

### Q4: "Design the network security for a three-tier application (frontend, API, database) in Kubernetes."

**Deep answer:** Start with default-deny policies in the namespace for both ingress and egress. Then whitelist specific flows: (1) Frontend pods: allow ingress from the Ingress controller namespace only, allow egress to API pods on port 8080 and to CoreDNS on port 53. (2) API pods: allow ingress from frontend pods only on port 8080, allow egress to database pods on port 5432, to external APIs via CIDR blocks, and to CoreDNS. (3) Database pods: allow ingress from API pods only on port 5432, deny all egress except DNS (for external replication, add specific CIDR rules). Additionally: use separate namespaces for each tier with namespace-level isolation. Use Network Policies with both podSelector and namespaceSelector for cross-namespace rules. Do NOT rely on Network Policies alone — also use RBAC to prevent unauthorized users from modifying or deleting policies, and use a policy engine (OPA Gatekeeper/Kyverno) to enforce that every namespace has default-deny policies.

### Q5: "Explain the Gateway API and why it is replacing Ingress."

**Deep answer:** Ingress has fundamental limitations: (1) all configuration through annotations is untyped, vendor-specific, and not validated; (2) no role separation — the same Ingress resource mixes infrastructure, cluster, and application concerns; (3) limited to HTTP/HTTPS only; (4) no native traffic splitting for canary deployments. The Gateway API solves these with a three-layer model: GatewayClass (infrastructure provider defines the LB type), Gateway (cluster operator configures listeners, TLS, and allowed routes), and HTTPRoute/GRPCRoute/TCPRoute (application developers define routing rules). Traffic splitting is native — you specify weights on backend references for canary/blue-green. Route matching supports headers, query parameters, and method — no more annotation hacks. The role separation means the app developer cannot modify the TLS certificate or the Gateway configuration, only their own routes. This maps to real organizational boundaries.

### Q6: "How would you troubleshoot a Service that is not reachable from within the cluster?"

**Deep answer:** Systematic approach: (1) Check endpoints: `kubectl get endpoints <svc>` — if empty, the selector does not match any ready pods. Verify labels match. (2) Check pod readiness: `kubectl get pods -l app=<label>` — if pods are not Ready, the readiness probe is failing and they are not added to endpoints. (3) Check DNS: `kubectl exec -it debug-pod -- nslookup <svc>` — if DNS fails, CoreDNS is down or the service does not exist. (4) Test connectivity directly to pod IP: `kubectl exec -it debug-pod -- curl <pod-ip>:<port>` — if direct pod IP works but service does not, the issue is in kube-proxy/iptables rules. (5) Check for Network Policies: `kubectl get netpol -n <ns>` — a default-deny policy may be blocking. (6) Check kube-proxy: is it running? In the correct mode? `kubectl -n kube-system logs <kube-proxy-pod>`. (7) Check iptables rules on the node: `iptables -t nat -L KUBE-SERVICES -n | grep <service-ip>`. (8) If using IPVS, check `ipvsadm -Ln`. Common root causes in order of frequency: label mismatch, readiness probe failure, NetworkPolicy blocking, kube-proxy not running.

---

## 12. Quick Reference

| Service Type | ClusterIP | External Access | Use Case |
|-------------|-----------|-----------------|----------|
| **ClusterIP** | Yes (virtual) | No | Internal services |
| **NodePort** | Yes + NodePort | Via node IP:port | Dev/test, non-cloud |
| **LoadBalancer** | Yes + NodePort + LB | Via cloud LB public IP | Production external |
| **ExternalName** | No (CNAME) | N/A | External service alias |
| **Headless** | None | No | StatefulSets, client-side LB |

| CNI | Data Plane | Network Policy | kube-proxy Replacement | Best For |
|-----|-----------|---------------|----------------------|----------|
| **Calico** | iptables/eBPF/BGP | Yes | Partial | Production, multi-cloud |
| **Cilium** | eBPF | Yes (extended) | Yes (full) | Security, observability |
| **Flannel** | VXLAN | No | No | Simple clusters, dev |
| **WeaveNet** | VXLAN | Partial | No | Small clusters |
