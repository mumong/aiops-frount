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
export interface RepairJob extends RepairGroup {
  created_at?: number
  status_started_at?: number
  server_time?: number
  feedback?: RepairFeedback
  history?: RepairHistory[]
  plan?: ChatMessage['repairPlan'] & { answer?: string }
  error?: string
  result?: { reason?: string }
  approval?: { approval_id: string; title: string; expires_at: number; decision_status?: string }
  events?: Array<{ type: string; action_id: string; stage: string; command: string;
    status: string; result_preview?: string; result_truncated?: boolean }>
}
export const repairStatus: Record<string, string> = {
  queued: '等待规划', planning: '正在生成方案', planned: '方案已生成',
  awaiting_approval: '等待批准', executing: '执行中', needs_followup: '命令已完成 · 待确认恢复',
  skipped: '无可执行动作', blocked: '执行受阻', failed: '失败', cancelled: '已停止',
  rejected: '已拒绝', timeout: '审批超时', interrupted: '服务重启 · 已中断',
  superseded: '已被新版本替代', execution_disabled: '执行已关闭',
}
export const repairActive = (status: string) => ['queued', 'planning', 'planned', 'awaiting_approval', 'executing'].includes(status)

export async function repairRequest<T>(base: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return repairJson<T>(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'include', signal,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
