import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

async function load() {
  const source = readFileSync(new URL('../src/components/aiops-chat/repairEntry.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020, strict: true },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
}

test('diagnosis with open groups opens the workspace from the report', async () => {
  const { repairEntry } = await load()
  assert.deepEqual(repairEntry({ repairRecord: { run_id: 'd1', kind: 'diagnosis', repairable: true } }),
    { diagnosisId: 'd1', batchId: undefined, nothingToRepair: false })
})

test('healthy diagnosis shows no repair entry', async () => {
  const { repairEntry } = await load()
  assert.deepEqual(repairEntry({ repairRecord: { run_id: 'd1', kind: 'diagnosis', repairable: false } }),
    { nothingToRepair: true })
})

test('chat repair dispatched to a batch opens that batch for its diagnosis', async () => {
  const { repairEntry } = await load()
  assert.deepEqual(repairEntry({ repairBatchId: 'batch-d1', repairBatchDiagnosisId: 'd1' }),
    { diagnosisId: 'd1', batchId: 'batch-d1', nothingToRepair: false })
})

test('plan records and plain answers have no workspace', async () => {
  const { repairEntry } = await load()
  assert.deepEqual(repairEntry({ repairRecord: { run_id: 'p', kind: 'plan' } }), { nothingToRepair: false })
  assert.deepEqual(repairEntry({}), { nothingToRepair: false })
})
