// Only legacy machine-generated key=value records use the KV renderer.
// Prose containing environment assignments, PromQL or Markdown is not a record.
export function isLegacyHandoff(text: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*=/.test(text.trimStart()) && !text.includes('\n')
}

export function emptyNodeMessage(running: boolean): string {
  return running ? '等待分析或工具事件...' : '本阶段已结束，未提供单独的分析说明。'
}

// Presentation only: keep original messages and tool payloads untouched.
// Remove blank boundary lines, not indentation or whitespace inside code/logs.
export function visibleNarrative(text: string): string {
  if (!text.trim()) return ''
  return text.replace(/^(?:[^\S\r\n]*\r?\n)+/, '')
    .replace(/(?:\r?\n[^\S\r\n]*)+$/, '')
}
