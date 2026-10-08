import { useEffect, useRef, useState } from 'react'
import { Check, Copy, AlertCircle } from 'lucide-react'
import styles from './ContentTools.module.css'

export default function CopyButton({ text, label = '复制' }: { text: string | (() => string); label?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  async function copy() {
    try {
      const value = typeof text === 'function' ? text() : text
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value)
      else {
        const active = document.activeElement as HTMLElement | null
        const input = document.createElement('textarea')
        input.value = value
        input.style.cssText = 'position:fixed;left:-9999px;top:0'
        document.body.append(input)
        input.select()
        let copied = false
        try { copied = document.execCommand('copy') } finally { input.remove(); active?.focus({ preventScroll: true }) }
        if (!copied) throw new Error('Clipboard unavailable')
      }
      setStatus('copied')
    } catch { setStatus('error') }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus('idle'), 2500)
  }
  return <button type="button" className={styles.copyButton} onClick={copy} aria-label={label} title={label}>
    {status === 'copied' ? <Check size={14} /> : status === 'error' ? <AlertCircle size={14} /> : <Copy size={14} />}
    <span aria-live="polite">{status === 'copied' ? '已复制' : status === 'error' ? '复制失败，请手动选择' : label}</span>
  </button>
}
