/** Backend SSE contract consumed by the chat reducer (`event: <type>\ndata: <json>`). */
export const SSE_EVENT = {
  RUN_START: 'run_start',
  NODE_START: 'node_start',
  NODE_COMPLETE: 'node_complete',
  THINKING: 'thinking',
  HEARTBEAT: 'heartbeat',
  FINAL: 'final',
  ERROR: 'error',
  RUN_END: 'run_end',
  REMEDIATION_APPROVAL_REQUIRED: 'remediation_approval_required',
  REMEDIATION_TOOL_START: 'remediation_tool_start',
  REMEDIATION_TOOL_RESULT: 'remediation_tool_result',
  REMEDIATION_FINISHED: 'remediation_finished',
  STRUCTURED_RESPONSE: 'structured_response',
  CONTEXT_COMPACTED: 'context_compacted',
} as const
export type SSEEventName = typeof SSE_EVENT[keyof typeof SSE_EVENT]

/** Pseudo events produced by the transport: raw text bodies and unnamed SSE frames. */
export const TRANSPORT_EVENT = {
  TEXT: 'text',
  MESSAGE: 'message',
} as const

/** `thinking_type` values carried by `thinking` events. */
export const THINKING_TYPE = {
  RUNTIME_STATUS: 'runtime_status',
  AI_TOKEN: 'ai_token',
  AI_MESSAGE: 'ai_message',
  /** Provider reasoning, streamed separately from the answer (never part of it). */
  AI_REASONING: 'ai_reasoning',
  TOOL_START: 'tool_start',
  TOOL_RESULT: 'tool_result',
  ITERATION_END: 'iteration_end',
} as const
export type ThinkingType = typeof THINKING_TYPE[keyof typeof THINKING_TYPE]

/** Workflow node ids with dedicated handling or labels. */
export const NODE_ID = {
  REQUEST_ROUTER: 'request_router',
  QUERY_COLLECT: 'query_collect',
  LAYER: 'layer',
  EVIDENCE: 'evidence',
  PARALLEL_EVIDENCE: 'parallel_evidence',
  RCA: 'rca',
  CONCLUSION: 'conclusion',
} as const
export type NodeId = typeof NODE_ID[keyof typeof NODE_ID]

/** Decoded JSON payload of an SSE frame. Fields are validated where read. */
export type SSEPayload = Record<string, unknown>

/**
 * First truthy field rendered as a string, else `fallback`.
 * Equivalent to the previous `String(data.a || data.b || fallback)` coercions.
 */
export function textField(data: SSEPayload, keys: string | readonly string[], fallback = ''): string {
  for (const key of typeof keys === 'string' ? [keys] : keys) {
    const value = data[key]
    if (value) return String(value)
  }
  return fallback
}

/** `textField` with surrounding whitespace removed (identifiers and refs). */
export function trimmedField(data: SSEPayload, key: string): string {
  return textField(data, key).trim()
}

/** Backend `error_code` values for model/LLM-gateway failures (not workflow failures). */
export const MODEL_ERROR_TITLES: Readonly<Record<string, string>> = {
  model_stalled: '模型服务停滞',
  model_timeout: '模型服务响应超时',
  model_disconnected: '模型服务连接中断',
}

export function isModelErrorCode(code: string): boolean {
  return code in MODEL_ERROR_TITLES
}

/** Banner text: the backend message, prefixed with the failure title unless it already says so. */
export function modelFailureText(failure: { code: string; message: string }): string {
  const title = MODEL_ERROR_TITLES[failure.code] ?? '模型服务异常'
  return failure.message.startsWith(title) ? failure.message : `${title}：${failure.message}`
}
