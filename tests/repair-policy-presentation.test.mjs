import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const code = ts.transpileModule(readFileSync(new URL('../src/components/aiops-chat/repairPolicyPresentation.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
const { describeMode, summarizeRules, describeVerdict, splitCommands } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

const rules = { transport: {}, denied_operations: ['delete', 'apply'], allowed_operations: [], denied_flags: ['--force'],
  bulk_selector_on_write: true, denied_resource_kinds: ['node'], denied_executables: ['rm', 'dd'], allowed_exec_commands: [], read_only_operations: [] }

test('config review mode reads as human approval with its timeout', () => {
  const shown = describeMode({ enabled: true, mode: 'review', mode_source: 'config', override: null, approval_timeout_seconds: 600 })
  assert.equal(shown.label, '人工审批')
  assert.equal(shown.tone, 'review')
  assert.match(shown.detail, /来自配置/)
  assert.match(shown.detail, /600 秒/)
})

test('runtime auto override shows remaining minutes, author and reason', () => {
  const now = 1_000_000_000
  const shown = describeMode({ enabled: true, mode: 'auto', mode_source: 'runtime', approval_timeout_seconds: 600,
    override: { mode: 'auto', expires_at: now / 1000 + 25 * 60, changed_by: 'tester', reason: '验收' } }, now)
  assert.equal(shown.label, '自动执行')
  assert.equal(shown.tone, 'auto')
  assert.match(shown.detail, /运行时覆盖/)
  assert.match(shown.detail, /剩余 25 分钟/)
  assert.match(shown.detail, /tester/)
  assert.match(shown.detail, /验收/)
  assert.match(shown.detail, /不等待人工批准/)
})

test('disabled executor is stated, not shown as a mode', () => {
  assert.equal(describeMode({ enabled: false, mode: 'review', mode_source: 'config', override: null, approval_timeout_seconds: 600 }).tone, 'off')
})

test('rule summary counts every rule family', () => {
  const text = summarizeRules(rules)
  assert.match(text, /2 个禁止动词/)
  assert.match(text, /1 个禁止参数/)
  assert.match(text, /1 类禁止写入的资源/)
  assert.match(text, /2 个容器内禁止命令/)
  assert.match(text, /批量写/)
})

test('verdicts name the rule and never claim execution', () => {
  const denied = describeVerdict({ command: 'kubectl delete ns x', allowed: false, operation: 'delete', rule: 'denied_operations', reason: '操作 delete 在高危命令黑名单中' })
  assert.match(denied.label, /拦截/)
  assert.match(denied.label, /高危动词黑名单/)
  assert.equal(denied.detail, '操作 delete 在高危命令黑名单中')
  const allowed = describeVerdict({ command: 'kubectl patch pod/x -p {}', allowed: true, operation: 'patch', rule: '', reason: '' })
  assert.match(allowed.label, /允许/)
  assert.match(allowed.detail, /审批/)
})

test('pasted text splits into commands, dropping blanks and comments', () => {
  assert.deepEqual(splitCommands('# note\nkubectl get pods\n\n  kubectl delete ns x  \n'), ['kubectl get pods', 'kubectl delete ns x'])
})
