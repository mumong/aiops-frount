# K8s AIOps Copilot — Chat Widget

[English](README.en.md) | **中文**

Kubernetes AIOps 智能对话助手前端组件。提供基于聊天界面的 Kubernetes 集群运维、故障排查、日志分析等 AI Copilot 能力。

## 功能概览

分析过程默认展开，长内容自然增高，不再限制为 320px 内部滚动窗口。流式更新跟随最新内容；主动向上翻阅时暂停跟随，可点击“回到最新内容”。运行状态展示当前阶段、已用时间和距上次进展时间，30 秒无内容/阶段进展时提示等待；心跳不作为分析进展，未返回的分析不会伪造。完成后移除运行提示。前端提示不替代后端模型/工具超时控制。

- **AI 对话式运维** — 通过自然语言与 K8s 集群交互，支持故障诊断、资源查询、日志分析
- **Markdown 报告渲染** — AI 响应支持 Markdown 格式，包含代码块、表格、列表等富文本展示
- **处理路径与阶段状态** — 展示后端选择的路由、诊断阶段、并发组及工具进度
- **多轮对话** — 保留上下文，支持连续追问
- **侧边栏会话管理** — 创建、切换、删除会话；支持确认后清空当前浏览器全部历史和草稿，清空会断开运行中会话的前端连接
- **多集群** — 路由卡片显示集群范围。问题定位时，"多集群并发定位"为每个集群显示一行；并发取证按集群分区，每个异常组一行，完成后行首显示诊断结论。每行折叠时只显示一行最新动态（高度固定，不跳动），展开后是运行时间线：工具调用及结果、阶段结论按发生顺序排列；模型思考放在一个默认折叠的"思考过程"框里，与快速查询一致。审批卡片显示目标集群（后端设计见 robusta 仓库 `docs/multi-cluster-design.md` §12）。`scripts/replay-sse.mjs` 可以把一段事件流交给同一份事件处理逻辑回放，供后端验收使用
- **修复工作区** — 按异常组展示修复方案，可反馈修改方案；审批卡片带倒计时，高危命令单独标红；展示执行与恢复结果，并可查看当前生效的命令规则

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

如需修改 API 后端地址，设置环境变量 `VITE_PROXY_TARGET`（或写入 `.env.local`），例如 `VITE_PROXY_TARGET=http://127.0.0.1:8000 npm run dev`。

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
aiops-frount/
├── index.html、vite.config.ts（含 API 代理）、package.json、tsconfig*.json
├── src/
│   ├── main.tsx、App.tsx         # 入口与根组件
│   ├── hooks/                    # 会话历史、SSE 连接
│   └── components/aiops-chat/    # 聊天组件（可单独复用）
│       ├── ChatWidget / ChatSessionPanel / MessageList / MessageInput / Sidebar   # 会话与消息
│       ├── BotMessage / RouteCard / NodeBlockCard / RunProgress / MarkdownReport  # 路由、阶段、报告
│       ├── ClusterLaneBoard / ParallelEvidenceBoard / RunRow / TraceTimeline / ReasoningDetails  # 多集群与并发组的运行行和时间线
│       ├── RepairWorkspace / RepairPlanContent / RemediationApprovalCard / RepairProgress / RepairPolicyPanel  # 修复工作区
│       └── chatEventTransition.ts、traceModel.ts、clusterLanes.ts 等  # 纯逻辑：事件状态转移与展示模型
├── scripts/replay-sse.mjs        # 把一段 SSE 事件流交给同一份事件处理逻辑回放（后端验收用）
├── tests/                        # Node 内置测试运行器的单元测试
├── deploy/k8s-simple.yaml、nginx.conf、Dockerfile   # K8s 部署
└── docs/                         # 测试指南等
```

## K8s 环境部署

三个服务一起部署（单集群、多集群）的复制命令见 Agent 仓库 README「部署（复制即用）」。单独部署前端：

```bash
make deploy                        # 已有镜像：同步清单里的镜像版本并应用，等待就绪，失败自动回滚
echo <新版本号> > VERSION && make release   # 改了代码：构建 → 推送 → 部署
make deploy-mc                     # 多集群中心（kubectl 指向中心，或用 ~/.kube/aiops-mc/center）
```

- 镜像：`xnet.registry.io:8443/xnet-cloud/aiops-copilot-frontend:<VERSION>`。`VERSION` 是部署版本；`package.json` 里的版本号只是应用包元数据。
- 访问：`http://<任意节点IP>:30082/`（单集群和多集群相同）。容器内是 Nginx：静态页面加 `/api/*` 反向代理到 `http://aiops-copilot.aiops.svc.cluster.local:8000/`，所以后端 Service 要先存在。
- 前端本身不区分单集群和多集群。
- 只想把聊天组件嵌进别的页面时，复用 `src/components/aiops-chat/` 即可，不需要这些部署文件。

常用命令：

```bash
make restart                                 # 重启前端 Pod
make logs                                    # 查看 Nginx 日志
make delete                                  # 删除前端 Deployment 和 Service
kubectl get deployment,svc,pod -n aiops -l app=aiops-copilot-frontend -o wide
curl -I http://<节点IP>:30082/ && curl http://<节点IP>:30082/api/health   # 验证页面和 API 反代
```

## 环境要求

前端容器本身只提供静态页面和 `/api` 反向代理。后端需要暴露以下接口：

- `GET /ask` — 前端统一 SSE/文本入口，由后端任务路由判断查询、执行、诊断或修复
- `GET /query` — 后端保留的查询接口；当前前端不再通过模式按钮或示例卡片选择该接口
- `POST /repair/batches`、`GET /repair/batches/{id}` — 按异常组创建与查看修复批次
- `GET /repair/jobs/{id}`、`POST /repair/jobs/{id}/feedback`、`POST /repair/jobs/{id}/cancel` — 修复工作区的方案、反馈修改与取消
- `POST /remediation/approve` — 修复动作审批（批准 / 拒绝）
- `GET /repair/policy`、`POST /repair/policy/check`、`PUT|DELETE /repair/policy/mode` — 执行方式与高危命令规则
- `GET /health` — 健康检查接口

## 开发约定

- 组件使用 CSS Modules 样式隔离
- 文件名：React 组件 `PascalCase`，工具函数 `camelCase`
- 缩进 2 空格

## License

项目自有代码采用 [Apache License 2.0](LICENSE)，允许商业使用。
第三方代码与依赖保留各自的许可证及署名，不由本项目重新授权。
