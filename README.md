# K8s AIOps Copilot — 前端
![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)

[English](README.en.md) | 简体中文

## 目录
- [项目概述](#项目概述)
- [核心功能](#核心功能)
- [快速开始](#快速开始)
- [架构设计](#架构设计)
- [文档](#文档)
- [许可证](#许可证)

## 项目概述
K8s AIOps Copilot 的聊天前端：用对话方式查询集群、看诊断过程和报告、审批修复。
- 实时展示后端的路由、阶段、工具调用和结论，不在前端猜测结果
- 单集群和多集群使用同一个前端
- 聊天组件 `src/components/aiops-chat/` 可单独嵌入其他页面

## 核心功能
### 对话与诊断
✔️ 自然语言对话，多轮追问，会话管理  
✔️ 诊断过程可展开：阶段、并发组、工具调用及结果，思考过程默认折叠  
✔️ Markdown 报告：结论和根因高亮，代码块、表格  

### 修复与多集群
⚡ 修复工作区：按异常组展示方案，可反馈修改，审批卡片带倒计时，高危命令标红  
⚡ 多集群：按集群分行展示定位和取证，审批卡片显示目标集群  

## 快速开始
### 环境要求
- K8s 部署：`make`、`kubectl`；镜像已发布在 `xnet.registry.io:8443/xnet-cloud/aiops-copilot-frontend:<VERSION>`
- 后端 AIOps 已部署（同一命名空间 `aiops`）；三个服务一起部署的步骤见 Agent 仓库 README「快速开始」
- 本地开发：Node.js 20.19+ / 22.13+ / 24+

### K8s 环境部署
```bash
make deploy                                   # 单集群：同步镜像版本并应用，等待就绪，失败自动回滚
make deploy-mc                                # 多集群中心
echo <新版本号> > VERSION && make release     # 改了代码：构建 → 推送 → 部署
```
访问 `http://<任意节点IP>:30082/`（单集群和多集群相同）。

### 本地运行
```bash
npm ci
npm run dev        # http://localhost:5173，API 代理到 VITE_PROXY_TARGET（默认 http://10.2.0.48:30800）
make check         # 测试 + lint + 构建
```

## 架构设计
```
浏览器 ──> Nginx（:30082）──┬─ 静态页面
                           └─ /api/* ──> aiops-copilot.aiops.svc:8000（/ask SSE、/repair/*、/health）
```

## 文档
| 文档 | 内容 |
|---|---|
| [开发与部署说明](docs/GUIDE.md) | 功能细节、技术栈、项目结构、常用命令、依赖的后端接口、开发约定 |
| [测试指南](docs/testing.md) | 单元测试与浏览器回放 |

## 许可证
[Apache License 2.0](LICENSE)。第三方代码保留各自的许可证。
