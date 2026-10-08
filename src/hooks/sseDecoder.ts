import type { SSEMessage } from '../components/aiops-chat/types'

/** Incremental decoder for the existing backend's LF + spaced-field format.
 * Keep this transport-only: JSON and application events belong to transitions.
 * In particular, finish deliberately does not flush a partial UTF-8 codepoint.
 */
export function createSSEDecoder(onEvent: (message: SSEMessage) => void) {
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''
  let dataLines: string[] = []

  const dispatch = () => {
    if (dataLines.length === 0) {
      currentEvent = ''
      return
    }
    onEvent({ event: currentEvent || 'message', data: dataLines.join('\n') })
    currentEvent = ''
    dataLines = []
  }

  return {
    push(value: Uint8Array) {
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          dataLines.push(line.slice(6))
        } else if (line === '') {
          dispatch()
        }
      }
    },
    finish() {
      if (buffer && buffer.startsWith('data: ')) {
        dataLines.push(buffer.slice(6))
      }
      dispatch()
    },
  }
}
