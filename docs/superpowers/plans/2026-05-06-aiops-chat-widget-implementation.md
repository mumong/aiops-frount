# AIOps Chat Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable React chat widget that consumes robusta backend SSE streaming API.

**Architecture:** Single-page Vite + React 18 app bootstrapped manually. All component code lives under `src/components/aiops-chat/` for easy extraction as a library. The dev server proxies `/api/*` to `http://10.2.0.48:30800/*` to avoid CORS issues.

**Tech Stack:** React 18, TypeScript, Vite 5, CSS Modules, react-markdown + rehype-highlight, fetch + ReadableStream for SSE

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/vite-env.d.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/App.module.css`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "aiops-chat-widget",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 0.0.0.0",
    "lint": "eslint ."
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^9.0.3",
    "rehype-highlight": "^7.0.1",
    "remark-gfm": "^4.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "~5.6.2",
    "vite": "^6.0.1"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

- [ ] **Step 3: Create tsconfig.app.json**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create vite.config.ts**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://10.2.0.48:30800',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

- [ ] **Step 6: Create index.html**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>K8s AIOps Copilot</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create src/vite-env.d.ts**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 8: Create src/main.tsx**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 9: Create src/App.tsx (development entry)**

```tsx
import ChatWidget from './components/aiops-chat'
import styles from './App.module.css'

function App() {
  return (
    <div className={styles.container}>
      <ChatWidget
        apiBase="/api"
        title="K8s AIOps Copilot"
        placeholder="输入你的运维问题，例如：我的集群有什么问题？"
      />
    </div>
  )
}

export default App
```

- [ ] **Step 10: Create src/App.module.css**

```css
.container {
  max-width: 800px;
  height: 100vh;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: #f5f5f5;
  color: #1a1a1a;
}
```

- [ ] **Step 11: Install dependencies**

Run: `cd /root/huhu/agent/combine-aiops-mcp/frountind && npm install`
Expected: `package-lock.json` and `node_modules/` created with no errors.

- [ ] **Step 12: Verify dev server starts**

Run: `cd /root/huhu/agent/combine-aiops-mcp/frountind && timeout 10 npm run dev 2>&1 || true`
Expected: output contains "vite v6.x.x dev server running at: http://localhost:5173" and no error logs.

- [ ] **Step 13: Commit scaffold**

```bash
git add package.json tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html src/vite-env.d.ts src/main.tsx src/App.tsx src/App.module.css package-lock.json
git commit -m "scaffold: init Vite + React 18 + TypeScript project"
```

---

### Task 2: SSE Types & Streaming Hook

**Files:**
- Create: `src/components/aiops-chat/types.ts`
- Create: `src/hooks/useSSE.ts`

- [ ] **Step 1: Create SSE type definitions**

`src/components/aiops-chat/types.ts`:

```ts
/** SSE events from the robusta backend */
export type SSEEvent = 
  | RunStartEvent
  | NodeStartEvent
  | ThinkingEvent
  | HeartbeatEvent
  | NodeCompleteEvent
  | FinalEvent
  | ErrorEvent

export interface RunStartEvent {
  type: 'run_start'
  run_id: string
}

export interface NodeStartEvent {
  type: 'node_start'
  node: string
  node_name: string
}

export interface ThinkingEvent {
  type: 'thinking'
  node: string
  node_name?: string
  thinking_type: 'ai_message' | 'ai_token' | 'tool_start' | 'tool_result' | 'iteration_end'
  content?: string
  tool_name?: string
  status?: string
  result_preview?: string
  iteration?: number
}

export interface HeartbeatEvent {
  type: 'heartbeat'
  node: string
}

export interface NodeCompleteEvent {
  type: 'node_complete'
  node: string
  node_name?: string
  duration_seconds?: number
  state_snapshot?: Record<string, unknown>
  handoff_summary?: string
}

export interface FinalEvent {
  type: 'final'
  answer?: string
  metrics?: Record<string, unknown>
  elapsed_seconds?: number
}

export interface ErrorEvent {
  type: 'error'
  error: string
}

/** Parsed SSE line pair: event type + JSON data */
export interface SSEMessage {
  event: string
  data: string
}

/** A single message in the chat */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  status?: 'streaming' | 'complete' | 'error'
}

/** Tool call record displayed during streaming */
export interface ToolCall {
  id: string
  toolName: string
  status: 'running' | 'success' | 'error'
  resultPreview?: string
}

/** Node progress during workflow */
export interface NodeProgress {
  nodeId: string
  nodeName: string
  status: 'running' | 'complete'
  durationSeconds?: number
}
```

- [ ] **Step 2: Create the SSE streaming hook**

`src/hooks/useSSE.ts`:

```ts
import { useRef, useCallback } from 'react'
import { SSEMessage } from '../components/aiops-chat/types'

/**
 * Consume a ReadableStream from fetch() as SSE events.
 * Returns an abort function.
 */
export function useSSE() {
  const abortRef = useRef<AbortController | null>(null)

  const connect = useCallback((
    url: string,
    options: { method?: 'GET' | 'POST'; body?: URLSearchParams },
    onEvent: (msg: SSEMessage) => void,
    onError: (err: Error) => void,
    onComplete: () => void,
  ): (() => void) => {
    // Abort any previous connection
    if (abortRef.current) {
      abortRef.current.abort()
    }

    const controller = new AbortController()
    abortRef.current = controller

    const params = options.body
      ? options.body.toString()
      : undefined

    const fetchUrl = params ? `${url}?${params}` : url

    const run = async () => {
      try {
        const response = await fetch(fetchUrl, {
          method: 'GET',
          headers: { 'Accept': 'text/event-stream' },
          signal: controller.signal,
        })

        if (!response.ok) {
          onError(new Error(`HTTP ${response.status}: ${response.statusText}`))
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          onError(new Error('Response body is not readable'))
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE line by line
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (currentEvent && data) {
                onEvent({ event: currentEvent, data })
              }
              currentEvent = ''
            } else if (line === '') {
              // Empty line = end of event block, ignore
              currentEvent = ''
            }
          }
        }

        onComplete()
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          onError(err)
        }
      }
    }

    run()
    return () => controller.abort()
  }, [])

  const disconnect = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  return { connect, disconnect }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/aiops-chat/types.ts src/hooks/useSSE.ts
git commit -m "feat: add SSE type definitions and streaming hook"
```

---

### Task 3: ChatWidget Container Component

**Files:**
- Create: `src/components/aiops-chat/index.ts`
- Create: `src/components/aiops-chat/ChatWidget.tsx`
- Create: `src/components/aiops-chat/ChatWidget.module.css`

- [ ] **Step 1: Create barrel export**

`src/components/aiops-chat/index.ts`:
```ts
export { default } from './ChatWidget'
export type { ChatWidgetProps } from './ChatWidget'
```

- [ ] **Step 2: Create ChatWidget container**

`src/components/aiops-chat/ChatWidget.tsx`:
```tsx
import { useState, useCallback, useRef } from 'react'
import { ChatMessage, ToolCall, NodeProgress, SSEMessage } from './types'
import { useSSE } from '../../hooks/useSSE'
import ChatHeader from './ChatHeader'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import styles from './ChatWidget.module.css'

export interface ChatWidgetProps {
  apiBase: string
  title?: string
  placeholder?: string
  maxMessages?: number
}

type EndpointMode = 'ask' | 'query'

export default function ChatWidget({
  apiBase,
  title = 'K8s AIOps Copilot',
  placeholder = '输入你的运维问题...',
  maxMessages = 50,
}: ChatWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [endpointMode, setEndpointMode] = useState<EndpointMode>('ask')
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([])
  const [nodeProgress, setNodeProgress] = useState<NodeProgress[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const toolIdCounter = useRef(0)
  const messageIdCounter = useRef(0)

  const { connect, disconnect } = useSSE()

  const sendMessage = useCallback((question: string) => {
    if (!question.trim() || isStreaming) return

    const newMsg: ChatMessage = {
      id: `msg-${++messageIdCounter.current}`,
      role: 'user',
      content: question,
      timestamp: Date.now(),
    }

    // Add assistant placeholder
    const assistantMsg: ChatMessage = {
      id: `msg-${++messageIdCounter.current}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
    }

    setMessages(prev => [...prev.slice(-maxMessages + 2), newMsg, assistantMsg])
    setIsStreaming(true)
    setStreamingContent('')
    setToolCalls([])
    setNodeProgress([])
    toolIdCounter.current = 0

    const params = new URLSearchParams({
      q: question,
      format: 'sse',
      stream: 'true',
    })

    connect(
      `${apiBase}/${endpointMode}`,
      { method: 'GET', body: params },
      (msg: SSEMessage) => {
        handleSSEEvent(msg, assistantMsg.id)
      },
      (err: Error) => {
        setStreamingContent(`❌ 错误: ${err.message}`)
        setIsStreaming(false)
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id ? { ...m, status: 'error', content: `❌ 错误: ${err.message}` } : m
          )
        )
      },
      () => {
        setIsStreaming(false)
      }
    )
  }, [apiBase, endpointMode, isStreaming, connect, maxMessages])

  const handleSSEEvent = useCallback((msg: SSEMessage, assistantId: string) => {
    let data: Record<string, unknown>
    try {
      data = JSON.parse(msg.data)
    } catch {
      return
    }

    switch (msg.event) {
      case 'run_start':
        break

      case 'node_start': {
        const nodeId = String(data.node || '')
        const nodeName = String(data.node_name || data.node || '')
        setNodeProgress(prev => [
          ...prev,
          { nodeId, nodeName, status: 'running' },
        ])
        break
      }

      case 'thinking': {
        const thinkType = String(data.thinking_type || '')
        const nodeName = String(data.node_name || data.node || '')

        if (thinkType === 'ai_token') {
          const content = String(data.content || '')
          setStreamingContent(prev => prev + content)
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? { ...m, content: prev.find(p => p.id === assistantId)?.content || '' + content }
                : m
            )
          )
        } else if (thinkType === 'ai_message') {
          const content = String(data.content || '')
          setStreamingContent(prev => prev + content)
        } else if (thinkType === 'tool_start') {
          const toolName = String(data.tool_name || '')
          const toolCall: ToolCall = {
            id: `tool-${++toolIdCounter.current}`,
            toolName,
            status: 'running',
          }
          setToolCalls(prev => [...prev, toolCall])
        } else if (thinkType === 'tool_result') {
          const toolName = String(data.tool_name || '')
          const status = String(data.status || 'success')
          const preview = String(data.result_preview || '')
          setToolCalls(prev =>
            prev.map(t =>
              t.toolName === toolName && t.status === 'running'
                ? { ...t, status: status === 'success' ? 'success' : 'error', resultPreview: preview }
                : t
            )
          )
        }
        break
      }

      case 'heartbeat':
        break

      case 'node_complete': {
        const nodeId = String(data.node || '')
        const duration = Number(data.duration_seconds || 0)
        setNodeProgress(prev =>
          prev.map(n =>
            n.nodeId === nodeId ? { ...n, status: 'complete', durationSeconds: duration } : n
          )
        )
        break
      }

      case 'final': {
        const answer = String(data.answer || '')
        setStreamingContent(answer)
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: answer, status: 'complete' }
              : m
          )
        )
        break
      }

      case 'error': {
        const errorMsg = String(data.error || '未知错误')
        setStreamingContent(`❌ 错误: ${errorMsg}`)
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, status: 'error', content: `❌ ${errorMsg}` } : m
          )
        )
        setIsStreaming(false)
        break
      }
    }
  }, [])

  const handleStop = useCallback(() => {
    disconnect()
    setIsStreaming(false)
    setMessages(prev =>
      prev.map(m =>
        m.status === 'streaming' ? { ...m, status: 'complete' } : m
      )
    )
  }, [disconnect])

  return (
    <div className={styles.widget}>
      <ChatHeader
        title={title}
        isConnected={!isStreaming}
        endpointMode={endpointMode}
        onEndpointChange={setEndpointMode}
      />
      <MessageList
        messages={messages}
        toolCalls={toolCalls}
        nodeProgress={nodeProgress}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
      />
      <MessageInput
        onSend={sendMessage}
        onStop={handleStop}
        isStreaming={isStreaming}
        placeholder={placeholder}
        endpointMode={endpointMode}
      />
    </div>
  )
}
```

- [ ] **Step 3: Create ChatWidget styles**

`src/components/aiops-chat/ChatWidget.module.css`:
```css
.widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/aiops-chat/index.ts src/components/aiops-chat/ChatWidget.tsx src/components/aiops-chat/ChatWidget.module.css
git commit -m "feat: add ChatWidget container component with SSE integration"
```

---

### Task 4: ChatHeader Component

**Files:**
- Create: `src/components/aiops-chat/ChatHeader.tsx`
- Create: `src/components/aiops-chat/ChatHeader.module.css`

- [ ] **Step 1: Create ChatHeader**

`src/components/aiops-chat/ChatHeader.tsx`:
```tsx
import styles from './ChatHeader.module.css'

interface ChatHeaderProps {
  title: string
  isConnected: boolean
  endpointMode: 'ask' | 'query'
  onEndpointChange: (mode: 'ask' | 'query') => void
}

export default function ChatHeader({ title, isConnected, endpointMode, onEndpointChange }: ChatHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.left}>
        <span className={styles.icon}>🤖</span>
        <span className={styles.title}>{title}</span>
        <span className={`${styles.dot} ${isConnected ? styles.dotConnected : styles.dotDisconnected}`} />
      </div>
      <div className={styles.endpointSwitch}>
        <button
          className={`${styles.switchBtn} ${endpointMode === 'ask' ? styles.active : ''}`}
          onClick={() => onEndpointChange('ask')}
        >
          🔍 诊断
        </button>
        <button
          className={`${styles.switchBtn} ${endpointMode === 'query' ? styles.active : ''}`}
          onClick={() => onEndpointChange('query')}
        >
          📊 查询
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create ChatHeader styles**

`src/components/aiops-chat/ChatHeader.module.css`:
```css
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
  background: #fafafa;
}

.left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon {
  font-size: 20px;
}

.title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dotConnected {
  background: #52c41a;
}

.dotDisconnected {
  background: #faad14;
}

.endpointSwitch {
  display: flex;
  gap: 4px;
  background: #f0f0f0;
  border-radius: 6px;
  padding: 2px;
}

.switchBtn {
  border: none;
  background: transparent;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  color: #666;
  transition: all 0.2s;
}

.switchBtn:hover {
  color: #333;
}

.active {
  background: #fff;
  color: #1677ff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/aiops-chat/ChatHeader.tsx src/components/aiops-chat/ChatHeader.module.css
git commit -m "feat: add ChatHeader with endpoint mode switch"
```

---

### Task 5: MessageInput Component

**Files:**
- Create: `src/components/aiops-chat/MessageInput.tsx`
- Create: `src/components/aiops-chat/MessageInput.module.css`

- [ ] **Step 1: Create MessageInput**

`src/components/aiops-chat/MessageInput.tsx`:
```tsx
import { useState, useCallback } from 'react'
import styles from './MessageInput.module.css'

interface MessageInputProps {
  onSend: (text: string) => void
  onStop: () => void
  isStreaming: boolean
  placeholder: string
  endpointMode: 'ask' | 'query'
}

export default function MessageInput({ onSend, onStop, isStreaming, placeholder }: MessageInputProps) {
  const [text, setText] = useState('')

  const handleSubmit = useCallback(() => {
    if (!text.trim() || isStreaming) return
    onSend(text.trim())
    setText('')
  }, [text, isStreaming, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  return (
    <div className={styles.inputArea}>
      <div className={styles.inputRow}>
        <textarea
          className={styles.input}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button className={styles.stopBtn} onClick={onStop}>
            ⏹ 停止
          </button>
        ) : (
          <button
            className={styles.sendBtn}
            onClick={handleSubmit}
            disabled={!text.trim()}
          >
            🚀 发送
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create MessageInput styles**

`src/components/aiops-chat/MessageInput.module.css`:
```css
.inputArea {
  padding: 12px 16px;
  border-top: 1px solid #eee;
  background: #fafafa;
}

.inputRow {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
  font-family: inherit;
  transition: border-color 0.2s;
  max-height: 120px;
}

.input:focus {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1);
}

.input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.sendBtn,
.stopBtn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.sendBtn {
  background: #1677ff;
  color: #fff;
}

.sendBtn:hover:not(:disabled) {
  background: #4096ff;
}

.sendBtn:disabled {
  background: #d9d9d9;
  cursor: not-allowed;
}

.stopBtn {
  background: #ff4d4f;
  color: #fff;
}

.stopBtn:hover {
  background: #ff7875;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/aiops-chat/MessageInput.tsx src/components/aiops-chat/MessageInput.module.css
git commit -m "feat: add MessageInput with send/stop controls"
```

---

### Task 6: MessageList + UserMessage Components

**Files:**
- Create: `src/components/aiops-chat/MessageList.tsx`
- Create: `src/components/aiops-chat/MessageList.module.css`
- Create: `src/components/aiops-chat/UserMessage.tsx`

- [ ] **Step 1: Create UserMessage**

`src/components/aiops-chat/UserMessage.tsx`:
```tsx
import styles from './MessageList.module.css'

interface UserMessageProps {
  content: string
}

export default function UserMessage({ content }: UserMessageProps) {
  return (
    <div className={styles.userRow}>
      <div className={styles.userBubble}>
        {content}
      </div>
      <span className={styles.avatar}>👤</span>
    </div>
  )
}
```

- [ ] **Step 2: Create MessageList**

`src/components/aiops-chat/MessageList.tsx`:
```tsx
import { useEffect, useRef } from 'react'
import { ChatMessage, ToolCall, NodeProgress } from './types'
import UserMessage from './UserMessage'
import BotMessage from './BotMessage'
import styles from './MessageList.module.css'

interface MessageListProps {
  messages: ChatMessage[]
  toolCalls: ToolCall[]
  nodeProgress: NodeProgress[]
  isStreaming: boolean
  streamingContent: string
}

export default function MessageList({ messages, toolCalls, nodeProgress, isStreaming, streamingContent }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, toolCalls, nodeProgress])

  return (
    <div className={styles.list}>
      {messages.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🤖</div>
          <p className={styles.emptyText}>输入运维问题，开始诊断分析</p>
          <p className={styles.emptyHint}>例如：我的集群有什么问题？</p>
        </div>
      )}
      {messages.map(msg => (
        msg.role === 'user'
          ? <UserMessage key={msg.id} content={msg.content} />
          : (
            <BotMessage
              key={msg.id}
              message={msg}
              toolCalls={msg.id === messages[messages.length - 1]?.id ? toolCalls : []}
              nodeProgress={msg.id === messages[messages.length - 1]?.id ? nodeProgress : []}
              streamingContent={msg.id === messages[messages.length - 1]?.id ? streamingContent : ''}
              isLatest={msg.id === messages[messages.length - 1]?.id}
            />
          )
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
```

- [ ] **Step 3: Create MessageList styles**

`src/components/aiops-chat/MessageList.module.css`:
```css
.list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  scroll-behavior: smooth;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
  gap: 8px;
}

.emptyIcon {
  font-size: 48px;
  margin-bottom: 8px;
}

.emptyText {
  font-size: 16px;
  color: #666;
}

.emptyHint {
  font-size: 13px;
  color: #bbb;
}

/* User message styles */
.userRow {
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 16px;
}

.userBubble {
  max-width: 70%;
  padding: 10px 14px;
  background: #1677ff;
  color: #fff;
  border-radius: 12px 12px 4px 12px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.avatar {
  font-size: 24px;
  flex-shrink: 0;
}

/* Bot message styles */
.botRow {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 16px;
}

.botAvatar {
  font-size: 24px;
  flex-shrink: 0;
}

.botContent {
  flex: 1;
  max-width: calc(100% - 40px);
}

.botBubble {
  padding: 12px 16px;
  background: #f6f8fa;
  border-radius: 12px 12px 12px 4px;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
  word-break: break-word;
}

/* Streaming content styles */
.streamingContent {
  white-space: pre-wrap;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
}

/* Tool call card styles */
.toolCalls {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.toolCall {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #f0f5ff;
  border-radius: 4px;
  font-size: 12px;
  color: #666;
}

.toolCallRunning {
  color: #1677ff;
}

.toolCallSuccess {
  color: #52c41a;
}

.toolCallError {
  color: #ff4d4f;
}

.toolCallName {
  font-weight: 500;
}

.toolCallPreview {
  color: #999;
  margin-left: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}

/* Node progress styles */
.nodeProgress {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.nodeTag {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.nodeRunning {
  background: #e6f4ff;
  color: #1677ff;
}

.nodeComplete {
  background: #f6ffed;
  color: #52c41a;
}

/* Markdown report styles */
.markdownReport {
  margin-top: 8px;
}

.markdownReport h2 {
  font-size: 18px;
  margin: 16px 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #eee;
}

.markdownReport h3 {
  font-size: 15px;
  margin: 12px 0 6px;
}

.markdownReport h4 {
  font-size: 14px;
  margin: 8px 0 4px;
}

.markdownReport p {
  margin: 6px 0;
  line-height: 1.6;
}

.markdownReport table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 13px;
}

.markdownReport th,
.markdownReport td {
  border: 1px solid #e0e0e0;
  padding: 6px 10px;
  text-align: left;
}

.markdownReport th {
  background: #f5f5f5;
  font-weight: 600;
}

.markdownReport code {
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 13px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.markdownReport pre {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

.markdownReport pre code {
  background: none;
  padding: 0;
  color: inherit;
}

.markdownReport ul,
.markdownReport ol {
  margin: 6px 0;
  padding-left: 20px;
  line-height: 1.6;
}

.markdownReport li {
  margin: 3px 0;
}

.markdownReport blockquote {
  border-left: 3px solid #1677ff;
  padding-left: 12px;
  margin: 8px 0;
  color: #666;
}

.markdownReport hr {
  border: none;
  border-top: 1px solid #eee;
  margin: 16px 0;
}

/* Error state */
.errorBubble {
  background: #fff2f0;
  border: 1px solid #ffccc7;
  color: #ff4d4f;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/aiops-chat/MessageList.tsx src/components/aiops-chat/MessageList.module.css src/components/aiops-chat/UserMessage.tsx
git commit -m "feat: add MessageList and UserMessage components"
```

---

### Task 7: BotMessage Component

**Files:**
- Create: `src/components/aiops-chat/BotMessage.tsx`

- [ ] **Step 1: Create BotMessage**

`src/components/aiops-chat/BotMessage.tsx`:
```tsx
import { ChatMessage, ToolCall, NodeProgress } from './types'
import styles from './MessageList.module.css'

interface BotMessageProps {
  message: ChatMessage
  toolCalls: ToolCall[]
  nodeProgress: NodeProgress[]
  streamingContent: string
  isLatest: boolean
}

export default function BotMessage({ message, toolCalls, nodeProgress, streamingContent, isLatest }: BotMessageProps) {
  const isStreaming = message.status === 'streaming'
  const isError = message.status === 'error'

  return (
    <div className={styles.botRow}>
      <span className={styles.botAvatar}>🤖</span>
      <div className={styles.botContent}>
        {isLatest && nodeProgress.length > 0 && (
          <div className={styles.nodeProgress}>
            {nodeProgress.map(np => (
              <span
                key={np.nodeId}
                className={`${styles.nodeTag} ${np.status === 'running' ? styles.nodeRunning : styles.nodeComplete}`}
              >
                {np.status === 'running' ? '⏳' : '✅'} {np.nodeName}
                {np.durationSeconds ? ` (${np.durationSeconds.toFixed(1)}s)` : ''}
              </span>
            ))}
          </div>
        )}

        <div className={`${styles.botBubble} ${isError ? styles.errorBubble : ''}`}>
          {isStreaming && isLatest ? (
            <div className={styles.streamingContent}>
              {streamingContent || '⏳ 等待响应...'}
            </div>
          ) : isError ? (
            <div>{message.content}</div>
          ) : message.status === 'complete' && message.content ? (
            <div className={styles.markdownReport}>
              <SimpleMarkdown content={message.content} />
            </div>
          ) : message.content ? (
            <div className={styles.streamingContent}>{message.content}</div>
          ) : null}
        </div>

        {isLatest && toolCalls.length > 0 && (
          <div className={styles.toolCalls}>
            {toolCalls.map(tc => (
              <div key={tc.id} className={styles.toolCall}>
                <span className={
                  tc.status === 'running' ? styles.toolCallRunning
                  : tc.status === 'success' ? styles.toolCallSuccess
                  : styles.toolCallError
                }>
                  {tc.status === 'running' ? '⏳' : tc.status === 'success' ? '✅' : '❌'}
                </span>
                <span className={styles.toolCallName}>{tc.toolName}</span>
                {tc.resultPreview && (
                  <span className={styles.toolCallPreview}>{tc.resultPreview.slice(0, 80)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Simple Markdown renderer without heavy dependencies */
function SimpleMarkdown({ content }: { content: string }) {
  // Split by code blocks first
  const parts = content.split(/(```[\s\S]*?```)/g)

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const lines = part.split('\n')
          const lang = lines[0].slice(3).trim()
          const code = lines.slice(1, -1).join('\n')
          return (
            <pre key={i}>
              {lang && <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>{lang}</div>}
              <code>{code}</code>
            </pre>
          )
        }

        // Process inline elements
        const html = part
          // Headers
          .replace(/^### (.+)$/gm, '<h3>$1</h3>')
          .replace(/^## (.+)$/gm, '<h2>$1</h2>')
          .replace(/^# (.+)$/gm, '<h1>$1</h1>')
          // Bold
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          // Inline code
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          // Tables
          .replace(/\|(.+)\|/g, (match) => {
            if (match.includes('---')) return ''
            const cells = match.split('|').filter(c => c.trim())
            if (cells.length === 0) return ''
            return `<tr>${cells.map(c => `<td>${c.trim()}</td>`).join('')}</tr>`
          })
          // Horizontal rules
          .replace(/^---$/gm, '<hr />')
          // Blockquotes
          .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
          // Line breaks
          .replace(/\n\n/g, '</p><p>')
          .replace(/\n/g, '<br />')

        return <p key={i} dangerouslySetInnerHTML={{ __html: html }} />
      })}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/aiops-chat/BotMessage.tsx
git commit -m "feat: add BotMessage with streaming and markdown rendering"
```

---

### Task 8: Self-Review and Verification

- [ ] **Step 1: Verify dev server builds and runs**

Run: `cd /root/huhu/agent/combine-aiops-mcp/frountind && npm run build 2>&1`
Expected: Exit code 0, `dist/` directory created with `index.html` + JS/CSS assets.

- [ ] **Step 2: Verify components cover all spec requirements**

Checklist:
- ChatWidget receives `apiBase` prop → Task 3
- ChatHeader shows title + connection status + endpoint mode switch → Task 4
- MessageInput sends text on Enter/click, stops streaming → Task 5
- MessageList auto-scrolls to bottom → Task 6
- BotMessage renders streaming tokens (ai_token events) → Task 7
- BotMessage shows tool call cards (tool_start/tool_result) → Task 7
- BotMessage shows node progress tags → Task 7
- BotMessage renders final report as Markdown → Task 7
- Vite proxy forwards /api/* to backend → Task 1

- [ ] **Step 3: Commit final build config**

```bash
git add -A
git commit -m "chore: finalize initial implementation"
```
