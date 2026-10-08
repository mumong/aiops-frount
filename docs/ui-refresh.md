# AIOps 运维工作台 UI/UX 重构

本次修改在任务开始时已有的工作区改动之上进行，仅升级展示和交互层。没有提交、推送、修改版本或部署。截图与浏览器回放使用本地测试数据，未请求真实模型或执行集群写操作。

## 技术与设计

保留 React 18、TypeScript 5、Vite 6、CSS Modules、Ant Design 6 和 Ant Design X ThoughtChain。复用 Ant Design 的主题算法、Drawer 与 Popconfirm，解决移动导航、焦点管理和删除确认；新增 Lucide React 1.53.0 统一图标。该版本的 peerDependencies 明确支持 React 18。

将锁文件中已有的 highlight.js 11.11.1 声明为直接依赖，仅注册 Bash、YAML、JSON、Diff。Markdown 仍使用 react-markdown / remark-gfm；未知语言保持完整纯文本。高亮器转义输入后生成自己的 span 标签，新增测试验证 HTML 类代码不能执行。

未引入 Tailwind/shadcn、另一套聊天状态框架、拓扑库或图表库：现有 CSS Modules 与 Ant Design 足以支撑设计体系，同时避免双组件体系和数据协议迁移。没有足够的真实时序数据，因此没有添加推测指标或装饰性图表。

设计采用中性底色、克制的靛蓝操作色和独立的成功/警告/错误色。统一背景、文字、边框、代码、间距与状态样式，深浅主题同步到 Ant Design。初始主题遵循系统偏好，用户选择保存在独立的 `aiops_ui_theme` 键中。

- 全宽工作台：桌面会话导航、可收起侧栏、受控阅读宽度；小屏采用支持 Escape 和焦点恢复的抽屉。
- 聊天：功能性问题建议、无重边框的助手消息、报告定位、Markdown 表格、代码高亮、原文复制及成功/失败反馈。
- 输入：自适应高度，Enter 发送、Shift+Enter 换行、中文输入法组合输入保护；保留发送期间停止操作。
- 诊断：真实事件驱动的阶段时间线；分析默认展开，工具原文和阶段输出按需展开，长分析不困在内部滚动框中。
- 并发证据：真实统计、异常分组、按组展开、状态与证据维度、原始结果及归档引用；展开组使用整行宽度；取消装饰性的进度条。
- 审批：报告之后显示目标、风险等级（仅后端提供时）、风险说明、预演/执行/验证命令、回退建议、完整 payload、倒计时及响应状态。
- 会话：本地标题搜索、键盘选择、删除确认、空状态和存储位置说明。
- 可访问性：原生 button/summary、可见焦点、交互状态、移动抽屉焦点管理、reduced-motion；不依赖颜色区分工具成功/失败。

## 文件与职责

| 文件 | 本次修改 |
| --- | --- |
| `src/App.tsx`、`src/App.module.css` | 主题入口、全局设计变量与满屏布局 |
| `WorkspaceTheme.tsx` | 独立外观偏好及 Ant Design 主题 |
| `ChatHeader.tsx`、`Sidebar.tsx` 及样式 | 导航、模式选择、主题按钮、搜索和删除确认 |
| `MessageInput.tsx`、`MessageList.tsx`、`UserMessage.tsx` | 输入、欢迎页、消息阅读和交互 |
| `BotMessage.tsx`、`NodeBlockCard.tsx` | 报告入口、阶段时间线、工具详情 |
| `ParallelEvidenceBoard.tsx` 及样式 | 并发分组、证据与状态展示；useId 避免多轮消息中的重复 DOM ID |
| `RemediationApprovalCard.tsx` | 审批信息层次、风险和命令展示；原处理逻辑不变 |
| `MarkdownReport.tsx`、`CodeBlock.tsx`、`CopyButton.tsx`、`codeHighlight.ts` | Markdown、转义高亮、保持原文的复制与反馈 |
| `HandoffDisplay.tsx` | 阶段交接信息的键盘展开；长普通文本可展开全文，折叠 JSON 的复制仍保留完整内容 |
| `ChatWidget.tsx` | 仅移动端侧栏初始展示状态和欢迎页建议的 UI 接线 |
| `index.html`、`public/favicon.svg` | 工作台标题和统一产品图标 |
| `tests/code-highlight.test.mjs`、`tests/ui-workspace.browser.py` | 高亮转义及工作台交互验收 |

## 业务兼容性

与本次任务开始时的文件 SHA-256 逐项比较，以下文件未改变：

- `useSSE.ts`、`sseDecoder.ts`、`useChatHistory.ts`。
- `chatEventTransition.ts`、`chatRequestPolicy.ts`、`nodeBlockUpdates.ts`、`parallelEvidenceModel.ts`、`types.ts`。
- `remediationApprovalContinuation.ts`、`remediationParsing.ts`。
- `Dockerfile`、`nginx.conf`、`deploy/k8s-simple.yaml`、`VERSION`。

`ChatWidget` 的发送/停止、同步快照、持久化和审批请求函数没有改变。`RemediationApprovalCard` 的 `handleAction`、过期条件、当前审批判定及后续事件等待逻辑没有改变。历史 `aiops_chat_sessions` 的 schema 与 session_id 保留；主题偏好使用独立键。真实 API 路径、GET/POST、参数、事件顺序、路由及流程顺序不变。

`final` 仍不会主动断开 SSE。审批和修复结果继续在报告之后接收和展示；前端不自动同意审批。心跳仍不算分析进展，未返回、部分完成和语义失败不会被改成成功。

## 验证结果

环境：Node 24.18.0、npm 11.16.0、Python Playwright 1.63.0、本机 Chromium。浏览器测试最终运行于生产构建预览 `http://127.0.0.1:5177`。

- `npm ci`：完成，使用锁文件安装。
- `make check`：通过。82 个 Node 测试通过，ESLint、TypeScript、Vite 生产构建通过。
- `git diff --check`：通过。
- `diagnosis-layout.browser.py --verify`：通过。1100/390px、长内容、空白 token、原始工具文本、自动跟随/回到最新内容、等待状态及最终报告。
- `autonomous-parallel.browser.py`：通过。乱序结果、分组、部分失败、历史恢复；新增键盘展开、原文读取及深色截图。
- `direct-query.browser.py`：通过。结构化查询、阶段默认展开/手动折叠/历史恢复、连续追问和模型 HTTP 500 展示。
- `remediation-review.browser.py`：通过。报告后审批、到期禁用、同意与分组执行结果、修复追问保留 session_id，未隐式批准。
- `ui-workspace.browser.py`：通过。320/390/768/1440px × 深浅主题、主题持久化、移动抽屉/Escape/焦点、中文 IME、键盘输入、原文/代码/报告复制与失败、reduced-motion、GET 参数、POST 拒绝参数、审批失败后可重试、历史搜索/删除/取消。

已有回放脚本只调整了被本次界面升级改变的选择器（移除装饰 emoji、小屏先打开侧栏、用语义标签定位滚动区），保留原业务断言。

复现：

```bash
make check
npm run preview -- --host 127.0.0.1 --port 5177 --strictPort
# 另一个终端，替换为可用的 Chromium 路径：
python3 tests/ui-workspace.browser.py --url http://127.0.0.1:5177 --chromium /path/to/chrome --screenshots artifacts/ui-refresh
python3 tests/diagnosis-layout.browser.py --url http://127.0.0.1:5177 --chromium /path/to/chrome --verify --screenshots artifacts/ui-refresh/after
python3 tests/autonomous-parallel.browser.py --url http://127.0.0.1:5177 --chromium /path/to/chrome --screenshot artifacts/ui-refresh/parallel-light.png
python3 tests/direct-query.browser.py --url http://127.0.0.1:5177 --chromium /path/to/chrome
python3 tests/remediation-review.browser.py --url http://127.0.0.1:5177 --chromium /path/to/chrome
```

当前运行环境原先缺少 Python Playwright、libasound 和 libgbm。Playwright 安装到 `/tmp/aiops-ui-venv`，浏览器共享库解压到 `/tmp/aiops-browser-libs/root` 并通过临时 `LD_LIBRARY_PATH` 使用，未修改应用 Docker 或部署配置。

## 限制与剩余风险

- 所有最终执行的功能测试均通过。没有运行真实模型/集群联调；需要既有脱敏 JSONL 的 `live-parallel-replay.browser.py` 未运行。没有跨浏览器引擎或真实移动设备验证。
- Vite 仍提示单个 JS chunk 大于 500 kB。基线为 540.30 kB（gzip 180.36 kB），最终为 723.82 kB（gzip 239.59 kB）；新增主题、抽屉、确认交互和代码高亮带来增量。已通过按需注册语言将中间版本的 873.78 kB 降至最终值，未改变部署/构建行为以隐藏告警。
- `npm ci` 报告 12 项依赖漏洞（5 low、1 moderate、6 high），以及 esbuild 安装脚本待策略审核提示。构建实际通过。单独的 `npm audit --json` 请求遇到 registry TLS 断连，未取得完整审计报告，不能声称依赖安全审计通过。本次没有批量升级依赖；锁文件中现有包版本未变，仅新增 Lucide，并将已存在的 highlight.js 声明为直接依赖。
- 主题不增加用户身份、服务端会话同步或后端连接探测；界面仅显示真实请求状态。没有缺少数据时的示意图表、假集群状态或伪进度。

## 截图

[截图浏览页](../artifacts/ui-refresh/index.html) 汇总同一运行页面的改造前后对照，以及深色诊断、分组证据、审批和移动布局。诊断/审批画面来自回放数据，不是线上集群状态。

- [改造前首页](../artifacts/ui-refresh/before-home.png)
- [改造后浅色首页](../artifacts/ui-refresh/home-light-1440.png)
- [改造后深色首页](../artifacts/ui-refresh/home-dark-1440.png)
- [深色诊断](../artifacts/ui-refresh/diagnosis-dark-1440.png)
- [深色修复审查](../artifacts/ui-refresh/approval-dark.png)
- [390px 移动首页](../artifacts/ui-refresh/home-light-390.png)

## 后续部署：0.1.29

2026-10-08 16:33（Asia/Shanghai），按用户后续明确指令完成重新部署。

- 使用现有 `make release`：构建镜像、推送、应用现有 Kubernetes 清单、等待滚动更新。
- 镜像从 `0.1.28` 更新到 `0.1.29`；同步了 `VERSION` 与 `deploy/k8s-simple.yaml` 的 tag，npm 包版本不变。
- 发布镜像 digest：`sha256:cb1e9c62dcdda49dc7f32dbdbd9d3ac01b71803537bea5b95f820510208ebaf5`，运行中 Pod 的 imageID 与推送结果一致。
- Deployment 更新完成，1/1 Ready、0 次重启；Service 保留 NodePort 30081。
- 访问地址：`http://10.2.0.48:30081/`。
- 首页、favicon、JS、CSS 返回 200；线上 JS/CSS SHA-256 与本地已验收的生产构建一致；`/api/health` 返回 healthy。
- 实际部署页面的浅色/深色、主题恢复及 390px 布局冒烟验证通过，没有浏览器异常。
- 在实际部署 URL 上运行 `ui-workspace.browser.py` 通过。诊断与审批请求仍由测试拦截；针对 HTTP 地址补充了测试对原有 execCommand 复制回退路径的观测，真实调用返回成功，复制失败反馈也通过。
- 6 项部署文件测试通过，`git diff --check` 通过。没有执行真实集群诊断/修复，没有提交或推送 Git 改动。
- 实际部署截图：[浅色](../artifacts/ui-refresh/deployed-0.1.29/light.png)、[深色](../artifacts/ui-refresh/deployed-0.1.29/dark.png)、[移动端](../artifacts/ui-refresh/deployed-0.1.29/mobile.png)。

## 首页内容调整：0.1.30

根据用户反馈，将欢迎标题改为“智能运维助手”，恢复具体能力说明：Prometheus CPU/内存查询，以及结合 Pod 日志和 Kubernetes 资源信息分析 ImagePullBackOff、Pending、Terminating 等 Pod 异常。

首页固定为两个入口：“简单查询 / 查询我集群的 CPU 和内存使用率？”和“深度诊断 / 我的集群有什么问题？”。简单查询使用更宽、更高的强调卡片及“常用”标记；移动端优先排列。每个入口显式选择对应的既有 query/ask 模式，并在同一次点击时把模式传入发送函数，避免 React 状态更新尚未生效时使用上一次模式。普通输入和修复追问仍使用当前选中模式。

`make check` 通过（82 项测试、ESLint、TypeScript、构建）。浏览器检查了桌面/手机的深浅主题、卡片尺寸与无溢出，并拦截请求验证两种入口在先前选中相反模式时仍分别发往 `/api/query` 与 `/api/ask`，问题和原有参数策略正确。

已通过 `make release` 发布 `0.1.30`，Deployment 1/1 Ready；原地址 `http://10.2.0.48:30081/` 可访问，API health 为 healthy。实际线上浏览器确认新标题、Pod 说明和两张卡片，无页面异常，未发送真实诊断或修复请求。

[本次线上首页截图](../artifacts/ui-refresh/home-0.1.30/deployed.png)。

## 输入确认与运行中会话切换：0.1.33

2026-10-08，按用户要求完成修改并通过现有 `make release` 重新部署。`0.1.32` 为本轮初次发布；补充延迟审批事件回归后，最终发布版本为 `0.1.33`，保留 `0.1.31` 的指标结果展示改动。

- 首页简单查询、深度诊断卡片仅切换对应模式、填入问题并聚焦输入框；点击不会发请求。修复方案追问也只填入草稿。用户按 Enter 或点击输入框发送按钮才提交，Shift+Enter 和中文输入法行为保留。本节取代上文 `0.1.30` 的点击直接发送行为。
- 每个会话由独立 `ChatSessionPanel` 持有状态和 SSE 连接。运行中可切换会话，后台继续接收，结果按所属 session ID 保存，不会抢回当前页面或串入其他会话；侧栏标记进行中。各会话保留草稿及模式，新建会话、停止或删除某个会话不会中断其他会话。
- 最终报告不等于连接关闭：后台面板保留到流结束，继续接收延迟到达的审批和修复事件。停止、删除后的迟到回调不能恢复已删除会话或覆盖停止结果。SSE 解码、事件协议、请求参数和 localStorage 会话结构保持原有约定。
- `make check` 通过：86 项测试、ESLint、TypeScript 与生产构建。生产预览的诊断布局、并行证据、修复审批、简单查询、工作台、会话切换、指标工具共 7 组浏览器回放通过；补充延迟审批修正后再次通过完整 `make check` 和会话切换回放。
- 最终实际部署 URL 上的 `ui-workspace.browser.py`、`session-switch.browser.py` 通过，包括只填入不发送、Enter/Send 提交、并发会话隔离、后台完成、延迟审批、草稿恢复及停止/删除。测试拦截业务请求，没有执行真实集群诊断或修复。
- Deployment 1/1 Ready、0 次重启，镜像 digest 为 `sha256:5fcd946b2c714f51197264edc7f7a4fbec12e01990bbae542659f60e895e95a2`，运行 Pod 的 imageID 一致。首页、JS、CSS 返回 200，线上资源 SHA-256 与本地构建一致，`/api/health` 为 healthy。
- 访问地址仍为 `http://10.2.0.48:30081/`。已有 Vite 单 chunk 超过 500 kB 提示仍存在。后台继续运行指页面保持打开时，未新增刷新页面后的服务端任务恢复能力；未提交或推送 Git。
