import type { ChatMessage } from './types'
import { repairJson } from './repairTransport'

export interface RepairGroup {
  job_id: string
  group_id: string
  version: number
  status: string
  target?: { label?: string; entities?: Array<{ namespace?: string; name?: string }> }
  mode?: string
}
export interface RepairBatch { batch_id: string; groups: RepairGroup[] }
export interface RepairFeedback {
  role: 'user'; text: string; source_job_id: string; source_version: number; target_version: number; submitted_at: number
}
export interface RepairHistory {
  job_id: string; version: number; status: string; feedback?: RepairFeedback
  plan?: ChatMessage['repairPlan'] & { answer?: string }
}
export interface PodObservation {
  exists?: boolean | null; pod?: string; replaced?: string; phase?: string; ready?: boolean; reason?: string | null
  restarts?: number; deletion_timestamp?: string | null; waiting_reasons?: string[]; error?: string
}
export interface RecoveryEvent {
  type: 'remediation_recovery'; group_id: string; observed: PodObservation; verdict: 'recovered' | 'pending'
  reason: string; elapsed_seconds: number; timeout_seconds: number
}
export interface RecoverySummary {
  status: 'recovered' | 'not_recovered' | 'needs_followup'
  timeout_seconds: number; settle_seconds: number
  targets: Array<{ group_id: string; status: string; reason: string; before?: PodObservation | null
    after?: PodObservation | null; elapsed_seconds: number; timed_out: boolean }>
}
export interface RepairJob extends RepairGroup {
  diagnosis_summary?: string | null
  created_at?: number
  status_started_at?: number
  server_time?: number
  feedback?: RepairFeedback
  history?: RepairHistory[]
  plan?: ChatMessage['repairPlan'] & { answer?: string }
  error?: string
  result?: { reason?: string; status?: string; elapsed_seconds?: number; recovery?: RecoverySummary | null }
  recovery?: RecoveryEvent
  approval?: { approval_id: string; title: string; expires_at: number; decision_status?: string }
  mode_source?: string
  events?: Array<{ type: string; action_id: string; stage: string; command: string;
    status: string; result_preview?: string; result_truncated?: boolean;
    /** "auto" = executed without a human decision; otherwise the approval id that authorised it */
    approval?: string; mode?: string; error_code?: string; rule?: string; execution_skipped?: boolean }>
}
export const repairStatus: Record<string, string> = {
  queued: '等待规划', planning: '正在生成方案', planned: '方案已生成',
  awaiting_approval: '等待批准', executing: '执行中', verifying: '命令已执行 · 观察恢复中', needs_followup: '命令已完成 · 待确认恢复',
  skipped: '无可执行动作', blocked: '执行受阻', failed: '失败', cancelled: '已停止',
  rejected: '已拒绝', timeout: '审批超时', interrupted: '服务重启 · 已中断',
  superseded: '已被新版本替代', execution_disabled: '执行已关闭',
  recovered: '已恢复', not_recovered: '超时未恢复',
}
export const repairActive = (status: string) => ['queued', 'planning', 'planned', 'awaiting_approval', 'executing', 'verifying'].includes(status)

export async function repairRequest<T>(base: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return repairJson<T>(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'include', signal,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
