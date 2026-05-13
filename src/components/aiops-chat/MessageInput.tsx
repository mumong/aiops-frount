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
