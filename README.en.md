# K8s AIOps Copilot — Frontend
![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)

English | [简体中文](README.md)

## Table of contents
- [Overview](#overview)
- [Key features](#key-features)
- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [License](#license)

## Overview
The chat frontend of K8s AIOps Copilot: query clusters in conversation, follow the diagnosis and its report, approve repairs.
- Shows the backend's real route, stages, tool calls and conclusions; never guesses results
- One frontend for single and multi-cluster
- The chat component `src/components/aiops-chat/` can be embedded in other pages

## Key features
### Chat and diagnosis
✔️ Natural-language chat, follow-up questions, session management  
✔️ Expandable diagnosis: stages, parallel groups, tool calls and results; model reasoning collapsed by default  
✔️ Markdown reports: highlighted conclusion and root cause, code blocks, tables  

### Repair and multi-cluster
⚡ Repair workspace: plans per failure group, feedback to revise, approval cards with a countdown, dangerous commands in red  
⚡ Multi-cluster: one row per cluster for locating and evidence; approval cards show the target cluster  

## Quick start
### Requirements
- K8s deployment: `make`, `kubectl`; the image is published at `xnet.registry.io:8443/xnet-cloud/aiops-copilot-frontend:<VERSION>`
- The AIOps backend is deployed (same namespace `aiops`); to deploy all three services together, follow "Quick start" in the Agent README
- Local development: Node.js 20.19+ / 22.13+ / 24+

### Kubernetes deployment
```bash
make deploy                                     # single cluster: sync the image tag, apply, wait; a failed rollout is rolled back
make deploy-mc                                  # multi-cluster center
echo <new version> > VERSION && make release    # after a code change: build -> push -> deploy
```
Open `http://<any node IP>:30082/` (same for single and multi-cluster).

### Run locally
```bash
npm ci
npm run dev        # http://localhost:5173; API proxied to VITE_PROXY_TARGET (default http://10.2.0.48:30800)
make check         # tests + lint + build
```

## Architecture
```
browser ──> Nginx (:30082) ──┬─ static pages
                             └─ /api/* ──> aiops-copilot.aiops.svc:8000 (/ask SSE, /repair/*, /health)
```

## Documentation
| Document | Content |
|---|---|
| [Development and deployment guide](docs/GUIDE.en.md) | Feature details, stack, project layout, common commands, backend interfaces, conventions |
| [Testing guide](docs/testing.md) | Unit tests and browser replay |

## License
[Apache License 2.0](LICENSE). Third-party code keeps its own licenses.
