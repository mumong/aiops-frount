import type { SSEMessage } from '../components/aiops-chat/types'

const LINE_BREAK = /\r\n|\r|\n/

/** Incremental text/event-stream decoder following the WHATWG SSE parsing rules:
 * CRLF/CR/LF line endings, optional single space after the colon, multi-line
 * data joined by LF, comment lines ignored, `id`/`retry`/unknown fields ignored
 * (the backend has no resume support). An unterminated final line is still
 * dispatched at EOF for compatibility. Keep this transport-only: JSON and
 * application events belong to transitions. finish deliberately does not flush
 * a partial UTF-8 codepoint.
 */
export function createSSEDecoder(onEvent: (message: SSEMessage) => void) {
  const decoder = new TextDecoder()
  let buffer = ''
  // A CR at the end of a chunk may be the first half of a CRLF pair.
  let skipLeadingLF = false
  let eventType = ''
  let dataLines: string[] = []

  const dispatch = () => {
    const data = dataLines.join('\n')
    const event = eventType || 'message'
    eventType = ''
    dataLines = []
    if (data !== '') onEvent({ event, data })
  }

  const processLine = (line: string) => {
    if (line === '') {
      dispatch()
      return
    }
    if (line.startsWith(':')) return
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') eventType = value
    else if (field === 'data') dataLines.push(value)
  }

  return {
    push(value: Uint8Array) {
      let text = decoder.decode(value, { stream: true })
      if (!text) return
      if (skipLeadingLF && text.startsWith('\n')) text = text.slice(1)
      skipLeadingLF = false
      const raw = buffer + text
      const lines = raw.split(LINE_BREAK)
      buffer = lines.pop() ?? ''
      skipLeadingLF = raw.endsWith('\r')
      for (const line of lines) processLine(line)
    },
    finish() {
      if (buffer) processLine(buffer)
      buffer = ''
      dispatch()
    },
  }
}
