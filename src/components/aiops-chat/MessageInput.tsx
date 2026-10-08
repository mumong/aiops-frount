import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { ArrowUp, Square, Activity, Search } from 'lucide-react'
import type { EndpointMode } from './types'
import styles from './MessageInput.module.css'

interface MessageInputProps {
  onSend: (text: string) => void
  onStop: () => void
  isStreaming: boolean
  placeholder: string
  endpointMode: EndpointMode
  draft?: { text: string } | null
  initialText?: string
  onTextChange?: (text: string) => void
}

export default function MessageInput({ onSend, onStop, isStreaming, placeholder, endpointMode, draft, initialText = '', onTextChange }: MessageInputProps) {
  const [text, setText] = useState(initialText)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { onTextChange?.(text) }, [text, onTextChange])
  useLayoutEffect(() => {
    if (!draft) return
    setText(draft.text)
    inputRef.current?.focus()
  }, [draft])
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`
  }, [text])
  const handleSubmit = useCallback(() => {
    if (!text.trim() || isStreaming) return
    onSend(text.trim())
    setText('')
  }, [text, isStreaming, onSend])
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])
  return <div className={styles.inputArea}>
    <div className={styles.composer}>
      <textarea ref={inputRef} className={styles.input} aria-label="运维问题" value={text}
        onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown} placeholder={placeholder}
        rows={1} disabled={isStreaming} />
      <div className={styles.inputRow}>
        <span className={styles.mode}>{endpointMode === 'ask' ? <Activity size={14} /> : <Search size={14} />}
          {endpointMode === 'ask' ? '诊断与分析' : '查询与探索'}</span>
        {isStreaming ? <button className={styles.stopBtn} onClick={onStop} aria-label="停止"><Square size={13} fill="currentColor" />停止</button>
          : <button className={styles.sendBtn} onClick={handleSubmit} disabled={!text.trim()} aria-label="发送" title="发送 · Enter"><ArrowUp size={17} /></button>}
      </div>
    </div>
    <div className={styles.hint}><span>AI 分析供参考，请结合实际环境核实。</span><span>Enter 发送 · Shift + Enter 换行</span></div>
  </div>
}
