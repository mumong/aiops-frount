import type { EndpointMode } from './types'

export function buildChatRequestParams(question: string, endpointMode: EndpointMode): URLSearchParams {
  const params = new URLSearchParams({
    q: question,
    format: 'sse',
    stream: 'true',
  })

  if (endpointMode === 'ask') {
    params.set('remediate', 'true')
  }

  return params
}

export function shouldProcessRemediation(endpointMode: EndpointMode): boolean {
  return endpointMode === 'ask'
}
