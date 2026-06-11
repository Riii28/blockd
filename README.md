# blockd

DNS-level domain blocker powered by dnsmasq. Runs as an interactive CLI, blocks domains across all browsers and apps on the machine without browser extensions or proxy configuration.

## Requirements

- Node.js 18+
- dnsmasq
- iptables
- figlet (optional, for the ASCII banner)
- Root or sudo privileges

## Installation

```bash
npm install
npm run build
sudo node dist/cli.js
```

> Must be run as root — dnsmasq binds to port 53 and iptables requires elevated permissions.

## Commands

| Command | Description |
|---|---|
| `block <domain>` | Block a domain and all its subdomains |
| `unblock <domain>` | Remove a domain from the blocklist |
| `list` | Show all currently blocked domains |
| `upstream <ip>` | Change the upstream DNS server |
| `status` | Show port, upstream DNS, and blocked domain count |
| `stop` | Stop blockd and exit |

## How it works

On start, blockd writes a dnsmasq config that resolves all blocked domains to `0.0.0.0`, then spawns dnsmasq as a subprocess on the configured port. An iptables rule redirects outbound UDP port 443 (QUIC) to force traffic through DNS resolution. When a domain is blocked or unblocked, dnsmasq is restarted with the updated config.

On exit (via `stop` or Ctrl+C), the iptables rule is removed and dnsmasq is shut down cleanly.

## Configuration

State is persisted to disk and loaded on next start. Default values:

```json
{
  "port": 53,
  "upstreamDns": "1.1.1.1",
  "blockedDomains": []
}
```

## Development

```bash
npm run dev
```