export interface HandoffKV {
  key: string
  value: string
  isJson: boolean
}

/** Parse "key1=v1 key2={"json":"data"} key3=text" into structured KV pairs */
export function parseHandoff(text: string): HandoffKV[] {
  const pairs: HandoffKV[] = []
  let i = 0

  while (i < text.length) {
    while (i < text.length && text[i] === ' ') i++
    if (i >= text.length) break

    const eqIdx = text.indexOf('=', i)
    if (eqIdx === -1) break

    const key = text.slice(i, eqIdx).trim()
    if (!key) { i = eqIdx + 1; continue }

    i = eqIdx + 1

    // JSON object/array?
    if (i < text.length && (text[i] === '{' || text[i] === '[')) {
      const open = text[i]
      const close = open === '{' ? '}' : ']'
      let depth = 0
      let inStr = false
      let esc = false
      const start = i
      while (i < text.length) {
        const ch = text[i]
        if (inStr) {
          if (esc) { esc = false }
          else if (ch === '\\') { esc = true }
          else if (ch === '"') { inStr = false }
        } else {
          if (ch === '"') { inStr = true }
          else if (ch === open) { depth++ }
          else if (ch === close) { depth--; if (depth === 0) { i++; break } }
        }
        i++
      }
      const rawJson = text.slice(start, i)
      const formatted = tryFormatJson(rawJson)
      pairs.push({ key, value: formatted, isJson: true })
    } else {
      const start = i
      while (i < text.length) {
        if (text[i] === ' ') {
          const peek = text.slice(i).match(/^\s+\w+=/)
          if (peek) break
        }
        i++
      }
      let value = text.slice(start, i).trim()
      value = value.replace(/[\x00-\x1f]+/g, ' ').trim()
      if (value) {
        pairs.push({ key, value, isJson: false })
      }
    }
  }

  return pairs
}

function tryFormatJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return raw
  }
}
