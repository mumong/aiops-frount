import { NODE_ID, type NodeId } from './sseEvents'

/** Remediation workflow terminal status stored per message */
export interface RemediationStatus {
  runId: string
  status: string
  reason?: string
  errorCode?: string
  finishedAt: number
}

/** Pending remediation approval state stored per message */
export interface RemediationApproval {
  expiresAt?: number
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
  diagnosisCases?: Array<{
    group_id: string
    execution_status: string
    outcome?: string
    summary: string
    report: string
    target?: { entities?: Array<{ namespace?: string; name: string; uid?: string }> }
  }>
  diagnosisOverview?: { text: string; failed: boolean; total: number; completed: number; partial: number }
  diagnosisFooter?: string
  repairBatchId?: string
  /** Diagnosis of a chat repair request the backend dispatched to a per-group batch. */
  repairBatchDiagnosisId?: string
  repairRecord?: {
    run_id: string; kind: 'diagnosis' | 'plan'; source_run_id?: string | null; repairable?: boolean
  }
  repairPlan?: {
    planning_error?: { code: string; message: string }
    answer?: string
    targets: Array<{ namespace: string; pod: string; group_id: string }>
    actions: Array<{ id: string; group_id: string; description: string; execute_command: string;
      dry_run_command?: string; verify_command?: string;
      risk: string; configuration_change?: string; verification_conditions?: string[]; rollback_advice: string }>
    assessments?: Array<{ group_id: string; status: string; reason: string; missing: string[] }>
  }
  remediationResults?: Array<{ key: string; groupId: string; actionId: string; stage: string;
    command: string; status: string; result: string; truncated: boolean }>
  resultStatus?: 'success' | 'partial' | 'error'
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  status?: 'streaming' | 'complete' | 'error'
  /** The event stream closed without a final/error event (connection lost). */
  interrupted?: boolean
  /** The backend reported a model/LLM-gateway failure (error_code model_*), not a workflow failure. */
  modelFailure?: { code: string; message: string }
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
  /** Multi-cluster location: the cluster whose card this call belongs to. */
  clusterLabel?: string
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
  /** multi-cluster: short label of the group's cluster (e.g. edge-88) */
  clusterLabel?: string
  analysisStreams?: Record<string, { text: string; streamStart?: number }>
  /** Raw model reasoning per stage; shown collapsed, separate from the analysis. */
  reasoningStreams?: Record<string, string>
  runtimeStatus?: string
  terminalStatus?: 'completed' | 'partial'
  error?: string
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
  status: 'running' | 'complete' | 'stopped'
  durationSeconds?: number
  /** AI thinking tokens streamed during this node */
  thinkingTokens: string
  thinkingStreamStart?: number
  /** Raw model reasoning (ai_reasoning); shown collapsed, separate from the analysis. */
  reasoningTokens?: string
  runtimeStatus?: { text: string; status: string; at: number }
  /** Tool calls that happened in this node */
  toolCalls: ToolCall[]
  /** Handoff summary from node_complete */
  handoffSummary?: string
  routeDecision?: import('./routePresentation').RoutePresentation
  /** Grouped presentation state for the Backend's parallel_evidence node */
  parallelEvidence?: ParallelEvidenceState
  /** Multi-cluster location: one lane per cluster, in arrival order. */
  clusterLanes?: ClusterLane[]
}

export interface ClusterLane {
  label: string
  status: 'running' | 'complete' | 'failed'
  note: string
  reasoning: string
  analysis: { text: string; streamStart?: number }
}

/** Per-node label mapping */
export const NODE_LABELS: Record<string, string> = {
  [NODE_ID.REQUEST_ROUTER]: '任务理解',
  [NODE_ID.QUERY_COLLECT]: '自主查询与分析',
  [NODE_ID.LAYER]: '📍 问题定位',
  [NODE_ID.EVIDENCE]: '🔍 证据采集',
  [NODE_ID.PARALLEL_EVIDENCE]: '⚡ 并发证据采集',
  [NODE_ID.RCA]: '🎯 根因分析',
  [NODE_ID.CONCLUSION]: '📋 汇总总结',
} satisfies Record<NodeId, string>
