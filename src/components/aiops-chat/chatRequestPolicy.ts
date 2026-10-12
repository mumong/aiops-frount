import type { EndpointMode } from './types'

export function newChatSessionId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')
}

export interface RepairSource { diagnosisRunId?: string; planRunId?: string }

export function buildChatRequestParams(question: string, endpointMode: EndpointMode, sessionId?: string, source?: RepairSource): URLSearchParams {
  const params = new URLSearchParams({
    q: question,
    format: 'sse',
    stream: 'true',
  })

  if (endpointMode === 'ask') {
    params.set('remediate', 'true')
  }
  if (sessionId) params.set('session_id', sessionId)
  if (source?.diagnosisRunId) params.set('diagnosis_run_id', source.diagnosisRunId)
  if (source?.planRunId) params.set('plan_run_id', source.planRunId)

  return params
}

export function shouldProcessRemediation(endpointMode: EndpointMode): boolean {
  return endpointMode === 'ask' || endpointMode === 'query'
}
