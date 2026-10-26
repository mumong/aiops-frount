# Frontend development and deployment guide

Quick start: [README](../README.en.md). This is the full reference for features, local development, project layout, deployment and backend interfaces.


Frontend chat component for the Kubernetes AIOps assistant. It provides an AI copilot in a chat interface for Kubernetes cluster operations, troubleshooting and log analysis.

## Features

The analysis panel is expanded by default and grows with its content instead of scrolling inside a 320px box. Streaming updates follow the newest content; scrolling up pauses following, and "back to latest" resumes it. The run status shows the current stage, elapsed time and time since the last progress; after 30 seconds without new content or stage progress it shows a waiting hint. Heartbeats do not count as progress, and analysis that never arrived is never invented. The run hints disappear when the run finishes. Frontend hints do not replace the backend's model and tool timeouts.

- **Conversational operations** — interact with the cluster in natural language: fault diagnosis, resource queries, log analysis
- **Markdown reports** — responses render Markdown, including code blocks, tables and lists
- **Route and stage status** — shows the route chosen by the backend, diagnosis stages, parallel groups and tool progress
- **Multi-turn conversations** — keeps context for follow-up questions
- **Session sidebar** — create, switch and delete sessions; after confirmation you can clear all history and drafts in this browser, which also disconnects running sessions in the frontend
- **Repair workspace** — per-group repair plans, feedback to revise a plan, approval cards with countdown (high-risk commands are highlighted), execution and recovery results, and a view of the active command rules
- **Multi-cluster** — the route card shows the cluster scope. During location, the "multi-cluster location" board shows one row per cluster. Parallel evidence is sectioned by cluster, with one row per abnormal group that shows the diagnosis conclusion once finished. A collapsed row shows one fixed-height line with the latest activity; expanded, it is the run timeline: tool calls with results and stage conclusions in arrival order, with the model's reasoning in one collapsed "reasoning" box as in quick queries. Approval cards name the target cluster (backend design: robusta `docs/multi-cluster-design.md` §12). `scripts/replay-sse.mjs` replays an event stream through the same event reducer, for backend acceptance.

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | React 18 |
| Build tool | Vite 6 |
| Language | TypeScript 5 |
| Process display | Ant Design X ThoughtChain + Ant Design; route, scope and stage status |
| Rendering | react-markdown + remark-gfm |
| Proxy | Vite dev server proxy |

The route card shows the backend's real `request_contract` and does not reclassify in the frontend. A deep diagnosis is not a full scan; its scope is shown separately, and expanding the route shows each stage's status. Existing analysis text and tool lists are expanded by default, also after a stage finishes and when a history entry is reopened; click a stage title to collapse it. Raw tool output and stage hand-off details expand on demand. Old sessions without a route field are not guessed, and analysis that was not received is not filled in by the frontend.

## Running locally

### Prerequisites

- Node.js 20.19+, 22.13+ or 24+ (required by ESLint 10; Node.js 24 LTS recommended)
- npm (the repository uses `package-lock.json`; use `npm ci` for reproducible installs)
- A running backend, by default at `http://10.2.0.48:30800`

### Install dependencies

```bash
npm ci
```

### Start the frontend

```bash
npm run dev
```

The dev server binds to `0.0.0.0:5173`:

```text
http://localhost:5173/
http://<this-machine-ip>:5173/
```

API requests go through the Vite proxy to the backend, by default `http://10.2.0.48:30800`.

To change the backend, set `VITE_PROXY_TARGET` (or put it in `.env.local`), for example `VITE_PROXY_TARGET=http://127.0.0.1:8000 npm run dev`.

### Production build

```bash
npm run build
```

The output goes to `dist/`.

### Local verification

```bash
make check      # runs npm test, npm run lint and npm run build in order; does not deploy
make help       # list targets; make build still builds the Docker image
```

Tests use Node's built-in test runner and cover event state transitions, incremental SSE parsing, pure presentation models and server-side rendering. Browser replay is separate from `npm test` and needs Python Playwright and Chromium; see the [testing guide](testing.md) (Chinese). Contribution and compatibility rules are in [CONTRIBUTING.md](../CONTRIBUTING.md).

### Preview the build

```bash
npm run preview
```

## Project layout

```
aiops-frount/
├── index.html, vite.config.ts (API proxy), package.json, tsconfig*.json
├── src/
│   ├── main.tsx, App.tsx         # entry and root component
│   ├── hooks/                    # chat history, SSE connection
│   └── components/aiops-chat/    # the chat component (reusable on its own)
│       ├── ChatWidget / ChatSessionPanel / MessageList / MessageInput / Sidebar   # sessions and messages
│       ├── BotMessage / RouteCard / NodeBlockCard / RunProgress / MarkdownReport  # route, stages, report
│       ├── ClusterLaneBoard / ParallelEvidenceBoard / RunRow / TraceTimeline / ReasoningDetails  # per-cluster and per-group run rows and timelines
│       ├── RepairWorkspace / RepairPlanContent / RemediationApprovalCard / RepairProgress / RepairPolicyPanel  # repair workspace
│       └── chatEventTransition.ts, traceModel.ts, clusterLanes.ts, ...  # pure logic: event reducer and view models
├── scripts/replay-sse.mjs        # replays an SSE event stream through the same reducer (backend acceptance)
├── tests/                        # unit tests on Node's built-in test runner
├── deploy/k8s-simple.yaml, nginx.conf, Dockerfile   # Kubernetes deployment
└── docs/                         # testing guide and more
```

## Kubernetes deployment

Copy-paste commands for all three services (single cluster, multi-cluster) are in the Agent README, "Quick start". To deploy only the frontend:

```bash
make deploy                        # existing image: sync the manifest's image tag, apply, wait; a failed rollout is rolled back
echo <new version> > VERSION && make release   # after a code change: build -> push -> deploy
make deploy-mc                     # multi-cluster center (kubectl pointing at the center, or ~/.kube/aiops-mc/center)
```

- Image: `xnet.registry.io:8443/xnet-cloud/aiops-copilot-frontend:<VERSION>`. `VERSION` is the deployment version; the version in `package.json` is package metadata only.
- Access: `http://<any node IP>:30082/` (same for single and multi-cluster). The container runs Nginx: static pages plus a reverse proxy from `/api/*` to `http://aiops-copilot.aiops.svc.cluster.local:8000/`, so the backend Service must exist.
- The frontend itself does not distinguish single from multi-cluster.
- To embed the chat in another page, reuse `src/components/aiops-chat/`; the deployment files are not needed.

Common commands:

```bash
make restart                                 # restart the frontend Pod
make logs                                    # Nginx logs
make delete                                  # delete the frontend Deployment and Service
kubectl get deployment,svc,pod -n aiops -l app=aiops-copilot-frontend -o wide
curl -I http://<node IP>:30082/ && curl http://<node IP>:30082/api/health   # page and API proxy
```

## Backend requirements

The frontend container only serves static pages and the `/api` reverse proxy. The backend must expose:

- `GET /ask` — the single SSE/text entry; the backend's router decides between query, execution, diagnosis and repair
- `GET /query` — query endpoint kept by the backend; the frontend no longer selects it via mode buttons or example cards
- `POST /repair/batches`, `GET /repair/batches/{id}` — create and read per-group repair batches
- `GET /repair/jobs/{id}`, `POST /repair/jobs/{id}/feedback`, `POST /repair/jobs/{id}/cancel` — plan, revise with feedback and cancel in the repair workspace
- `POST /remediation/approve` — approve or reject a repair action
- `GET /repair/policy`, `POST /repair/policy/check`, `PUT|DELETE /repair/policy/mode` — execution mode and high-risk command rules
- `GET /health` — health check

## Conventions

- Components use CSS Modules for style isolation
- File names: React components in `PascalCase`, utilities in `camelCase`
- 2-space indentation

## License

The project's own code is licensed under the [Apache License 2.0](../LICENSE), which permits commercial use. Third-party code and dependencies keep their own licenses and attribution and are not relicensed by this project.
