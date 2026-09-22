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

// Display only the answer string while a QueryAnswer JSON envelope streams in.
// Original SSE text stays intact; incomplete escapes wait for the next chunk.
export function queryNarrative(text: string): string {
  const start = text.search(/\{\s*"(?:intent|scope|status|answer)"\s*:/)
  if (start < 0) return /^\s*(?:\{|```(?:json)?\s*$)/.test(text) ? '' : visibleNarrative(text)
  const prefix = text.slice(0, start).replace(/```json\s*$/, '')
  const body = text.slice(start)
  const match = /"answer"\s*:\s*"/.exec(body)
  if (!match) return visibleNarrative(prefix)
  let answer = ''
  for (let i = match.index + match[0].length; i < body.length; i++) {
    const ch = body[i]
    if (ch === '"') break
    if (ch !== '\\') { answer += ch; continue }
    if (i + 1 >= body.length) break
    const width = body[i + 1] === 'u' ? 6 : 2
    if (i + width > body.length) break
    try { answer += JSON.parse('"' + body.slice(i, i + width) + '"') as string }
    catch { break }
    i += width - 1
  }
  return visibleNarrative(prefix + (prefix.trim() && answer ? '\n\n' : '') + answer)
}
