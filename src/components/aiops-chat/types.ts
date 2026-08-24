/** SSE events from the robusta backend */
export type SSEEvent = 
  | RunStartEvent
  | NodeStartEvent
  | ThinkingEvent
  | HeartbeatEvent
  | NodeCompleteEvent
  | FinalEvent
  | ErrorEvent
  | RemediationApprovalEvent
  | RemediationFinishedEvent

export interface RunStartEvent {
  type: 'run_start'
  run_id: string
}

export interface NodeStartEvent {
  type: 'node_start'
  node: string
  node_name: string
}

export interface ThinkingEvent {
  type: 'thinking'
  node: string
  node_name?: string
  thinking_type: 'ai_message' | 'ai_token' | 'tool_start' | 'tool_result' | 'iteration_end'
  content?: string
  tool_name?: string
  status?: string
  result_preview?: string
  result?: string
  tool_call_id?: string
  tool_sequence?: number
  semantic_success?: boolean
  raw_ref?: string
  structured_ref?: string
  summary_ref?: string
  evidence_context?: {
    contract_version?: string
    group_id: string
    entity?: EvidenceEntity
    dimension?: EvidenceDimension
    source_system?: string
  }
  iteration?: number
}

export interface HeartbeatEvent {
  type: 'heartbeat'
  node: string
}

export interface NodeCompleteEvent {
  type: 'node_complete'
  node: string
  node_name?: string
  duration_seconds?: number
  state_snapshot?: Record<string, unknown>
  handoff_summary?: string
}

export interface FinalEvent {
  type: 'final'
  answer?: string
  metrics?: Record<string, unknown>
  elapsed_seconds?: number
}

export interface ErrorEvent {
  type: 'error'
  error: string
}

/** Remediation approval request (sent by backend when human approval is needed) */
export interface RemediationApprovalEvent {
  type: 'remediation_approval_required'
  approval_kind: 'plan' | 'action'
  approval_id: string
  run_id: string
  title: string
  description?: string
  /** Optional payload describing the action to be taken (for approval_kind=action) */
  payload?: Record<string, unknown>
}

/** Remediation workflow finished */
export interface RemediationFinishedEvent {
  type: 'remediation_finished'
  run_id: string
  status: string
  reason?: string
}

/** Remediation workflow terminal status stored per message */
export interface RemediationStatus {
  runId: string
  status: string
  reason?: string
  finishedAt: number
}

/** Pending remediation approval state stored per message */
export interface RemediationApproval {
  type: 'plan' | 'action'
  approvalId: string
  runId: string
  title: string
  description?: string
  payload?: Record<string, unknown>
  /** Timestamp when the approval was requested */
  requestedAt: number
}

/** Parsed SSE line pair */
export interface SSEMessage {
  event: string
  data: string
}

/** A single message in the chat */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  status?: 'streaming' | 'complete' | 'error'
  /** Run ID from the backend — stored per-message so it survives refresh / multi-question sessions */
  runId?: string
  /** This message's own node blocks — each assistant message remembers its own */
  nodeBlocks?: NodeBlock[]
  /** Pending remediation approvals for this message */
  remediationApprovals?: RemediationApproval[]
  /** Final remediation status for this message */
  remediationStatus?: RemediationStatus
}

export type EndpointMode = 'ask' | 'query'

/** Tool call record within a node */
export interface ToolCall {
  id: string
  backendCallId?: string
  toolName: string
  status: 'running' | 'success' | 'error'
  evidenceContext?: ParallelEvidenceStreamContext
  resultPreview?: string
  /** Full processed tool summary (shown when user clicks to expand) */
  resultData?: string
}

export type EvidenceDimension =
  | 'kubernetes'
  | 'metrics'
  | 'logging'
  | 'tracing'
  | 'topology'
  | 'other'

export interface EvidenceEntity {
  kind: string
  namespace: string
  name: string
}

export interface ParallelEvidenceStreamContext {
  contractVersion?: string
  groupId: string
  entity?: EvidenceEntity
  dimension?: EvidenceDimension
  sourceSystem?: string
}

export interface ParallelToolEventMetadata {
  toolCallId?: string
  semanticSuccess?: boolean
  evidenceContext?: ParallelEvidenceStreamContext
  rawRef?: string
  structuredRef?: string
  summaryRef?: string
}

export interface ParallelEvidenceResult {
  id: string
  toolName: string
  status: 'success' | 'error'
  resultPreview: string
  resultData: string
  dimension: EvidenceDimension
  scope: 'group' | 'entity'
  groupId?: string
  sourceSystem?: string
  entity?: EvidenceEntity
  rawRef?: string
  structuredRef?: string
  summaryRef?: string
}

export interface ParallelEvidenceGroup {
  groupId: string
  abnormalType: string
  statusKeywords: string[]
  entities: EvidenceEntity[]
  results: ParallelEvidenceResult[]
}

export interface ParallelEvidenceState {
  status: 'running' | 'complete'
  groups: ParallelEvidenceGroup[]
  pendingTools: ToolCall[]
  unassignedResults: ParallelEvidenceResult[]
}

/** A saved chat session */
export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  nodeBlocks: NodeBlock[]
  finalAnswer: string
  endpointMode: EndpointMode
  createdAt: number
  updatedAt: number
}

/** A single workflow node block — collects all events under one node */
export interface NodeBlock {
  nodeId: string
  nodeName: string
  status: 'running' | 'complete'
  durationSeconds?: number
  /** AI thinking tokens streamed during this node */
  thinkingTokens: string
  /** Tool calls that happened in this node */
  toolCalls: ToolCall[]
  /** Handoff summary from node_complete */
  handoffSummary?: string
  /** Grouped presentation state for the Backend's parallel_evidence node */
  parallelEvidence?: ParallelEvidenceState
}

/** Per-node label mapping */
export const NODE_LABELS: Record<string, string> = {
  layer: '📍 问题定位',
  evidence: '🔍 证据采集',
  parallel_evidence: '⚡ 并发证据采集',
  rca: '🎯 根因分析',
  conclusion: '📋 汇总总结',
}

/** Node order for display */
export const NODE_ORDER = ['layer', 'parallel_evidence', 'evidence', 'rca', 'conclusion']
