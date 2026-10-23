# K8s AIOps Copilot — Chat Widget

**English** | [中文](README.md)

Frontend chat component for the Kubernetes AIOps assistant. It provides an AI copilot in a chat interface for Kubernetes cluster operations, troubleshooting and log analysis.

## Features

The analysis panel is expanded by default and grows with its content instead of scrolling inside a 320px box. Streaming updates follow the newest content; scrolling up pauses following, and "back to latest" resumes it. The run status shows the current stage, elapsed time and time since the last progress; after 30 seconds without new content or stage progress it shows a waiting hint. Heartbeats do not count as progress, and analysis that never arrived is never invented. The run hints disappear when the run finishes. Frontend hints do not replace the backend's model and tool timeouts.

- **Conversational operations** — interact with the cluster in natural language: fault diagnosis, resource queries, log analysis
- **Markdown reports** — responses render Markdown, including code blocks, tables and lists
- **Route and stage status** — shows the route chosen by the backend, diagnosis stages, parallel groups and tool progress
- **Multi-turn conversations** — keeps context for follow-up questions
- **Session sidebar** — create, switch and delete sessions; after confirmation you can clear all history and drafts in this browser, which also disconnects running sessions in the frontend
- **Repair workspace** — per-group repair plans, feedback to revise a plan, approval cards with countdown (high-risk commands are highlighted), execution and recovery results, and a view of the active command rules
- **Multi-cluster** — the route card shows the cluster scope. During location, the "multi-cluster location" board shows one row per cluster. Parallel evidence is sectioned by cluster, with one row per abnormal group that shows the diagnosis conclusion once finished. A collapsed row shows one fixed-height line with the latest activity; expanded, it is the run timeline: reasoning, tool calls with results and stage conclusions in arrival order, and approval cards name the target cluster (backend design: robusta `docs/multi-cluster-design.md` §12). `scripts/replay-sse.mjs` replays an event stream through the same event reducer, for backend acceptance.

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

Tests use Node's built-in test runner and cover event state transitions, incremental SSE parsing, pure presentation models and server-side rendering. Browser replay is separate from `npm test` and needs Python Playwright and Chromium; see the [testing guide](docs/testing.md) (Chinese). Contribution and compatibility rules are in [CONTRIBUTING.md](CONTRIBUTING.md).

### Preview the build

```bash
npm run preview
```

## Project layout

```
frountind/
├── index.html                 # HTML entry
├── vite.config.ts             # Vite configuration (including the API proxy)
├── package.json
├── tsconfig.json
├── src/
│   ├── main.tsx               # React entry
│   ├── App.tsx                # root component
│   ├── App.module.css
│   ├── hooks/                 # custom hooks
│   └── components/
│       └── aiops-chat/        # chat components
│           ├── ChatWidget.tsx     # main component
│           ├── ChatSessionPanel.tsx # per-session run state and SSE connection
│           ├── chatEventTransition.ts # pure event state transitions, no network/persistence
│           ├── ChatHeader.tsx     # chat header
│           ├── ChatHeader.module.css
│           ├── MessageList.tsx    # message list
│           ├── MessageList.module.css
│           ├── MessageInput.tsx   # input box
│           ├── MessageInput.module.css
│           ├── UserMessage.tsx    # user message rendering
│           ├── BotMessage.tsx     # AI response and workflow stage cards
│           ├── NodeBlockCard.tsx  # stage and tool details
│           ├── RunProgress.tsx    # run progress and wait timer
│           ├── HandoffDisplay.tsx # stage hand-off display
│           ├── handoffParsing.ts # legacy hand-off field parsing
│           ├── MarkdownReport.tsx # Markdown report rendering
│           ├── Sidebar.tsx        # session sidebar
│           ├── Sidebar.module.css
│           ├── ChatWidget.module.css
│           └── types.ts           # type definitions
└── docs/                      # documentation
```

## Kubernetes deployment

**Multi-cluster**: run `make deploy-mc` on the center. It is used like `make deploy`, with default NodePort 30082 (`MC_NODE_PORT=…`) and the current kubectl context. The frontend itself does not distinguish single from multi-cluster. Copy-paste commands for all three services: "Deployment (copy and paste)" in the Agent README.

This repository ships a simple Kubernetes Pod deployment so the frontend can run on its own. If the component is later embedded in another frontend, reuse only `src/components/aiops-chat/`; the deployment files are not needed.

### Before deploying

You need:

- `docker` available locally
- local `kubectl` pointing at the target cluster
- push access to the registry `10.2.0.86:8443`
- the backend Service: `aiops-copilot.aiops.svc.cluster.local:8000`

Images are pushed to:

```text
xnet.registry.io:8443/xnet-cloud/aiops-copilot-frontend:<VERSION>
```

The version comes from the `VERSION` file at the repository root.

`VERSION` is the deployed image version; `0.1.0` in `package.json` is private package metadata, not the deployment version. Pure refactoring changes neither; bump the image version and verify the deployment when you release.

```bash
cat VERSION
```

### Deploying an existing image

If the image is already built and pushed, only update Kubernetes:

```bash
make deploy
```

`make deploy` syncs the image tag in `deploy/k8s-simple.yaml` to `VERSION` and runs:

```bash
kubectl create namespace aiops --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f deploy/k8s-simple.yaml
kubectl rollout status deployment/aiops-copilot-frontend -n aiops --timeout=300s
```

### Accessing the frontend

The frontend is exposed via NodePort:

```text
http://<any-k8s-node-ip>:30081/
```

In the reference cluster:

```text
http://10.2.0.48:30081/
```

Inside the container Nginx serves the Vite build, and browser requests to `/api/*` are reverse-proxied to the backend in the cluster:

```text
http://aiops-copilot.aiops.svc.cluster.local:8000/
```

### Build, push and deploy in one step

To go from the current code to "build image → push image → deploy to Kubernetes":

```bash
make release
```

`make release` is equivalent to:

```bash
make build && make push && make deploy
```

Note: `make deploy` only applies `deploy/k8s-simple.yaml` and waits for the rollout; it does not rebuild or push the image. Use `make release` for the full flow.

### Building the image manually

With Docker directly:

```bash
docker build -t xnet.registry.io:8443/xnet-cloud/aiops-copilot-frontend:$(cat VERSION) .
```

Or with the Makefile:

```bash
make build
```

### Pushing the image manually

```bash
docker push xnet.registry.io:8443/xnet-cloud/aiops-copilot-frontend:$(cat VERSION)
```

Or:

```bash
make push
```

### Equivalent commands without make

If `make` is not available:

```bash
IMAGE=xnet.registry.io:8443/xnet-cloud/aiops-copilot-frontend:$(cat VERSION)

docker build -t "$IMAGE" .
docker push "$IMAGE"

sed -i "s|image: xnet.registry.io:8443/xnet-cloud/aiops-copilot-frontend:.*|image: $IMAGE|" deploy/k8s-simple.yaml
kubectl create namespace aiops --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f deploy/k8s-simple.yaml
kubectl rollout status deployment/aiops-copilot-frontend -n aiops --timeout=300s
```

Then open:

```text
http://<any-k8s-node-ip>:30081/
```

### Common operations

```bash
make restart      # restart the frontend Pod
make logs         # show the frontend Nginx logs
make delete       # delete the frontend Deployment and Service
make sync-version # sync the image tag in deploy/k8s-simple.yaml to VERSION
```

Check the deployment:

```bash
kubectl get deployment,svc,pod -n aiops -l app=aiops-copilot-frontend -o wide
```

Verify the frontend and the API proxy:

```bash
curl -I http://<any-k8s-node-ip>:30081/
curl http://<any-k8s-node-ip>:30081/api/health
```

### Releasing a new version

After changing `VERSION`, rebuild and deploy:

```bash
echo 0.1.1 > VERSION
make sync-version
make build
make push
make deploy
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

The project's own code is licensed under the [Apache License 2.0](LICENSE), which permits commercial use. Third-party code and dependencies keep their own licenses and attribution and are not relicensed by this project.
