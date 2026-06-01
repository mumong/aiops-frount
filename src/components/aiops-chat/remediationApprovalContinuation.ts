export type ApprovalContinuationStatus =
  | 'idle'
  | 'waiting'
  | 'continued'
  | 'stream_closed'
  | 'timed_out'

export interface ApprovalContinuationPresentation {
  tone: 'pending' | 'warning'
  text: string
}

export const APPROVAL_CONTINUATION_TIMEOUT_MS = 30000

export function getApprovalContinuationPresentation(
  status: ApprovalContinuationStatus,
): ApprovalContinuationPresentation | null {
  if (status === 'waiting') {
    return {
      tone: 'pending',
      text: '审批已提交，等待后端继续执行并推送下一步结果...',
    }
  }

  if (status === 'stream_closed') {
    return {
      tone: 'warning',
      text: '审批已提交成功，但当前流式连接已结束，前端无法继续接收后续审批或执行结果。请重新发起诊断确认最新状态。',
    }
  }

  if (status === 'timed_out') {
    return {
      tone: 'warning',
      text: '审批已提交成功，但暂未收到后端后续事件；可能仍在执行，也可能流式连接已中断。',
    }
  }

  return null
}
