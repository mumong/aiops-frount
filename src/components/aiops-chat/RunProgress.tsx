import { useState, useEffect, useRef } from 'react'
import type { NodeBlock } from './types'
import styles from './MessageList.module.css'

export default function RunProgress({ blocks }: { blocks: NodeBlock[] }) {
  const [now, setNow] = useState(() => Date.now())
  const started = useRef(now)
  const updated = useRef(now)
  // Heartbeats are not model progress. Only visible content/stage changes reset idle time.
  const signature = blocks.map(block => [block.nodeId, block.status, block.thinkingTokens,
    block.runtimeStatus?.text, block.handoffSummary,
    ...block.toolCalls.map(tool => `${tool.id}:${tool.status}`)].join('|')).join('\n')
  useEffect(() => { updated.current = Date.now() }, [signature])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const active = blocks.filter(block => block.status === 'running')
  const pending = active.reduce((count, block) => count + block.toolCalls.filter(tool => tool.status === 'running').length, 0)
  const runtime = active.find(block => block.runtimeStatus)?.runtimeStatus
  const idle = Math.max(0, Math.floor((now - updated.current) / 1000))
  const elapsed = Math.max(0, Math.floor((now - started.current) / 1000))
  const phase = runtime?.text || (pending ? `正在等待 ${pending} 个工具返回`
    : active.some(block => block.nodeId === 'request_router') ? '正在理解任务，等待模型返回路由'
      : active.length ? '正在等待模型返回分析或下一步工具调用' : '请求已提交，正在等待后端事件')
  return <div className={styles.runProgress} aria-label="运行状态">
    <div role="status" aria-live="polite"><span className={styles.progressDot} />{phase}</div>
    <div className={styles.progressMeta}>已用 {elapsed} 秒 · 距上次进展 {idle} 秒</div>
    {idle >= 30 && <div className={styles.progressWarning} role="status">
      暂无新进展，可能正在等待模型或服务响应；不表示操作已成功。可使用下方停止按钮结束等待，写操作中断后需核实是否生效。
    </div>}
    {!blocks.some(block => block.thinkingTokens) && <div className={styles.progressMeta}>尚未收到可展示的分析说明；收到后会自动显示。</div>}
  </div>
}
