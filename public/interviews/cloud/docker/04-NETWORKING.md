# Docker Networking: Deep-Dive

Container networking is the most common source of production issues and the topic that best reveals whether a candidate has actually operated containers. At its core, Docker networking is just Linux networking -- veth pairs, bridges, iptables, and network namespaces -- automated by the Docker daemon. Understanding these primitives lets you debug any networking issue from first principles.

---

## 1. Mental Model

```
Container A          Container B          Host
+----------+         +----------+         +------------------+
| eth0     |         | eth0     |         | eth0 (physical)  |
| 172.17.  |         | 172.17.  |         | 192.168.1.100    |
| 0.2      |         | 0.3      |         |                  |
+----+-----+         +----+-----+         |  docker0 bridge  |
     |                     |               |  172.17.0.1      |
     | veth pair           | veth pair     |                  |
     |                     |               |  vethAAA vethBBB |
     +---------------------+---------------+--+-----+---------+
                                              |     |
                                      iptables NAT rules
                                              |
                                          Internet
```

Every container gets its own network namespace (isolated network stack). Docker creates a **veth pair** -- a virtual ethernet cable -- with one end inside the container (`eth0`) and the other end on the host, plugged into a bridge (`docker0`). Traffic between containers goes through the bridge. Traffic to the outside goes through iptables NAT.

---

## 2. Network Drivers

### 2.1 Bridge (Default)

```bash
# Default bridge network (docker0)
$ docker run -d --name web nginx
# Container gets IP from 172.17.0.0/16

# User-defined bridge network (recommended)
$ docker network create mynet
$ docker run -d --name web --network mynet nginx
$ docker run -d --name api --network mynet python-api
# web and api can reach each other by container name
```

| Aspect | Default Bridge | User-Defined Bridge |
|--------|---------------|-------------------|
| DNS resolution | No (IP only or --link, deprecated) | Yes (by container name) |
| Isolation | All containers on same bridge | Only containers on same network |
| Connect/disconnect live | No | Yes (`docker network connect`) |
| Automatic DNS | No | Yes |

**Rule: always use user-defined bridge networks. Never rely on the default bridge.**

### 2.2 Host

```bash
$ docker run -d --network host nginx
# Container shares host's network namespace
# No network isolation, no port mapping needed
# Container binds directly to host ports
```

| Aspect | Detail |
|--------|--------|
| Performance | No NAT overhead, no bridge, bare-metal speed |
| Port conflicts | Container ports conflict with host ports |
| Use case | Performance-critical apps, apps that need to see all host interfaces |
| Isolation | None (shared network stack) |
| macOS/Windows | Does not work as expected (Docker runs in a VM) |

### 2.3 None

```bash
$ docker run -d --network none alpine
# Container has only loopback interface (lo)
# No external connectivity at all
```

Use case: batch processing that needs no network, security-sensitive workloads where network is set up manually.

### 2.4 Overlay

```bash
# Requires Docker Swarm or manual setup
$ docker network create --driver overlay --attachable my-overlay
# Connects containers across multiple Docker hosts
# Uses VXLAN encapsulation
```

### 2.5 Macvlan

```bash
$ docker network create -d macvlan \
    --subnet=192.168.1.0/24 \
    --gateway=192.168.1.1 \
    -o parent=eth0 \
    my-macvlan

$ docker run -d --network my-macvlan --ip=192.168.1.50 nginx
# Container appears as a real device on the physical network
# Gets its own MAC address, directly on the LAN
```

| Aspect | Detail |
|--------|--------|
| Use case | Legacy apps that need to be on the LAN, DHCP integration |
| Requirement | NIC must support promiscuous mode |
| Gotcha | Container cannot communicate with host (by design) |
| Workaround | Create a macvlan sub-interface on host for host-container traffic |

### 2.6 IPvlan

```bash
$ docker network create -d ipvlan \
    --subnet=192.168.1.0/24 \
    --gateway=192.168.1.1 \
    -o parent=eth0 \
    -o ipvlan_mode=l2 \
    my-ipvlan
```

Like macvlan but shares the parent's MAC address. Two modes:
- **L2 mode**: Containers on same subnet, switching at Layer 2
- **L3 mode**: Routing between containers, no broadcast

Use IPvlan when the switch limits MAC addresses per port or when macvlan causes problems.

---

## 3. Bridge Network Internals

### 3.1 Veth Pairs

A veth pair is a virtual ethernet cable with two endpoints. Whatever goes in one end comes out the other.

```bash
# Find the veth pair for a container
$ docker inspect --format '{{.State.Pid}}' web
12345

# On the host, find the veth interface
$ ip link show type veth
45: vethABC@if44: <BROADCAST,MULTICAST,UP> master docker0
47: vethDEF@if46: <BROADCAST,MULTICAST,UP> master docker0

# The @ifN suffix tells you the interface index inside the container namespace
# if44 means interface index 44 in the container's namespace

# Inside the container namespace:
$ nsenter -t 12345 -n ip link show
1: lo: <LOOPBACK,UP>
44: eth0@if45: <BROADCAST,MULTICAST,UP>
# eth0 index 44, paired with host veth index 45
```

### 3.2 The docker0 Bridge

```bash
# Inspect the docker0 bridge
$ ip addr show docker0
3: docker0: <BROADCAST,MULTICAST,UP>
    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0

# Show bridge ports (connected veth interfaces)
$ bridge link show dev docker0
45: vethABC state UP @docker0: <BROADCAST,MULTICAST,UP>
47: vethDEF state UP @docker0: <BROADCAST,MULTICAST,UP>

# Traffic flow between two containers on the same bridge:
# Container A (eth0) -> vethAAA -> docker0 bridge -> vethBBB -> Container B (eth0)
```

### 3.3 iptables NAT Rules

Docker uses iptables for port mapping and outbound NAT:

```bash
# View Docker's NAT rules
$ sudo iptables -t nat -L -n -v

# MASQUERADE: outbound container traffic gets host's IP
Chain POSTROUTING (policy ACCEPT)
target     source       destination
MASQUERADE  172.17.0.0/16  0.0.0.0/0

# DNAT: port mapping (docker run -p 8080:80)
Chain DOCKER (2 references)
target     source       destination
DNAT       0.0.0.0/0    0.0.0.0/0    tcp dpt:8080 to:172.17.0.2:80
```

**The full path of an external request to a port-mapped container:**

```
External Client (1.2.3.4:54321)
  |
  v
Host eth0 (192.168.1.100:8080)
  |
  v [iptables DNAT: 192.168.1.100:8080 -> 172.17.0.2:80]
docker0 bridge (172.17.0.1)
  |
  v [bridge forwarding]
vethABC
  |
  v [veth pair]
Container eth0 (172.17.0.2:80)
  |
  v
nginx receives request
```

### 3.4 docker-proxy Process

For each port mapping, Docker also starts a `docker-proxy` process:

```bash
$ ps aux | grep docker-proxy
root  5678  docker-proxy -proto tcp -host-ip 0.0.0.0 -host-port 8080 \
                         -container-ip 172.17.0.2 -container-port 80
```

The docker-proxy handles hairpin NAT (container accessing its own published port via the host IP) and some edge cases where iptables rules do not apply (traffic from the host itself).

---

## 4. Container DNS

### 4.1 Embedded DNS Server

Docker runs an embedded DNS server at `127.0.0.11` inside each container on user-defined networks:

```bash
# Inside a container on a user-defined network:
$ cat /etc/resolv.conf
nameserver 127.0.0.11
options ndots:0

# Resolve another container by name
$ nslookup api
Server:    127.0.0.11
Address:   127.0.0.11#53

Name:  api
Address: 172.18.0.3
```

### 4.2 DNS Resolution Chain

```
Container process
  |
  v
127.0.0.11 (Docker embedded DNS)
  |
  +-- Container name match? --> Return container IP
  |
  +-- Network alias match? --> Return container IP(s)
  |
  +-- No match --> Forward to host DNS
                   (/etc/resolv.conf from host or daemon config)
                   |
                   v
                   External DNS (8.8.8.8, corporate DNS, etc.)
```

### 4.3 DNS on Default Bridge vs User-Defined Bridge

```bash
# Default bridge: NO DNS resolution
$ docker run --rm --name a1 -d alpine sleep 3600
$ docker run --rm --name a2 alpine ping a1
# ping: bad address 'a1'   <-- FAILS

# User-defined bridge: DNS works
$ docker network create mynet
$ docker run --rm --name b1 --network mynet -d alpine sleep 3600
$ docker run --rm --name b2 --network mynet alpine ping b1
# PING b1 (172.18.0.2): 56 data bytes
# 64 bytes from 172.18.0.2: seq=0 ttl=64 time=0.100 ms
```

### 4.4 Network Aliases

```bash
# Assign aliases to a container on a network
$ docker run -d --name api-v1 --network mynet --network-alias api alpine sleep 3600
$ docker run -d --name api-v2 --network mynet --network-alias api alpine sleep 3600

# "api" resolves to BOTH containers (round-robin DNS)
$ docker run --rm --network mynet alpine nslookup api
Name:      api
Address 1: 172.18.0.2 api-v1.mynet
Address 2: 172.18.0.3 api-v2.mynet
```

---

## 5. Network Namespaces: Hands-On

### 5.1 Inspecting Container Network Namespace

```bash
# Get the container's PID
$ PID=$(docker inspect --format '{{.State.Pid}}' web)

# Enter the container's network namespace
$ nsenter -t $PID -n ip addr
1: lo: <LOOPBACK,UP> inet 127.0.0.1/8
44: eth0@if45: <BROADCAST,UP> inet 172.17.0.2/16

$ nsenter -t $PID -n ip route
default via 172.17.0.1 dev eth0
172.17.0.0/16 dev eth0 scope link

$ nsenter -t $PID -n ss -tlnp
State   Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
LISTEN  0       511     0.0.0.0:80          0.0.0.0:*          users:(("nginx",pid=1,fd=6))
```

### 5.2 Creating Network Namespaces Manually

```bash
# Create two network namespaces
$ sudo ip netns add ns1
$ sudo ip netns add ns2

# Create a veth pair
$ sudo ip link add veth1 type veth peer name veth2

# Move each end into a namespace
$ sudo ip link set veth1 netns ns1
$ sudo ip link set veth2 netns ns2

# Assign IPs and bring up
$ sudo ip netns exec ns1 ip addr add 10.0.0.1/24 dev veth1
$ sudo ip netns exec ns1 ip link set veth1 up
$ sudo ip netns exec ns1 ip link set lo up

$ sudo ip netns exec ns2 ip addr add 10.0.0.2/24 dev veth2
$ sudo ip netns exec ns2 ip link set veth2 up
$ sudo ip netns exec ns2 ip link set lo up

# Test connectivity
$ sudo ip netns exec ns1 ping 10.0.0.2
# PING 10.0.0.2 (10.0.0.2): 56 data bytes
# 64 bytes from 10.0.0.2: seq=0 ttl=64 time=0.050 ms

# This is exactly what Docker does for each container
```

---

## 6. Overlay Networks

### 6.1 How Overlay Works

Overlay networks connect containers across multiple Docker hosts using VXLAN encapsulation:

```
Host A                                    Host B
+------------------+                      +------------------+
| Container A      |                      | Container B      |
| 10.0.0.2         |                      | 10.0.0.3         |
| eth0 (overlay)   |                      | eth0 (overlay)   |
+--------+---------+                      +--------+---------+
         |                                         |
         v                                         v
+------------------+                      +------------------+
| br0 (bridge)     |                      | br0 (bridge)     |
| VTEP (VXLAN      |                      | VTEP (VXLAN      |
|  Tunnel Endpoint)|                      |  Tunnel Endpoint)|
+--------+---------+                      +--------+---------+
         |                                         |
         | VXLAN encapsulation (UDP 4789)          |
         +-----------------------------------------+
         |        Physical Network (underlay)       |
         +-----------------------------------------+
```

**VXLAN encapsulation:** The original container packet (Layer 2 frame) is wrapped in a UDP packet (port 4789) with a VXLAN header containing the VNI (VXLAN Network Identifier). The outer IP header uses the host's physical IP. This allows overlay traffic to cross any IP network.

### 6.2 Control Plane

Docker Swarm uses a gossip protocol (based on SWIM) and Raft consensus to:
- Distribute network membership information
- Share container IP-to-host mappings
- Propagate routing information

```bash
# Create an overlay network (requires Swarm mode)
$ docker swarm init
$ docker network create --driver overlay --attachable my-overlay

# Attach standalone containers (--attachable required)
$ docker run -d --name svc1 --network my-overlay nginx
```

---

## 7. Port Publishing Deep-Dive

### 7.1 Port Mapping Syntax

```bash
# Map host port 8080 to container port 80
$ docker run -p 8080:80 nginx

# Map to specific host interface
$ docker run -p 127.0.0.1:8080:80 nginx    # only localhost
$ docker run -p 192.168.1.100:8080:80 nginx # specific IP

# Random host port
$ docker run -p 80 nginx        # random host port -> container 80
$ docker run -P nginx            # publish all EXPOSE'd ports to random ports

# UDP port
$ docker run -p 5353:53/udp dns-server

# Multiple port mappings
$ docker run -p 80:80 -p 443:443 nginx

# Check port mappings
$ docker port web
80/tcp -> 0.0.0.0:8080
443/tcp -> 0.0.0.0:8443
```

### 7.2 What -p Actually Does

```
docker run -p 8080:80 nginx

1. iptables DNAT rule:
   -A DOCKER -p tcp --dport 8080 -j DNAT --to-destination 172.17.0.2:80

2. iptables MASQUERADE rule (for return traffic):
   -A POSTROUTING -s 172.17.0.2/32 -d 172.17.0.2/32 -p tcp --dport 80 -j MASQUERADE

3. docker-proxy process:
   docker-proxy -proto tcp -host-ip 0.0.0.0 -host-port 8080
                -container-ip 172.17.0.2 -container-port 80

4. ACCEPT rules in DOCKER-USER and DOCKER chains
```

### 7.3 Port Conflicts

```bash
# Two containers cannot map to the same host port
$ docker run -p 8080:80 nginx
$ docker run -p 8080:80 httpd
# Error: port is already allocated

# But they CAN listen on the same container port (different IP)
$ docker run -p 127.0.0.1:8080:80 nginx
$ docker run -p 127.0.0.2:8080:80 httpd
# Works! Different host IPs

# Or use different host ports
$ docker run -p 8080:80 nginx
$ docker run -p 8081:80 httpd
```

---

## 8. Container-to-Container Communication Patterns

### 8.1 Same Bridge Network

```bash
# Containers on the same user-defined bridge can communicate
$ docker network create mynet
$ docker run -d --name db --network mynet postgres:16
$ docker run -d --name api --network mynet \
    -e DATABASE_URL=postgres://user:pass@db:5432/mydb \
    myapi

# "db" resolves to the postgres container's IP via Docker DNS
```

### 8.2 Different Networks (Isolated by Default)

```bash
$ docker network create frontend
$ docker network create backend

$ docker run -d --name web --network frontend nginx
$ docker run -d --name db --network backend postgres:16

# web CANNOT reach db (different networks)
# Connect a middle-tier container to both:
$ docker run -d --name api --network frontend myapi
$ docker network connect backend api

# api can now reach both web (frontend) and db (backend)
# web still cannot reach db directly
```

### 8.3 Container-to-Host

```bash
# From container to host services:
# On Linux: use host.docker.internal (Docker 20.10+) or 172.17.0.1 (docker0 IP)
# On macOS/Windows: use host.docker.internal

$ docker run --rm alpine ping host.docker.internal
# Resolves to the host's IP
```

### 8.4 Container-to-External

```bash
# Outbound traffic is NATted through the host
# Container 172.17.0.2 -> docker0 -> iptables MASQUERADE -> host eth0 -> internet
# External servers see the host's IP, not the container's IP

# Verify outbound connectivity
$ docker run --rm alpine ping 8.8.8.8
$ docker run --rm alpine wget -qO- http://ifconfig.me
# Shows the host's public IP
```

---

## 9. Network Debugging

### 9.1 docker network inspect

```bash
$ docker network inspect mynet
[
    {
        "Name": "mynet",
        "Id": "abc123...",
        "Driver": "bridge",
        "IPAM": {
            "Config": [
                { "Subnet": "172.18.0.0/16", "Gateway": "172.18.0.1" }
            ]
        },
        "Containers": {
            "def456...": {
                "Name": "web",
                "IPv4Address": "172.18.0.2/16",
                "MacAddress": "02:42:ac:12:00:02"
            },
            "ghi789...": {
                "Name": "api",
                "IPv4Address": "172.18.0.3/16",
                "MacAddress": "02:42:ac:12:00:03"
            }
        }
    }
]
```

### 9.2 Debugging From Inside a Container

```bash
# If the container has networking tools:
$ docker exec web ping api
$ docker exec web curl http://api:8080/health
$ docker exec web nslookup api
$ docker exec web netstat -tlnp

# If the container is minimal (no tools):
$ docker run --rm --network container:web nicolaka/netshoot \
    curl http://api:8080/health

# netshoot is a debugging container with tcpdump, curl, dig, nslookup,
# iperf, netstat, ss, ip, etc.
# --network container:web shares web's network namespace
```

### 9.3 tcpdump in Containers

```bash
# Method 1: tcpdump inside the container (if available)
$ docker exec web tcpdump -i eth0 -nn port 80

# Method 2: tcpdump from the host on the veth interface
$ sudo tcpdump -i vethABC -nn port 80

# Method 3: nsenter into the container's network namespace
$ PID=$(docker inspect --format '{{.State.Pid}}' web)
$ nsenter -t $PID -n tcpdump -i eth0 -nn port 80

# Method 4: netshoot sidecar
$ docker run --rm --network container:web nicolaka/netshoot \
    tcpdump -i eth0 -nn port 80
```

### 9.4 Debugging DNS

```bash
# Check DNS configuration
$ docker exec web cat /etc/resolv.conf
nameserver 127.0.0.11
options ndots:0

# Test DNS resolution
$ docker exec web nslookup api
# or
$ docker exec web dig api

# If DNS is not working, check:
# 1. Are containers on the same user-defined network?
# 2. Is the DNS service running? (docker exec web ping 127.0.0.11)
# 3. Is the container name correct? (docker ps to verify)
```

---

## 10. Advanced Topics

### 10.1 Custom Bridge Configuration

```bash
# Create a bridge with specific subnet and gateway
$ docker network create \
    --driver bridge \
    --subnet 10.1.0.0/24 \
    --gateway 10.1.0.1 \
    --ip-range 10.1.0.128/25 \
    --opt "com.docker.network.bridge.name"="br-custom" \
    --opt "com.docker.network.bridge.enable_icc"=true \
    --opt "com.docker.network.bridge.enable_ip_masquerade"=true \
    custom-net
```

### 10.2 Disabling Inter-Container Communication

```bash
# Disable ICC on a bridge (containers cannot talk to each other)
$ docker network create \
    --opt "com.docker.network.bridge.enable_icc"=false \
    isolated-net

# Now containers can only communicate via published ports
# Useful for multi-tenant isolation
```

### 10.3 IPv6 Support

```bash
# Enable IPv6 in daemon config
# /etc/docker/daemon.json
{
  "ipv6": true,
  "fixed-cidr-v6": "2001:db8:1::/64"
}

# Create an IPv6-enabled network
$ docker network create --ipv6 --subnet "2001:db8:1::/64" ipv6net
```

### 10.4 Network Plugins

Docker supports third-party network plugins via the Docker Plugin API:
- **Calico**: BGP-based networking, network policies (popular in Kubernetes)
- **Weave**: Mesh networking with encryption
- **Flannel**: Simple overlay networking
- **Cilium**: eBPF-based networking and security

---

## 11. Gotchas

### 11.1 Default Bridge Has No DNS

The default `bridge` network (docker0) does NOT support DNS resolution by container name. Only user-defined bridge networks do. This catches everyone at least once.

### 11.2 Published Ports Bypass UFW/firewalld

Docker inserts its iptables rules BEFORE firewall rules. If you have UFW blocking port 8080 but run `docker run -p 8080:80`, port 8080 IS accessible from the internet. Docker bypasses your firewall.

```bash
# Fix: Use the DOCKER-USER chain for firewall rules
$ sudo iptables -I DOCKER-USER -i eth0 -p tcp --dport 8080 -j DROP
# Or bind to localhost: docker run -p 127.0.0.1:8080:80
```

### 11.3 Container IP Addresses Are Ephemeral

Container IPs change on restart. Never hardcode container IPs. Always use DNS names (container names or service discovery).

### 11.4 Host Networking Does Not Work on macOS/Windows

`--network host` on macOS or Windows does not share the physical host's network. Docker Desktop runs containers in a Linux VM, so `host` mode shares the VM's network, not the Mac's.

### 11.5 Overlay Networks Require Swarm or Manual Setup

You cannot create an overlay network without initializing Swarm (`docker swarm init`) or manually configuring a key-value store. The `--attachable` flag is needed for standalone containers.

### 11.6 DNS Resolution Delay on Container Start

When a container starts, it might take a moment before it is registered in Docker's DNS. If container B starts immediately after container A and tries to resolve A, it might fail. Use health checks and retries.

### 11.7 MTU Mismatch Issues

If your host network has a non-standard MTU (e.g., 1400 for VPN or VXLAN), Docker containers default to 1500, causing packet fragmentation or drops. Set MTU in the daemon config:

```json
{
  "mtu": 1400
}
```

### 11.8 Bridge Network Limits

The default bridge subnet `172.17.0.0/16` gives 65,534 IPs. But user-defined bridges default to `/16` too, and Docker assigns from a pool of `172.17-31.0.0/16`. With many networks, you can exhaust the address space. Specify subnets explicitly.

### 11.9 Localhost Inside Container != Localhost on Host

`127.0.0.1` inside a container refers to the container's loopback, NOT the host's. To reach the host from a container, use `host.docker.internal` or the bridge gateway IP.

### 11.10 Port 0.0.0.0 Binding Exposes to ALL Interfaces

`docker run -p 8080:80` binds to `0.0.0.0:8080` by default, meaning ALL host interfaces (including public ones). For security, bind to specific IPs:

```bash
$ docker run -p 127.0.0.1:8080:80 nginx    # localhost only
```

---

## 12. Common Interview Questions

### Q1: "Two containers cannot talk to each other -- how do you debug this?"

**Strong answer:**

Systematic debugging approach:

1. **Check they are on the same network:**
   ```bash
   $ docker inspect --format '{{json .NetworkSettings.Networks}}' containerA
   $ docker inspect --format '{{json .NetworkSettings.Networks}}' containerB
   ```
   If they are on different networks, either connect one to the other's network or create a shared network.

2. **Check DNS resolution:**
   ```bash
   $ docker exec containerA nslookup containerB
   ```
   If DNS fails, check if they are on the default bridge (no DNS) or a user-defined bridge (has DNS). Containers on the default bridge cannot resolve each other by name.

3. **Check the service is actually listening:**
   ```bash
   $ docker exec containerB ss -tlnp
   ```
   Verify the port and binding address (0.0.0.0, not 127.0.0.1).

4. **Test connectivity at the IP level:**
   ```bash
   $ docker exec containerA ping <containerB_IP>
   ```
   If ping works but the service connection fails, the issue is at the application/port level.

5. **Check for firewall rules:**
   ```bash
   $ sudo iptables -L -n -v | grep DROP
   ```

6. **Packet capture for deep debugging:**
   ```bash
   $ docker run --rm --network container:containerA nicolaka/netshoot tcpdump -i eth0
   ```

---

### Q2: "Explain how Docker bridge networking works at the Linux level"

**Strong answer:**

When Docker creates a container on a bridge network:

1. Docker creates a **network namespace** for the container -- an isolated network stack with its own interfaces, routing table, and iptables rules.

2. Docker creates a **veth pair** -- a virtual ethernet cable. One end (`eth0`) is placed inside the container's namespace. The other end (`vethXXX`) remains in the host namespace and is attached to the bridge (`docker0` for the default bridge, `br-xxxxx` for user-defined bridges).

3. Docker assigns an IP address to the container's `eth0` from the bridge subnet (e.g., 172.17.0.2/16) via its IPAM driver.

4. Docker sets the container's default route to the bridge gateway IP (172.17.0.1).

5. For inter-container traffic on the same bridge: packets go from container A's eth0, through its veth into the bridge, then through the other container's veth into container B's eth0. The bridge operates at Layer 2.

6. For outbound traffic: packets go from the container through the bridge, hit the host's iptables NAT rules (MASQUERADE in the POSTROUTING chain), and exit via the host's physical interface with the host's IP.

7. For port mapping (`-p 8080:80`): Docker adds iptables DNAT rules in the PREROUTING chain that rewrite the destination of packets arriving on host:8080 to container_IP:80. A `docker-proxy` process also listens on host:8080 as a fallback.

---

### Q3: "When would you use host networking?"

**Strong answer:**

Host networking (`--network host`) makes the container share the host's network namespace. There is no network isolation, no NAT, no bridge -- the container's processes bind directly to the host's interfaces and ports.

Use cases:
- **Performance-critical applications** where the NAT overhead matters (high-throughput, low-latency network services). The performance difference is typically 1-3% for TCP and more significant for UDP.
- **Applications that need to see raw network traffic** (monitoring, packet capture).
- **Applications that bind to many ports dynamically** (like a SIP server that needs thousands of UDP ports).
- **Service mesh proxies** that intercept all traffic on the host.

Trade-offs: no port mapping means port conflicts with host services and other containers. No network isolation means the container can access all host network services. On macOS and Windows, it does not work as expected because Docker runs in a VM.

---

### Q4: "How does container DNS work?"

**Strong answer:**

On user-defined networks, Docker runs an embedded DNS server at `127.0.0.11` inside each container. The container's `/etc/resolv.conf` points to this address.

When a process inside the container makes a DNS query:
1. The query goes to `127.0.0.11` (Docker's embedded DNS).
2. Docker checks if the name matches a container name or network alias on any shared network.
3. If it matches, Docker returns the container's IP address. For multiple containers with the same alias, it returns all IPs (round-robin DNS).
4. If no match, Docker forwards the query to the upstream DNS server configured in the Docker daemon (by default, the host's DNS from `/etc/resolv.conf`, or custom DNS servers specified in `daemon.json` or `--dns` flags).

On the default bridge network, this embedded DNS server is NOT available. Containers can only communicate by IP address. The deprecated `--link` flag provided limited name resolution on the default bridge, but it should not be used.

---

### Q5: "How do overlay networks work across hosts?"

**Strong answer:**

Overlay networks use VXLAN (Virtual Extensible LAN) to encapsulate container-to-container traffic in UDP packets that can traverse any IP network.

Each Docker host has a VTEP (VXLAN Tunnel Endpoint) that handles encapsulation and decapsulation. When container A on Host 1 sends a packet to container B on Host 2:

1. The packet leaves container A's eth0 and arrives at the overlay bridge on Host 1.
2. Host 1's VTEP encapsulates the entire Layer 2 frame in a VXLAN header (with VNI identifying the overlay network), then wraps it in a UDP packet (port 4789) addressed to Host 2's physical IP.
3. The packet travels across the physical network as a regular UDP packet.
4. Host 2's VTEP receives the UDP packet, strips the VXLAN header, and forwards the original frame to container B through its overlay bridge.

The control plane (how hosts learn which container is on which host) uses Docker Swarm's gossip protocol and Raft consensus to distribute the container-to-host mapping.

---

### Q6: "A container is listening on port 8080 but external clients cannot reach it. What do you check?"

**Strong answer:**

1. **Port publishing:** Is `-p` specified? `docker port containername` shows mappings. No mapping means no external access.

2. **Binding address inside container:** Run `docker exec container ss -tlnp`. If the app binds to `127.0.0.1:8080`, it only accepts connections from inside the container. It needs to bind to `0.0.0.0:8080`.

3. **Host firewall:** Docker's iptables rules bypass UFW/firewalld, but if iptables is completely locked down or the DOCKER-USER chain has DROP rules, traffic is blocked. Check `iptables -L DOCKER-USER -n -v`.

4. **Security groups / cloud firewall:** If on AWS/GCP/Azure, check the instance's security group allows inbound traffic on the published host port.

5. **docker-proxy and iptables:** Verify the DNAT rule exists: `iptables -t nat -L DOCKER -n`. Verify docker-proxy is running: `ps aux | grep docker-proxy`.

6. **Container health:** Is the container actually running? `docker ps`. Is the process inside alive? `docker exec container ps aux`. Is the health check passing? `docker inspect --format '{{.State.Health.Status}}'`.

---

## 13. Quick Reference

| Command | Purpose |
|---------|---------|
| `docker network ls` | List all networks |
| `docker network create <name>` | Create user-defined bridge |
| `docker network inspect <name>` | Network details and connected containers |
| `docker network connect <net> <ctr>` | Connect running container to network |
| `docker network disconnect <net> <ctr>` | Disconnect container from network |
| `docker network prune` | Remove unused networks |
| `docker port <ctr>` | Show port mappings |
| `docker run --network <net>` | Specify network at creation |
| `docker run -p host:ctr` | Publish port |
| `docker run --dns 8.8.8.8` | Set custom DNS server |
| `docker run --network host` | Use host networking |
| `docker run --network none` | No networking |
| `nsenter -t <PID> -n <cmd>` | Run command in container's network namespace |
| `iptables -t nat -L DOCKER -n` | Show Docker NAT rules |
