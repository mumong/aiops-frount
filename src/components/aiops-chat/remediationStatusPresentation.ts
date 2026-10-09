import type { RemediationStatus } from './types'

export type RemediationStatusTone = 'success' | 'failed' | 'blocked' | 'neutral'

export interface RemediationStatusPresentation {
  icon: string
  label: string
  tone: RemediationStatusTone
  detail?: string
}

function isUnsafePlan(reason: string): boolean {
  return reason.includes('invalid remediation plan') || reason.includes('unsafe remediation command')
}

export function getRemediationStatusPresentation(
  status: RemediationStatus,
): RemediationStatusPresentation {
  const rawStatus = String(status.status || '').trim().toLowerCase()
  const reason = String(status.reason || '').trim()

  if (rawStatus === 'needs_followup') {
    return { icon: '🔎', label: '命令已执行，待复查恢复状态', tone: 'neutral', detail: reason }
  }
  if (rawStatus === 'cancelled') {
    return { icon: '⏹', label: '修复已停止', tone: 'neutral', detail: reason }
  }
  if (rawStatus === 'blocked') {
    return { icon: '⚠️', label: '修复被安全检查阻止', tone: 'blocked', detail: reason }
  }

  if (isUnsafePlan(reason)) {
    return {
      icon: '⚠️',
      label: '未进入修复审批',
      tone: 'blocked',
      detail: '方案未通过安全检查，未提交审批。请查看报告中的人工处理建议。',
    }
  }

  if (rawStatus === 'skipped' || reason === 'no remediation plan') {
    return {
      icon: 'ℹ️',
      label: '未进入修复审批',
      tone: 'neutral',
      detail: '本次未生成可执行的修复方案，无需审批。',
    }
  }

  if (rawStatus === 'success' || rawStatus === 'completed') {
    return {
      icon: '✅',
      label: '修复流程完成',
      tone: 'success',
      detail: reason,
    }
  }

  if (rawStatus === 'rejected') {
    return {
      icon: '⛔',
      label: '已拒绝修复',
      tone: 'blocked',
      detail: reason || '用户拒绝当前修复计划或修复动作。',
    }
  }

  if (rawStatus === 'timeout') {
    return {
      icon: '⚠️',
      label: '修复审批超时',
      tone: 'blocked',
      detail: reason || '审批等待超时，后端已停止当前修复流程。',
    }
  }

  return {
    icon: '⚠️',
    label: `修复流程结束: ${status.status}`,
    tone: 'failed',
    detail: reason,
  }
}
