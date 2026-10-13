export type DisplayPart = { kind: 'text' | 'json' | 'internal'; raw: string; value?: unknown }

// Presentation only. Preserve every character; never change persisted SSE content.
export function splitStructuredContent(text: string): DisplayPart[] {
  if (/^\s*[\[{]/.test(text)) {
    try { return [{ kind: 'json', raw: text, value: JSON.parse(text) }] } catch { /* Streaming or mixed text. */ }
  }
  const parts: DisplayPart[] = []
  let start = 0
  let i = 0
  while (i < text.length) {
    if (text.startsWith('```', i)) {
      const line = text.indexOf('\n', i)
      const close = line < 0 ? -1 : text.indexOf('```', line + 1)
      if (close < 0) break // Keep unfinished Markdown intact while it streams.
      const end = close + 3
      const body = text.slice(line + 1, close)
      try {
        const value: unknown = JSON.parse(body)
        if (value === null || typeof value !== 'object') throw new Error('not structured')
        if (i > start) parts.push({ kind: 'text', raw: text.slice(start, i) })
        parts.push({ kind: 'json', raw: text.slice(i, end), value })
        start = end
      } catch { /* Ordinary code stays Markdown. */ }
      i = end
      continue
    }
    if (text.startsWith('[working_context_summary]', i)) {
      if (i > start) parts.push({ kind: 'text', raw: text.slice(start, i) })
      parts.push({ kind: 'internal', raw: text.slice(i) })
      return parts
    }
    // JSON objects, not arbitrary braces in prose or PromQL.
    if (text[i] !== '{' || !/^\{\s*(?:"|\})/.test(text.slice(i, i + 100))) { i++; continue }
    let depth = 0
    let quoted = false
    let escaped = false
    let end = i
    for (; end < text.length; end++) {
      const ch = text[end]
      if (quoted) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') quoted = false
      } else if (ch === '"') quoted = true
      else if (ch === '{' || ch === '[') depth++
      else if (ch === '}' || ch === ']') { if (--depth === 0) { end++; break } }
    }
    const raw = text.slice(i, end)
    let value: unknown
    try { value = JSON.parse(raw) } catch {
      if (depth === 0) { i = end; continue }
    }
    if (i > start) parts.push({ kind: 'text', raw: text.slice(start, i) })
    parts.push({ kind: value === undefined ? 'internal' : 'json', raw, value })
    i = end
    start = end
  }
  if (start < text.length) parts.push({ kind: 'text', raw: text.slice(start) })
  return parts
}
