import type { RemediationApproval } from './types'

export type ParsedRemediationApproval = Pick<
  RemediationApproval,
  'type' | 'runId' | 'approvalId' | 'title'
>

const CURL_APPROVAL_RE =
  /-d\s+run_id=(?<runId>\S+)\s+-d\s+approval_id=(?<approvalId>\S+)/m
const RUN_ID_RE = /(?:^|\s)run_id[:=]\s*(?<runId>[^\s]+)/m
const APPROVAL_ID_RE = /(?:审批\s*ID|approval_id)[:=：]\s*(?<approvalId>[^\s]+)/m
const APPROVAL_KIND_RE = /审批类型[:：]\s*(?<kind>plan|action)/m
const TITLE_RE = /标题[:：]\s*(?<title>[^\n\r]+)/m

function cleanToken(value: string | undefined): string {
  return String(value || '').trim().replace(/[)"'，。]+$/g, '')
}

export function parseRemediationApprovalText(text: string): ParsedRemediationApproval | null {
  const value = String(text || '')
  if (!value.includes('修复审批中断') && !value.includes('/remediation/approve')) {
    return null
  }

  const curlMatch = value.match(CURL_APPROVAL_RE)
  const runId = cleanToken(curlMatch?.groups?.runId || value.match(RUN_ID_RE)?.groups?.runId)
  const approvalId = cleanToken(
    curlMatch?.groups?.approvalId || value.match(APPROVAL_ID_RE)?.groups?.approvalId,
  )
  if (!runId || !approvalId) {
    return null
  }

  const rawKind = cleanToken(value.match(APPROVAL_KIND_RE)?.groups?.kind)
  const type: 'plan' | 'action' = rawKind === 'action' ? 'action' : 'plan'
  const title = cleanToken(value.match(TITLE_RE)?.groups?.title) || (
    type === 'plan' ? '是否认可诊断报告中的修复方案' : '是否执行当前修复动作'
  )

  return {
    type,
    runId,
    approvalId,
    title,
  }
}

export function toRemediationApproval(
  parsed: ParsedRemediationApproval,
  requestedAt = Date.now(),
): RemediationApproval {
  return {
    ...parsed,
    requestedAt,
  }
}
