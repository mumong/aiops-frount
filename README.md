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

## 本地开发

### 前置要求

- Node.js >= 18
- pnpm（推荐）或 npm

### 安装依赖

```bash
npm install
# 或
pnpm install
```

### 启动开发服务器

```bash
npm run dev
```

开发服务器默认绑定 `0.0.0.0:5173`，API 请求通过 Vite proxy 转发到后端（默认目标 `http://10.2.0.48:30800`）。

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

## 部署

### 方式一：静态托管（Nginx / CDN）

构建后将 `dist/` 目录部署到任意静态 Web 服务器：

```bash
npm run build
# 将 dist/ 上传到服务器
```

Nginx 配置示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /path/to/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理（可选）
    location /api/ {
        proxy_pass http://your-backend:30800/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 方式二：Docker

```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

或使用现有多阶段构建方案（按需添加 `Dockerfile`）。

### 方式三：Kubernetes（与后端同集群部署）

将构建产物容器化后部署到 K8s 集群，API 通过 Service 名内网直连后端，无需外部代理。

## 环境要求

无硬性环境依赖。前端纯静态，API 请求直接发往配置的后端地址。后端需要暴露以下接口：

- `POST /chat` — 发送对话消息
- `GET /sessions` — 获取会话列表
- `POST /sessions` — 创建新会话
- `DELETE /sessions/:id` — 删除会话

## 开发约定

- 组件使用 CSS Modules 样式隔离
- 文件名：React 组件 `PascalCase`，工具函数 `camelCase`
- 缩进 2 空格

## License

MIT
