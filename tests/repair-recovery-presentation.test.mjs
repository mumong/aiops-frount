import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const code = ts.transpileModule(readFileSync(new URL('../src/components/aiops-chat/repairRecoveryPresentation.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
const { describeObservation, describeRecoveryProgress, describeRecoveryOutcome } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

test('observations are rendered from status facts only', () => {
  assert.equal(describeObservation({ exists: false }), 'Pod 不存在（已删除）')
  assert.match(describeObservation({ exists: true, pod: 'w-1', phase: 'Running', ready: false, reason: 'CrashLoopBackOff', restarts: 7 }), /w-1 · Running · NotReady · CrashLoopBackOff · 重启 7/)
  assert.match(describeObservation({ exists: true, pod: 'w-2', phase: 'Running', ready: true, restarts: 0, replaced: 'w-1' }), /Ready/)
  assert.match(describeObservation({ exists: true, pod: 'w-2', phase: 'Running', ready: true, restarts: 0, replaced: 'w-1' }), /替代 w-1/)
  assert.equal(describeObservation(null), '未观测')
  assert.match(describeObservation({ exists: null, error: 'Unauthorized' }), /观测失败/)
})

test('progress line shows elapsed over budget', () => {
  const line = describeRecoveryProgress({ type: 'remediation_recovery', group_id: 'g1', verdict: 'pending', reason: '需稳定 20 秒',
    elapsed_seconds: 35, timeout_seconds: 180, observed: { exists: true, phase: 'Running', ready: true, restarts: 0 } })
  assert.match(line, /35\/180 秒/)
  assert.match(line, /需稳定 20 秒/)
})

test('outcome labels distinguish recovered, timeout and unknown', () => {
  assert.equal(describeRecoveryOutcome({ status: 'recovered', timeout_seconds: 180, settle_seconds: 20, targets: [] }).tone, 'success')
  const timeout = describeRecoveryOutcome({ status: 'not_recovered', timeout_seconds: 180, settle_seconds: 20, targets: [] })
  assert.equal(timeout.tone, 'timeout')
  assert.match(timeout.label, /超时未恢复（180 秒）/)
  assert.equal(describeRecoveryOutcome({ status: 'needs_followup', timeout_seconds: 180, settle_seconds: 20, targets: [] }).tone, 'neutral')
})
