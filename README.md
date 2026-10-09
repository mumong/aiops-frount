# K8s AIOps Copilot — Chat Widget

Kubernetes AIOps 智能对话助手前端组件。提供基于聊天界面的 Kubernetes 集群运维、故障排查、日志分析等 AI Copilot 能力。

## 功能概览

分析过程默认展开，长内容自然增高，不再限制为 320px 内部滚动窗口。流式更新跟随最新内容；主动向上翻阅时暂停跟随，可点击“回到最新内容”。运行状态展示当前阶段、已用时间和距上次进展时间，30 秒无内容/阶段进展时提示等待；心跳不作为分析进展，未返回的分析不会伪造。完成后移除运行提示。前端提示不替代后端模型/工具超时控制。

- **AI 对话式运维** — 通过自然语言与 K8s 集群交互，支持故障诊断、资源查询、日志分析
- **Markdown 报告渲染** — AI 响应支持 Markdown 格式，包含代码块、表格、列表等富文本展示
- **处理路径与阶段状态** — 展示后端选择的路由、诊断阶段、并发组及工具进度
- **多轮对话** — 保留上下文，支持连续追问
- **侧边栏会话管理** — 创建、切换、删除会话；支持确认后清空当前浏览器全部历史和草稿，清空会断开运行中会话的前端连接

## 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | React 18 |
| 构建工具 | Vite 6 |
| 语言 | TypeScript 5 |
| 过程展示 | Ant Design X ThoughtChain + Ant Design；路由、范围、阶段状态 |
| 渲染 | react-markdown + remark-gfm |
| 代理转发 | Vite dev server proxy |

任务路由卡展示后端真实的 `request_contract`，不在前端重新分类。深度诊断不等于全量扫描，范围单独显示；展开处理路径可查看各阶段状态。已有的分析说明和工具列表默认展开，阶段结束及重新打开历史后也保持默认展开，可点击阶段标题手动折叠。工具原文和阶段交接详情仍按需展开。历史会话没有路由字段时不补猜结果；没有收到的分析内容不会由前端补造。

## 本地运行

### 前置要求

- Node.js 20.19+、22.13+ 或 24+（ESLint 10 的要求；推荐 Node.js 24 LTS）
- npm（仓库使用 `package-lock.json`，可复现安装使用 `npm ci`）
- 后端服务已启动，默认地址为 `http://10.2.0.48:30800`

### 安装依赖

```bash
npm ci
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

### 本地验证

```bash
make check      # 顺序执行 npm test、npm run lint、npm run build，不部署
make help       # 查看命令；make build 仍是 Docker 镜像构建
```

测试使用 Node 内置测试运行器，覆盖事件状态转移、SSE 增量解析、纯展示模型和服务端渲染。
浏览器回放独立于 `npm test`，需 Python Playwright 和 Chromium；运行方法与范围见
[测试指南](docs/testing.md)。贡献和兼容性约束见 [CONTRIBUTING.md](CONTRIBUTING.md)。

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
│           ├── ChatSessionPanel.tsx # 每个会话独立的运行状态与 SSE 连接
│           ├── chatEventTransition.ts # 纯事件状态转移，不处理网络/持久化
│           ├── ChatHeader.tsx     # 对话头部
│           ├── ChatHeader.module.css
│           ├── MessageList.tsx    # 消息列表
│           ├── MessageList.module.css
│           ├── MessageInput.tsx   # 输入框
│           ├── MessageInput.module.css
│           ├── UserMessage.tsx    # 用户消息渲染
│           ├── BotMessage.tsx     # AI 响应与工作流阶段卡渲染
│           ├── NodeBlockCard.tsx  # 阶段与工具详情展示
│           ├── RunProgress.tsx    # 运行进度与等待计时
│           ├── HandoffDisplay.tsx # 阶段交接展示
│           ├── handoffParsing.ts # 旧版交接字段解析
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
xnet.registry.io:8443/xnet-cloud/aiops-copilot-frontend:<VERSION>
```

版本来自仓库根目录的 `VERSION` 文件：

`VERSION` 是部署镜像版本；`package.json` 中的 `0.1.0` 是私有应用包元数据，不是部署版本。
纯代码重构不会自动更改二者；发布时单独更新镜像版本并验证部署。

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
docker build -t xnet.registry.io:8443/xnet-cloud/aiops-copilot-frontend:$(cat VERSION) .
```

或者使用 Makefile：

```bash
make build
```

### 手动推送镜像

```bash
docker push xnet.registry.io:8443/xnet-cloud/aiops-copilot-frontend:$(cat VERSION)
```

或者：

```bash
make push
```

### 不使用 Makefile 的等价命令

如果当前环境没有 `make`，可以直接执行下面这些命令：

```bash
IMAGE=xnet.registry.io:8443/xnet-cloud/aiops-copilot-frontend:$(cat VERSION)

docker build -t "$IMAGE" .
docker push "$IMAGE"

sed -i "s|image: xnet.registry.io:8443/xnet-cloud/aiops-copilot-frontend:.*|image: $IMAGE|" deploy/k8s-simple.yaml
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

- `GET /ask` — 前端统一 SSE/文本入口，由后端任务路由判断查询或诊断
- `GET /query` — 后端保留的查询接口；当前前端不再通过模式按钮或示例卡片选择该接口
- `POST /remediation/approve` — 修复审批接口
- `GET /health` — 健康检查接口

## 开发约定

- 组件使用 CSS Modules 样式隔离
- 文件名：React 组件 `PascalCase`，工具函数 `camelCase`
- 缩进 2 空格

## License

项目自有代码采用 [Apache License 2.0](LICENSE)，允许商业使用。
第三方代码与依赖保留各自的许可证及署名，不由本项目重新授权。
