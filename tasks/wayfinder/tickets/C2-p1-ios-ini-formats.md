# C2 — P1: iOS INI formats — Surge, Loon, Surfboard, Egern

Status: TODO
Priority: P1 — unlocks Surge/Loon/Surfboard/Egern iOS users (4 new FORMATS)
Depends: C1 (shares FORMATS registry)

## Scope
Each is a pure string-template generator reusing `expandEndpoints` + `resolveAmnezia`. No AMNEZIA needed (vanilla WG WARP). Follow existing patterns: `generate*` fn → FORMATS entry → SUB_FORMATS pill → golden.

### 1) Surge — `generateSurgeConf` (`_worker.js:new`) → `FORMATS['surge']`
Source: https://manual.nssurge.com/policy/wireguard.html
```ini
[Proxy]
WARP-01 = wireguard, section-name=WARP-01

[WireGuard WARP-01]
private-key = <base64>
self-ip = 172.16.0.2
self-ip-v6 = 2606:.../128
dns-server = 1.1.1.1, 2606:4700:4700::1111
mtu = 1280
peer = (public-key = <pub>, allowed-ips = "0.0.0.0/0, ::/0", endpoint = ip:port, keepalive = 25, client-id = 1/2/3)
```
- `client-id = b1/b2/b3` slash form from reserved array.
- One section per config (tag = name). Deep link: `surge://install-config?url=<sub>&name=WARP` (add to SUB_FORMATS dl).
- contentType `text/plain`, ext `conf`

### 2) Loon — `generateLoonConf` → `FORMATS['loon']`
Source: https://github.com/As-Lucky/Lucky/blob/main/Lucky-Loon.conf / nsloon.app
```ini
[Proxy]
WARP-01 = wireguard,interface-ip=172.16.0.2,interface-ipv6=2606:...,private-key="...",mtu=1280,dns=1.1.1.1,dnsv6=2606:4700:4700::1111,keepalive=25,peers=[{public-key="...",allowed-ips="0.0.0.0/0, ::/0",endpoint=ip:port,reserved=[1,2,3]}]
```
- One-liner per peer, quoted keys, `reserved=[a,b,c]` array.
- Deep link: `loon://import?sub=<sub>` (SUB_FORMATS)

### 3) Surfboard — `generateSurfboardConf` → `FORMATS['surfboard']`
Source: https://getsurfboard.com/docs/profile-format/proxy/external-proxy/wireguard
```ini
[Proxy]
WARP-01 = wireguard, section-name=WARP-01

[WireGuard WARP-01]
private-key = <b64>
self-ip = 172.16.0.2
self-ip-v6 = fd00::...
dns-server = 1.1.1.1
mtu = 1280
peer = (public-key=<b64>, allowed-ips="0.0.0.0/0, ::/0", endpoint=1.2.3.4:51820, keepalive=25)
```
- Same dual-section as Surge but `private-key`/`self-ip`/`dns-server` keys (no client-id). Reuse Surge template with key rename.

### 4) Egern — `generateEgernYaml` → `FORMATS['egern']`
Source: https://egernapp.com/docs/configuration/example
```yaml
proxies:
  - wireguard:
      name: WARP-01
      server: engage.cloudflareclient.com
      port: 2408
      private_key: "base64"
      peer_public_key: "base64"
      local_ipv4: 172.16.0.2/32
      local_ipv6: 2606:.../128
      reserved: [1,2,3]
```
- Keys `private_key`/`peer_public_key`/`local_ipv4` vs Clash. Emit both v4+v6 with CIDR.
- contentType `application/x-yaml`, ext `yaml`

## Acceptance
- `node --check` + `npm test` + `npm run goldens:update` (4 new goldens) + dry-run
- Import each in target client (Surge TestFlight / Loon / Surfboard / Egern) or at minimum validate INI/YAML parses

## References
- 10-scout audit 2026-08-23: iOS + surge/loon/qx scouts
