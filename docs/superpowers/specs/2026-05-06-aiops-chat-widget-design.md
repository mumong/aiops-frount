# AIOps Chat Widget — 设计文档

## 1. 概述

为 K8s AIOps Copilot 后端（robusta）开发一个 React 聊天组件前端。
核心设计目标是**独立的可嵌入 React 组件**，通过 props 配置即可接入任何 React 项目。

## 2. 后端 API 参照

| 端点 | 用途 | 工作流 |
|------|------|--------|
| `GET/POST /ask?q=...&format=sse` | 诊断入口 | layer → evidence → rca → conclusion |
| `GET/POST /query?q=...&format=sse` | 查询入口 | layer → conclusion |

参数：
- `q`: 问题（URL 编码）
- `format`: `sse`（前端使用）或 `text`（终端风格）
- `stream`: 默认 `true`

### SSE 事件格式

```
event: run_start       data: {"run_id": "..."}
event: node_start      data: {"node": "layer", "node_name": "问题定位"}
event: thinking        data: {"node": "...", "thinking_type": "ai_token", "content": "..."}
event: thinking        data: {"node": "...", "thinking_type": "tool_start", "tool_name": "..."}
event: thinking        data: {"node": "...", "thinking_type": "tool_result", "tool_name": "...", "status": "success"}
event: heartbeat       data: {"node": "..."}
event: node_complete   data: {"node": "layer", "duration_seconds": 17.3, ...}
event: final           data: {"answer": "...markdown...", "elapsed_seconds": 310.9}
event: error           data: {"error": "..."}
```

## 3. 组件架构

```
ChatWidget
├── ChatHeader        — 标题栏 + 连接状态指示器
├── MessageList       — 消息列表（auto-scroll）
│   ├── UserMessage   — 用户问句气泡
│   └── BotMessage    — 机器人回复
│       ├── StageIndicator   — 阶段进度（📍问题定位 ✅完成）
│       ├── StreamingTokens  — 实时打字效果文本
│       ├── ToolCallCard     — 工具调用卡片（工具名+状态+预览）
│       └── MarkdownReport   — 最终 Markdown 渲染报告
├── ErrorBoundary     — 组件级别错误兜底
└── MessageInput      — 输入框 + 发送按钮
```

**可迁移性设计**：整个组件树以 `ChatWidget` 为单一导出入口，通过 props 声明所有外部依赖：

```tsx
interface ChatWidgetProps {
  apiBase: string;        // 后端地址，如 "http://10.2.0.48:30800"
  title?: string;         // 标题，默认 "K8s AIOps Copilot"
  placeholder?: string;   // 输入框占位文本
  maxMessages?: number;   // 消息列表上限
}
```

使用者只需：
```tsx
import { ChatWidget } from '@/components/aiops-chat'
<ChatWidget apiBase="http://10.2.0.48:30800" />
```

## 4. 端点选择策略

前端默认使用 `/ask` 端点（完整诊断工作流），但用户可以在输入框旁用下拉菜单/标签切换：

| 模式 | 端点 | 适用场景 |
|------|------|----------|
| 🔍 诊断（默认） | `/ask` | "我的集群有什么问题"、"为什么 Pod 重启" |
| 📊 查询 | `/query` | "CPU/内存使用率是多少"、"Pod 列表" |

这个切换不影响组件的核心渲染逻辑——两种端点返回相同的 SSE 事件格式，只是节点数量和内容不同。

## 5. 跨域（CORS）处理

前端开发时在 `localhost:5173`，后端在 `10.2.0.48:30800`，浏览器会因同源策略拦截。通过 Vite dev server 代理解决：

```
浏览器 → localhost:5173/api/ask → Vite proxy → http://10.2.0.48:30800/ask
```

用户无感知，前端代码中 API 路径直接写 `/api/ask`，Vite 自动转发。
正式发布时（nginx + 同源部署）不存在此问题。

## 6. 流式渲染机制

1. 用户发送问题 → POST `/ask` 或 `/query`（带 `format=sse` 参数）
2. 使用 `fetch()` + `ReadableStream` 读取 SSE 流
3. 按事件类型分发渲染：
   - `ai_token` → 追加到当前 StreamingTokens 区域（打字机效果）
   - `tool_start` → 插入 ToolCallCard（蓝色，显示工具名）
   - `tool_result` → 更新 ToolCallCard 状态（✅成功/❌失败）+ 预览摘要
   - `node_complete` → StageIndicator 标记完成 + 耗时
   - `heartbeat` → 显示 "⏳ 仍在处理..."
   - `final` → 将 StreamingTokens 替换为 MarkdownReport
   - `error` → 显示错误提示

## 7. 技术栈

| 层 | 选择 | 原因 |
|---|---|---|
| 框架 | React 18 + TypeScript | 组件化，类型安全 |
| 构建 | Vite 5 | 开发快，lib 模式可导出组件 |
| 流式 | fetch + ReadableStream | 支持 GET/POST，比 EventSource 灵活 |
| Markdown | react-markdown + rehype-highlight | 渲染诊断报告（表格、代码块） |
| 样式 | CSS Modules | 样式隔离，不污染父项目 |
| ESLint | 默认 Vite ESLint 配置 | 保持代码规范 |

## 8. 目录结构

```
frountind/
├── src/
│   ├── main.tsx              # 独立运行入口（dev 预览用）
│   ├── components/
│   │   └── aiops-chat/
│   │       ├── index.tsx         # ChatWidget 主出口
│   │       ├── ChatWidget.tsx    # 容器组件
│   │       ├── ChatHeader.tsx
│   │       ├── ChatHeader.module.css
│   │       ├── MessageList.tsx
│   │       ├── MessageList.module.css
│   │       ├── UserMessage.tsx
│   │       ├── BotMessage.tsx
│   │       ├── BotMessage.module.css
│   │       ├── StageIndicator.tsx
│   │       ├── StreamingTokens.tsx
│   │       ├── ToolCallCard.tsx
│   │       ├── ToolCallCard.module.css
│   │       ├── MarkdownReport.tsx
│   │       ├── MarkdownReport.module.css
│   │       ├── MessageInput.tsx
│   │       ├── MessageInput.module.css
│   │       └── types.ts          # SSE 事件类型定义
│   ├── hooks/
│   │   └── useSSE.ts             # SSE 流消费 Hook
│   └── App.tsx                   # 开发入口
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── vite.config.ts
└── vite.lib.config.ts            # Library 模式构建配置
```

## 9. 部署方式

### 本地开发预览（方案 A）
```bash
# VM 中
cd frountind
npm install
npm run dev
# 绑定 0.0.0.0 后，本机浏览器访问 http://10.2.0.48:5173
```

### K8s 正式部署（方案 B）
1. `npm run build` → `dist/` 目录
2. nginx Dockerfile 承载静态文件
3. 部署到 K8s + Service NodePort

## 10. 阶段规划

### Phase 1 — 核心聊天功能（本设计文档范围）
- 完整的 ChatWidget 组件
- SSE 流式渲染（打字机效果）
- Markdown 报告渲染
- 工具调用卡片展示
- Vite 开发服务器预览

### Phase 2 — 增强（未来可选）
- 对话历史管理
- 主题定制（深色模式）
- 联邦集群切换
- 报告导出 / 分享

## 11. 不做（明确 YAGNI）

- 不实现用户登录/鉴权（由父项目处理）
- 不实现 websocket（后端 SSE 已够用）
- 不实现多轮对话持久化（第一版仅内存会话）
- 不实现 i18n 国际化（后端语言决定）
