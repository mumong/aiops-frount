import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

async function loadStatusModule() {
  const source = readFileSync(
    new URL('../src/components/aiops-chat/remediationStatusPresentation.ts', import.meta.url),
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

test('unsafe remediation plan is presented as a blocked approval flow', async () => {
  const { getRemediationStatusPresentation } = await loadStatusModule()

  assert.deepEqual(
    getRemediationStatusPresentation({
      runId: 'run1',
      status: 'failed',
      reason: 'invalid remediation plan: unsafe remediation command: ssh root@node1 "iptables -L -n | grep ACCEPT"',
      finishedAt: 1,
    }),
    {
      icon: '⚠️',
      label: '未进入修复审批',
      tone: 'blocked',
      detail: '方案未通过安全检查，未提交审批。请查看报告中的人工处理建议。',
    },
  )
})

test('skipped remediation is presented as no automatic approval needed', async () => {
  const { getRemediationStatusPresentation } = await loadStatusModule()

  assert.deepEqual(
    getRemediationStatusPresentation({
      runId: 'run1',
      status: 'skipped',
      reason: 'no remediation plan',
      finishedAt: 1,
    }),
    {
      icon: 'ℹ️',
      label: '未进入修复审批',
      tone: 'neutral',
      detail: '本次未生成可执行的修复方案，无需审批。',
    },
  )
})
