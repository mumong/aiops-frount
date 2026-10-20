import { repairJson } from './repairTransport'

/** Effective repair safety posture as served by GET /repair/policy. */
export interface RepairPolicy {
  enabled: boolean
  mode: 'review' | 'auto'
  config_mode: 'review' | 'auto'
  mode_source: 'config' | 'runtime'
  approval_timeout_seconds: number
  override: null | { mode: string; reason?: string; changed_by?: string; changed_at?: number; expires_at?: number }
  rules: {
    transport: Record<string, string>
    denied_operations: string[]
    allowed_operations: string[]
    denied_flags: string[]
    bulk_selector_on_write: boolean
    denied_resource_kinds: string[]
    denied_executables: string[]
    allowed_exec_commands: string[]
    read_only_operations: string[]
    /** Display view of the same rules: what the panel lists. */
    kubernetes: { commands: string[]; resources: string[]; batch: string[] }
    shell: string[]
  }
  runtime_switch: { available: boolean; header: string; note: string }
}

export interface CommandVerdict {
  command: string
  allowed: boolean
  operation: string
  rule: string
  reason: string
}

export const ADMIN_TOKEN_HEADER = 'X-AIOps-Admin-Token'
export const ADMIN_TOKEN_STORAGE_KEY = 'aiops_repair_admin_token'

export function fetchRepairPolicy(apiBase: string, signal?: AbortSignal) {
  return repairJson<RepairPolicy>(`${apiBase}/repair/policy`, { credentials: 'include', signal })
}

/** Dry evaluation: the backend never executes anything for this call. */
export function checkRepairCommands(apiBase: string, commands: string[]) {
  return repairJson<{ results: CommandVerdict[]; mode: string }>(`${apiBase}/repair/policy/check`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands }),
  })
}

export function setRepairMode(apiBase: string, token: string, body: {
  mode: 'review' | 'auto'; reason?: string; ttl_minutes?: number; approval_timeout_seconds?: number; changed_by?: string
}) {
  return repairJson<RepairPolicy>(`${apiBase}/repair/policy/mode`, {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json', [ADMIN_TOKEN_HEADER]: token },
    body: JSON.stringify(body),
  })
}

export function clearRepairMode(apiBase: string, token: string) {
  return repairJson<RepairPolicy>(`${apiBase}/repair/policy/mode`, {
    method: 'DELETE', credentials: 'include', headers: { [ADMIN_TOKEN_HEADER]: token },
  })
}
