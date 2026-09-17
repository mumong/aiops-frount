import type { EndpointMode } from './types'

export function newChatSessionId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')
}

export function buildChatRequestParams(question: string, endpointMode: EndpointMode, sessionId?: string): URLSearchParams {
  const params = new URLSearchParams({
    q: question,
    format: 'sse',
    stream: 'true',
  })

  if (endpointMode === 'ask') {
    params.set('remediate', 'true')
  }
  if (endpointMode === 'query' && sessionId) params.set('session_id', sessionId)

  return params
}

export function shouldProcessRemediation(endpointMode: EndpointMode): boolean {
  return endpointMode === 'ask'
}
