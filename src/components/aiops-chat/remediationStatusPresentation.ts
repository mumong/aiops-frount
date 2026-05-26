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

  if (isUnsafePlan(reason)) {
    return {
      icon: '⚠️',
      label: '未进入修复审批',
      tone: 'blocked',
      detail: '修复计划未通过后端安全校验，未生成 approve/reject 审批。请按诊断报告中的人工处置建议处理。',
    }
  }

  if (rawStatus === 'skipped' || reason === 'no remediation plan') {
    return {
      icon: 'ℹ️',
      label: '未进入修复审批',
      tone: 'neutral',
      detail: '当前报告没有可安全自动执行的修复动作，因此不会出现 approve/reject 审批。',
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
      label: '修复流程已拒绝',
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
