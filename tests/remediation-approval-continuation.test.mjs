import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

async function loadContinuationModule() {
  const source = readFileSync(
    new URL('../src/components/aiops-chat/remediationApprovalContinuation.ts', import.meta.url),
    'utf8',
  )
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
  }).outputText
  const encoded = Buffer.from(compiled).toString('base64')
  return import(`data:text/javascript;base64,${encoded}`)
}

test('approval continuation state explains waiting for the next backend event', async () => {
  const { getApprovalContinuationPresentation } = await loadContinuationModule()

  assert.deepEqual(getApprovalContinuationPresentation('waiting'), {
    tone: 'pending',
    text: '审批已提交，等待后端继续执行并推送下一步结果...',
  })
})

test('approval continuation state explains when the SSE stream is already closed', async () => {
  const { getApprovalContinuationPresentation } = await loadContinuationModule()

  assert.deepEqual(getApprovalContinuationPresentation('stream_closed'), {
    tone: 'warning',
    text: '审批已提交成功，但当前流式连接已结束，前端无法继续接收后续审批或执行结果。请重新发起诊断确认最新状态。',
  })
})

test('approval continuation state explains when no follow-up event arrives in time', async () => {
  const { getApprovalContinuationPresentation } = await loadContinuationModule()

  assert.deepEqual(getApprovalContinuationPresentation('timed_out'), {
    tone: 'warning',
    text: '审批已提交成功，但暂未收到后端后续事件；可能仍在执行，也可能流式连接已中断。',
  })
})

test('remediation approval card receives stream liveness and activity markers', () => {
  const source = readFileSync(
    new URL('../src/components/aiops-chat/RemediationApprovalCard.tsx', import.meta.url),
    'utf8',
  )

  assert.ok(source.includes('streamActive'), 'approval card must know whether the SSE stream is still active')
  assert.ok(source.includes('activitySeq'), 'approval card must observe follow-up SSE activity after approval')
})
