# K8s AIOps Copilot — Chat Widget

Kubernetes AIOps 智能对话助手前端组件。提供基于聊天界面的 Kubernetes 集群运维、故障排查、日志分析等 AI Copilot 能力。

## 功能概览

- **AI 对话式运维** — 通过自然语言与 K8s 集群交互，支持故障诊断、资源查询、日志分析
- **Markdown 报告渲染** — AI 响应支持 Markdown 格式，包含代码块、表格、列表等富文本展示
- **节点关系图** — 自动解析 K8s 资源关联关系并以可视化节点图呈现
- **多轮对话** — 保留上下文，支持连续追问
- **侧边栏会话管理** — 创建、切换、删除会话

## 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | React 18 |
| 构建工具 | Vite 6 |
| 语言 | TypeScript 5 |
| 渲染 | react-markdown + rehype-highlight + remark-gfm |
| 代理转发 | Vite dev server proxy |

## 本地运行

### 前置要求

- Node.js >= 18
- pnpm（推荐）或 npm
- 后端服务已启动，默认地址为 `http://10.2.0.48:30800`

### 安装依赖

```bash
npm install
# 或
pnpm install
```

### 启动前端

```bash
npm run dev
```

开发服务器默认绑定 `0.0.0.0:5173`：

```text
http://localhost:5173/
http://<当前机器IP>:5173/
```

API 请求通过 Vite proxy 转发到后端，默认目标是 `http://10.2.0.48:30800`。

如需修改 API 后端地址，编辑 `vite.config.ts` 中 `server.proxy` 的 `target` 字段。

### 生产构建

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

### 预览构建结果

```bash
npm run preview
```

## 项目结构

```
frountind/
├── index.html                 # HTML 入口
├── vite.config.ts             # Vite 配置（含 API 代理）
├── package.json
├── tsconfig.json
├── src/
│   ├── main.tsx               # React 入口
│   ├── App.tsx                # 应用根组件
│   ├── App.module.css
│   ├── hooks/                 # 自定义 Hooks
│   └── components/
│       └── aiops-chat/        # 聊天组件
│           ├── ChatWidget.tsx     # 主组件
│           ├── ChatHeader.tsx     # 对话头部
│           ├── ChatHeader.module.css
│           ├── MessageList.tsx    # 消息列表
│           ├── MessageList.module.css
│           ├── MessageInput.tsx   # 输入框
│           ├── MessageInput.module.css
│           ├── UserMessage.tsx    # 用户消息渲染
│           ├── BotMessage.tsx     # AI 响应渲染（含节点图）
│           ├── MarkdownReport.tsx # Markdown 报告渲染
│           ├── Sidebar.tsx        # 侧边栏会话管理
│           ├── Sidebar.module.css
│           ├── ChatWidget.module.css
│           └── types.ts           # 类型定义
└── docs/                      # 文档
```

## K8s 环境部署

当前仓库提供一个临时 Kubernetes Pod 部署方案，便于单独运行前端。未来如果把组件融入其他前端页面，可以只复用 `src/components/aiops-chat/`，不需要这些部署文件。

### 部署前确认

需要具备：

- 本机可执行 `docker`
- 本机 `kubectl` 已指向目标 K8s 集群
- 能推送到镜像仓库 `10.2.0.86:8443`
- 后端 Service 已存在：`aiops-copilot.aiops.svc.cluster.local:8000`

镜像默认推送到：

```text
10.2.0.86:8443/xnet-cloud/aiops-copilot-frontend:<VERSION>
```

版本来自仓库根目录的 `VERSION` 文件：

```bash
cat VERSION
```

### 快速部署已有镜像到 K8s

如果镜像已经构建并推送过，只需要更新 K8s：

```bash
make deploy
```

`make deploy` 会把 `deploy/k8s-simple.yaml` 里的镜像 tag 同步为 `VERSION`，然后执行：

```bash
kubectl create namespace aiops --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f deploy/k8s-simple.yaml
kubectl rollout status deployment/aiops-copilot-frontend -n aiops --timeout=300s
```

### 访问前端

前端通过 NodePort 暴露：

```text
http://<任意K8s节点IP>:30081/
```

当前集群示例：

```text
http://10.2.0.48:30081/
```

容器内使用 Nginx 承载 Vite 构建产物，浏览器请求 `/api/*` 会被反向代理到集群内后端：

```text
http://aiops-copilot.aiops.svc.cluster.local:8000/
```

### 镜像还没构建时：一键打包、推送、部署

如果你要从当前代码直接完成“打包镜像 -> 推送镜像 -> 部署到 K8s”，执行：

```bash
make release
```

`make release` 等价于：

```bash
make build && make push && make deploy
```

注意：`make deploy` 只负责把 `deploy/k8s-simple.yaml` 应用到 K8s，并等待 rollout；它不会自动重新打包镜像，也不会自动 push 镜像。完整一键流程请用 `make release`。

### 手动打包前端镜像

使用 Docker 直接打包：

```bash
docker build -t 10.2.0.86:8443/xnet-cloud/aiops-copilot-frontend:$(cat VERSION) .
```

或者使用 Makefile：

```bash
make build
```

### 手动推送镜像

```bash
docker push 10.2.0.86:8443/xnet-cloud/aiops-copilot-frontend:$(cat VERSION)
```

或者：

```bash
make push
```

### 不使用 Makefile 的等价命令

如果当前环境没有 `make`，可以直接执行下面这些命令：

```bash
IMAGE=10.2.0.86:8443/xnet-cloud/aiops-copilot-frontend:$(cat VERSION)

docker build -t "$IMAGE" .
docker push "$IMAGE"

sed -i "s|image: 10.2.0.86:8443/xnet-cloud/aiops-copilot-frontend:.*|image: $IMAGE|" deploy/k8s-simple.yaml
kubectl create namespace aiops --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f deploy/k8s-simple.yaml
kubectl rollout status deployment/aiops-copilot-frontend -n aiops --timeout=300s
```

部署完成后访问：

```text
http://<任意K8s节点IP>:30081/
```

### 常用运维命令

```bash
make restart      # 重启前端 Pod
make logs         # 查看前端 Nginx 日志
make delete       # 删除前端 Deployment 和 Service
make sync-version # 将 deploy/k8s-simple.yaml 里的镜像 tag 同步为 VERSION
```

查看当前部署状态：

```bash
kubectl get deployment,svc,pod -n aiops -l app=aiops-copilot-frontend -o wide
```

验证前端和 API 反代：

```bash
curl -I http://<任意K8s节点IP>:30081/
curl http://<任意K8s节点IP>:30081/api/health
```

### 更新版本

修改 `VERSION` 后重新构建部署：

```bash
echo 0.1.1 > VERSION
make sync-version
make build
make push
make deploy
```

## 环境要求

前端容器本身只提供静态页面和 `/api` 反向代理。后端需要暴露以下接口：

- `GET /ask` — 诊断模式 SSE/文本接口
- `GET /query` — 查询模式 SSE/文本接口
- `POST /remediation/approve` — 修复审批接口
- `GET /health` — 健康检查接口

## 开发约定

- 组件使用 CSS Modules 样式隔离
- 文件名：React 组件 `PascalCase`，工具函数 `camelCase`
- 缩进 2 空格

## License

MIT
