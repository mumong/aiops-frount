import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const code = ts.transpileModule(readFileSync(new URL('../src/components/aiops-chat/repairPolicyPresentation.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
const { describeMode, summarizeRules, describeVerdict, splitCommands } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

const rules = { transport: {}, denied_operations: ['drain', 'edit'], allowed_operations: [], denied_flags: ['--all'],
  bulk_selector_on_write: true, denied_resource_kinds: ['node'], denied_executables: ['rm', 'dd'], allowed_exec_commands: [], read_only_operations: [],
  kubernetes: { commands: ['drain', 'edit'], resources: ['node'], batch: ['--all', '-l/--selector/--field-selector（写操作）'] }, shell: ['rm', 'dd'],
  approval_required: { kubernetes: ['drain', 'namespace'], shell: ['rm'] } }

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

test('rule summary reads as two lists: Kubernetes and Shell', () => {
  assert.equal(summarizeRules(rules), 'Kubernetes：2 个命令、1 类集群资源、批量操作 · Shell：2 个命令 · 需人工审批：3 个')
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

test('approval-required verdict reads as allowed only after a person approves', () => {
  const v = describeVerdict({ command: 'kubectl drain node2', allowed: true, requires_approval: true, operation: 'drain',
    rule: 'approval_required', reason: '需人工审批的高危命令（操作 drain 在高危命令黑名单中）' })
  assert.match(v.label, /需人工审批/)
  assert.match(v.detail, /自动执行模式下也需审批/)
})

test('high-risk approval note names the commands and that auto mode does not skip it', async () => {
  const { describeHighRisk } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  assert.equal(describeHighRisk([]), '')
  const note = describeHighRisk(['kubectl exec pod/x -n d -- rm -f /tmp/a：需人工审批的高危命令（命中 denied_executables：rm）'])
  assert.match(note, /高危命令，需人工批准后执行/)
  assert.match(note, /自动执行模式也不会跳过/)
  assert.match(note, /rm -f \/tmp\/a/)
})
