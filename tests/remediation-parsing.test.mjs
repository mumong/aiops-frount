import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

async function loadParserModule() {
  const source = readFileSync(
    new URL('../src/components/aiops-chat/remediationParsing.ts', import.meta.url),
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

test('parses approval interrupt from real text-mode backend output', async () => {
  const { parseRemediationApprovalText } = await loadParserModule()
  const text = `
======================================================================
🛠️ 修复审批中断
======================================================================
审批类型: plan
审批 ID: 598120ac81cb
标题: 是否认可诊断报告中的修复方案
请调用:
curl -X POST http://<host>/remediation/approve -d run_id=bb5d923499d04598 -d approval_id=598120ac81cb -d approved=true
`

  assert.deepEqual(parseRemediationApprovalText(text), {
    type: 'plan',
    runId: 'bb5d923499d04598',
    approvalId: '598120ac81cb',
    title: '是否认可诊断报告中的修复方案',
  })
})

test('parses action approval interrupt and prefers curl ids', async () => {
  const { parseRemediationApprovalText } = await loadParserModule()
  const text = `
审批类型: action
审批 ID: stale-from-heading
标题: 是否执行修复动作 react-1: kubectl patch deployment
curl -X POST http://<host>/remediation/approve -d run_id=run-action-1 -d approval_id=approval-action-1 -d approved=true
`

  assert.deepEqual(parseRemediationApprovalText(text), {
    type: 'action',
    runId: 'run-action-1',
    approvalId: 'approval-action-1',
    title: '是否执行修复动作 react-1: kubectl patch deployment',
  })
})
