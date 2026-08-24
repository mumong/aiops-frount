import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

async function loadModel() {
  const source = readFileSync(
    new URL('../src/components/aiops-chat/parallelEvidenceModel.ts', import.meta.url),
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

const realGroups = [
  {
    group_id: 'g1',
    pod_abnormal_type: 'PendingUnschedulable',
    status_keywords: ['Pending'],
    entities: [{ kind: 'Pod', namespace: 'aiops-case-01', name: 'workload-68c557d875-q7xwh' }],
  },
  {
    group_id: 'g2',
    pod_abnormal_type: 'ContainerCreating',
    status_keywords: ['ContainerCreating'],
    entities: [{ kind: 'Pod', namespace: 'aiops-case-03', name: 'workload-5b5fc86c8c-qg8k6' }],
  },
  {
    group_id: 'g3',
    pod_abnormal_type: 'CrashLoopBackOffRuntime',
    status_keywords: ['CrashLoopBackOff'],
    entities: [{ kind: 'Pod', namespace: 'aiops-case-06', name: 'workload-7679bcf76-tbg7w' }],
  },
  {
    group_id: 'g4',
    pod_abnormal_type: 'NotReady',
    status_keywords: ['NotReady'],
    entities: [{ kind: 'Pod', namespace: 'aiops-case-09', name: 'workload-5f4fb9ff45-4tsmr' }],
  },
  {
    group_id: 'g5',
    pod_abnormal_type: 'CrashLoopBackOffRuntime',
    status_keywords: ['RecentRestart'],
    entities: [{ kind: 'Pod', namespace: 'aiops-case-10', name: 'workload-79d9f8fd88-mkqkv' }],
  },
]

test('extracts five authoritative groups from a real-shaped layer snapshot', async () => {
  const { extractParallelEvidenceGroups } = await loadModel()

  const groups = extractParallelEvidenceGroups({
    layer_analysis: JSON.stringify({ abnormal_groups: realGroups }),
  })

  assert.equal(groups.length, 5)
  assert.deepEqual(groups[2], {
    groupId: 'g3',
    abnormalType: 'CrashLoopBackOffRuntime',
    statusKeywords: ['CrashLoopBackOff'],
    entities: [
      { kind: 'Pod', namespace: 'aiops-case-06', name: 'workload-7679bcf76-tbg7w' },
    ],
    results: [],
  })
})

test('accepts fenced layer JSON and rejects two-group non-parallel workflows', async () => {
  const { extractParallelEvidenceGroups } = await loadModel()
  const fenced = `\`\`\`json\n${JSON.stringify({ abnormal_groups: realGroups })}\n\`\`\``

  assert.equal(extractParallelEvidenceGroups({ layer_analysis: fenced }).length, 5)
  assert.deepEqual(
    extractParallelEvidenceGroups({
      layer_analysis: JSON.stringify({ abnormal_groups: realGroups.slice(0, 2) }),
    }),
    [],
  )
})

test('malformed or incomplete layer analysis safely disables grouping', async () => {
  const { extractParallelEvidenceGroups } = await loadModel()

  assert.deepEqual(extractParallelEvidenceGroups({ layer_analysis: '{bad' }), [])
  assert.deepEqual(extractParallelEvidenceGroups(undefined), [])
  assert.deepEqual(
    extractParallelEvidenceGroups({
      layer_analysis: { abnormal_groups: [{ group_id: 'g1', entities: [] }] },
    }),
    [],
  )
})

test('parses observability dimension, source, and exact entity from a result preview', async () => {
  const { parseParallelResultMetadata } = await loadModel()
  const metadata = parseParallelResultMetadata(
    'query_pod_logs',
    'OBSERVABILITY_QUERY={"tool":"query_pod_logs","source_system":"elasticsearch","dimension":"logging"}\n' +
      'ENTITY={"kind":"Pod","namespace":"aiops-case-06","name":"pod-a"}',
  )

  assert.deepEqual(metadata, {
    dimension: 'logging',
    sourceSystem: 'elasticsearch',
    entity: { kind: 'Pod', namespace: 'aiops-case-06', name: 'pod-a' },
  })
})

test('balanced marker parsing supports nested JSON and infers Kubernetes tools', async () => {
  const { parseParallelResultMetadata } = await loadModel()
  const nested = parseParallelResultMetadata(
    'query_pod_tracing',
    'OBSERVABILITY_QUERY={"source_system":"deepflow+tempo","dimension":"tracing","facts":[{"labels":{"code":503}}]}\n' +
      'ENTITY={"kind":"Pod","namespace":"ns-a","name":"pod-a"}',
  )

  assert.equal(nested.dimension, 'tracing')
  assert.equal(nested.sourceSystem, 'deepflow+tempo')
  assert.deepEqual(parseParallelResultMetadata('kubectl_describe', 'plain preview'), {
    dimension: 'kubernetes',
  })
  assert.deepEqual(parseParallelResultMetadata('run_bash_command', 'plain preview'), {
    dimension: 'other',
  })
})

test('parses exact Pod identity from real Kubernetes summary labels', async () => {
  const { parseParallelResultMetadata } = await loadModel()
  const metadata = parseParallelResultMetadata(
    'kubectl_describe',
    'kubectl_describe 摘要:\n' +
      'name: workload-5b5fc86c8c-p2crm\n' +
      'namespace: aiops-case-03\n' +
      'status: Pending\n',
  )

  assert.deepEqual(metadata, {
    dimension: 'kubernetes',
    entity: {
      kind: 'Pod',
      namespace: 'aiops-case-03',
      name: 'workload-5b5fc86c8c-p2crm',
    },
  })
})

test('same-name results returned out of order map to exact Pod groups', async () => {
  const {
    createParallelEvidenceState,
    extractParallelEvidenceGroups,
    finishParallelTool,
    startParallelTool,
  } = await loadModel()
  const groups = extractParallelEvidenceGroups({
    layer_analysis: JSON.stringify({ abnormal_groups: realGroups }),
  })
  let state = createParallelEvidenceState(groups)
  state = startParallelTool(state, {
    id: 'tool-1', toolName: 'execute_pod_promql', status: 'running',
  })
  state = startParallelTool(state, {
    id: 'tool-2', toolName: 'execute_pod_promql', status: 'running',
  })

  state = finishParallelTool(
    state,
    'execute_pod_promql',
    'success',
    'OBSERVABILITY_QUERY={"source_system":"prometheus","dimension":"metrics"}\n' +
      'ENTITY={"kind":"Pod","namespace":"aiops-case-03","name":"workload-5b5fc86c8c-qg8k6"}\nresult-two',
    '{"sequence":2}',
  )
  state = finishParallelTool(
    state,
    'execute_pod_promql',
    'success',
    'OBSERVABILITY_QUERY={"source_system":"prometheus","dimension":"metrics"}\n' +
      'ENTITY={"kind":"Pod","namespace":"aiops-case-01","name":"workload-68c557d875-q7xwh"}\nresult-one',
    '{"sequence":1}',
  )

  assert.equal(state.groups[0].results.length, 1)
  assert.match(state.groups[0].results[0].resultPreview, /result-one/)
  assert.equal(state.groups[0].results[0].resultData, '{"sequence":1}')
  assert.equal(state.groups[1].results.length, 1)
  assert.match(state.groups[1].results[0].resultPreview, /result-two/)
  assert.equal(state.pendingTools.length, 0)
})

test('structured group context assigns a result even when the preview is truncated', async () => {
  const {
    createParallelEvidenceState,
    extractParallelEvidenceGroups,
    finishParallelTool,
  } = await loadModel()
  const groups = extractParallelEvidenceGroups({
    layer_analysis: JSON.stringify({ abnormal_groups: realGroups }),
  })

  const state = finishParallelTool(
    createParallelEvidenceState(groups),
    'kubectl_previous_logs',
    'success',
    'Command failed (exit 1): preview ends before namespace and Pod identity',
    'Command failed (exit 1): full processed summary after the 200-character boundary',
    'result-structured',
    {
      toolCallId: 'call-structured',
      evidenceContext: {
        contractVersion: 'aiops.parallel-evidence-stream.v1',
        groupId: 'g4',
        entity: realGroups[3].entities[0],
        dimension: 'kubernetes',
      },
    },
  )

  assert.equal(state.groups[3].results.length, 1)
  assert.equal(state.unassignedResults.length, 0)
  assert.deepEqual(state.groups[3].results[0].entity, realGroups[3].entities[0])
})

test('same-name calls returned in reverse pair by group and backend tool call id', async () => {
  const {
    createParallelEvidenceState,
    extractParallelEvidenceGroups,
    finishParallelTool,
    startParallelTool,
  } = await loadModel()
  const groups = extractParallelEvidenceGroups({
    layer_analysis: JSON.stringify({ abnormal_groups: realGroups }),
  })
  let state = createParallelEvidenceState(groups)
  state = startParallelTool(state, {
    id: 'ui-g1',
    backendCallId: 'call-same',
    evidenceContext: { groupId: 'g1' },
    toolName: 'kubectl_events',
    status: 'running',
  })
  state = startParallelTool(state, {
    id: 'ui-g2',
    backendCallId: 'call-same',
    evidenceContext: { groupId: 'g2' },
    toolName: 'kubectl_events',
    status: 'running',
  })

  state = finishParallelTool(
    state,
    'kubectl_events',
    'success',
    'truncated second result',
    'full second result',
    'fallback-g2',
    {
      toolCallId: 'call-same',
      evidenceContext: { groupId: 'g2', dimension: 'kubernetes' },
    },
  )
  state = finishParallelTool(
    state,
    'kubectl_events',
    'success',
    'truncated first result',
    'full first result',
    'fallback-g1',
    {
      toolCallId: 'call-same',
      evidenceContext: { groupId: 'g1', dimension: 'kubernetes' },
    },
  )

  assert.equal(state.groups[0].results[0].id, 'ui-g1')
  assert.equal(state.groups[1].results[0].id, 'ui-g2')
  assert.equal(state.pendingTools.length, 0)
})

test('exact group and call tuple wins over an earlier ungrouped pending call', async () => {
  const {
    createParallelEvidenceState,
    extractParallelEvidenceGroups,
    finishParallelTool,
    startParallelTool,
  } = await loadModel()
  const groups = extractParallelEvidenceGroups({
    layer_analysis: JSON.stringify({ abnormal_groups: realGroups }),
  })
  let state = createParallelEvidenceState(groups)
  state = startParallelTool(state, {
    id: 'ui-legacy',
    backendCallId: 'call-mixed',
    toolName: 'kubectl_events',
    status: 'running',
  })
  state = startParallelTool(state, {
    id: 'ui-g2-exact',
    backendCallId: 'call-mixed',
    evidenceContext: { groupId: 'g2' },
    toolName: 'kubectl_events',
    status: 'running',
  })

  state = finishParallelTool(
    state,
    'kubectl_events',
    'success',
    'truncated result',
    'full result',
    'fallback-result',
    {
      toolCallId: 'call-mixed',
      evidenceContext: { groupId: 'g2', dimension: 'kubernetes' },
    },
  )

  assert.equal(state.groups[1].results[0].id, 'ui-g2-exact')
  assert.deepEqual(state.pendingTools.map(tool => tool.id), ['ui-legacy'])
})

test('an unmatched structured call id never consumes a same-name pending call', async () => {
  const {
    createParallelEvidenceState,
    extractParallelEvidenceGroups,
    finishParallelTool,
    startParallelTool,
  } = await loadModel()
  const groups = extractParallelEvidenceGroups({
    layer_analysis: JSON.stringify({ abnormal_groups: realGroups }),
  })
  const running = startParallelTool(createParallelEvidenceState(groups), {
    id: 'ui-known',
    backendCallId: 'call-known',
    evidenceContext: { groupId: 'g1' },
    toolName: 'kubectl_events',
    status: 'running',
  })

  const state = finishParallelTool(
    running,
    'kubectl_events',
    'success',
    'unrelated result',
    'unrelated full result',
    'result-unknown',
    {
      toolCallId: 'call-unknown',
      evidenceContext: { groupId: 'g2', dimension: 'kubernetes' },
    },
  )

  assert.equal(state.pendingTools.length, 1)
  assert.equal(state.pendingTools[0].id, 'ui-known')
  assert.equal(state.groups[1].results[0].id, 'result-unknown')
})

test('group-only context assigns runbook evidence without fabricating a Pod', async () => {
  const {
    createParallelEvidenceState,
    extractParallelEvidenceGroups,
    finishParallelTool,
  } = await loadModel()
  const groups = extractParallelEvidenceGroups({
    layer_analysis: JSON.stringify({ abnormal_groups: realGroups }),
  })

  const state = finishParallelTool(
    createParallelEvidenceState(groups),
    'fetch_runbook',
    'success',
    'runbook summary without entity',
    'full processed runbook summary',
    'runbook-result',
    {
      toolCallId: 'call-runbook',
      evidenceContext: { groupId: 'g3', dimension: 'other' },
    },
  )

  assert.equal(state.groups[2].results.length, 1)
  assert.equal(state.groups[2].results[0].entity, undefined)
  assert.equal(state.groups[2].results[0].scope, 'group')
  assert.equal(state.unassignedResults.length, 0)
})

test('group-only structured context never upgrades preview Pod text into an entity', async () => {
  const {
    createParallelEvidenceState,
    extractParallelEvidenceGroups,
    finishParallelTool,
  } = await loadModel()
  const groups = extractParallelEvidenceGroups({
    layer_analysis: JSON.stringify({ abnormal_groups: realGroups }),
  })
  const pod = realGroups[2].entities[0]

  const state = finishParallelTool(
    createParallelEvidenceState(groups),
    'fetch_runbook',
    'success',
    `runbook example only\nENTITY=${JSON.stringify(pod)}`,
    'full processed runbook summary',
    'runbook-preview-pod',
    {
      toolCallId: 'call-runbook-preview',
      evidenceContext: { groupId: 'g3', dimension: 'other' },
    },
  )

  assert.equal(state.groups[2].results[0].entity, undefined)
  assert.equal(state.groups[2].results[0].scope, 'group')
})

test('structured entity kind must match the authoritative group entity kind', async () => {
  const {
    createParallelEvidenceState,
    extractParallelEvidenceGroups,
    finishParallelTool,
  } = await loadModel()
  const serviceGroups = realGroups.map((group, index) => (
    index === 0
      ? { ...group, entities: [{ ...group.entities[0], kind: 'Service' }] }
      : group
  ))
  const groups = extractParallelEvidenceGroups({
    layer_analysis: JSON.stringify({ abnormal_groups: serviceGroups }),
  })

  const state = finishParallelTool(
    createParallelEvidenceState(groups),
    'kubectl_get_by_name',
    'success',
    'structured result',
    'full structured result',
    'kind-mismatch',
    {
      evidenceContext: {
        groupId: 'g1',
        dimension: 'kubernetes',
        entity: { ...realGroups[0].entities[0], kind: 'Pod' },
      },
    },
  )

  assert.equal(state.groups[0].results[0].entity, undefined)
  assert.equal(state.groups[0].results[0].scope, 'group')
})

test('structured collector events route only to the grouped board', async () => {
  const { shouldRouteOnlyToParallelBoard } = await loadModel()

  assert.equal(
    shouldRouteOnlyToParallelBoard('evidence', { groupId: 'g2' }, true),
    true,
  )
  assert.equal(shouldRouteOnlyToParallelBoard('evidence', undefined, true), false)
  assert.equal(shouldRouteOnlyToParallelBoard('parallel_evidence', undefined, true), true)
  assert.equal(
    shouldRouteOnlyToParallelBoard('evidence', { groupId: 'g2' }, false),
    false,
  )
})

test('semantic failure overrides transport success and full processed result beats preview', async () => {
  const {
    createParallelEvidenceState,
    extractParallelEvidenceGroups,
    finishParallelTool,
    resolveParallelResultData,
  } = await loadModel()
  const groups = extractParallelEvidenceGroups({
    layer_analysis: JSON.stringify({ abnormal_groups: realGroups }),
  })
  const event = {
    result_preview: 'Command failed (exit 1)',
    result: 'Command failed (exit 1): full processed result after preview boundary',
  }

  const state = finishParallelTool(
    createParallelEvidenceState(groups),
    'kubectl_previous_logs',
    'success',
    event.result_preview,
    resolveParallelResultData(event),
    'semantic-failure',
    {
      semanticSuccess: false,
      evidenceContext: { groupId: 'g4', dimension: 'kubernetes' },
    },
  )

  assert.equal(state.groups[3].results[0].status, 'error')
  assert.equal(state.groups[3].results[0].resultData, event.result)
  assert.notEqual(state.groups[3].results[0].resultData, event.result_preview)
})

test('failed unmatched result remains visible and does not replace group evidence', async () => {
  const {
    createParallelEvidenceState,
    extractParallelEvidenceGroups,
    finishParallelTool,
  } = await loadModel()
  const groups = extractParallelEvidenceGroups({
    layer_analysis: JSON.stringify({ abnormal_groups: realGroups }),
  })
  let state = createParallelEvidenceState(groups)
  state = finishParallelTool(
    state,
    'query_pod_logs',
    'success',
    'OBSERVABILITY_QUERY={"dimension":"logging"}\n' +
      'ENTITY={"kind":"Pod","namespace":"aiops-case-06","name":"workload-7679bcf76-tbg7w"}',
    '{"success":true}',
    'result-success',
  )
  state = finishParallelTool(
    state,
    'run_bash_command',
    'error',
    'command failed without entity identity',
    '{"success":false}',
    'result-error',
  )

  assert.equal(state.groups[2].results.length, 1)
  assert.equal(state.groups[2].results[0].status, 'success')
  assert.equal(state.unassignedResults.length, 1)
  assert.equal(state.unassignedResults[0].status, 'error')
  assert.equal(state.unassignedResults[0].id, 'result-error')
})

test('dimension counts remain independent and state is serializable', async () => {
  const {
    createParallelEvidenceState,
    dimensionCounts,
    extractParallelEvidenceGroups,
    finishParallelTool,
  } = await loadModel()
  const groups = extractParallelEvidenceGroups({
    layer_analysis: JSON.stringify({ abnormal_groups: realGroups }),
  })
  let state = createParallelEvidenceState(groups)
  const target = 'ENTITY={"kind":"Pod","namespace":"aiops-case-06","name":"workload-7679bcf76-tbg7w"}'
  for (const [toolName, dimension] of [
    ['kubectl_describe', 'kubernetes'],
    ['execute_pod_promql', 'metrics'],
    ['query_pod_logs', 'logging'],
    ['query_pod_tracing', 'tracing'],
    ['query_pod_topology', 'topology'],
  ]) {
    state = finishParallelTool(
      state,
      toolName,
      'success',
      `OBSERVABILITY_QUERY={"dimension":"${dimension}"}\n${target}`,
      `{"dimension":"${dimension}"}`,
    )
  }

  assert.deepEqual(dimensionCounts(state.groups[2]), {
    kubernetes: 1,
    metrics: 1,
    logging: 1,
    tracing: 1,
    topology: 1,
    other: 0,
  })
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state)
})

test('completion preserves unfinished tools instead of inventing success', async () => {
  const {
    completeParallelEvidence,
    createParallelEvidenceState,
    extractParallelEvidenceGroups,
    startParallelTool,
  } = await loadModel()
  const groups = extractParallelEvidenceGroups({
    layer_analysis: JSON.stringify({ abnormal_groups: realGroups }),
  })
  const running = startParallelTool(createParallelEvidenceState(groups), {
    id: 'pending-1', toolName: 'query_pod_tracing', status: 'running',
  })

  const complete = completeParallelEvidence(running)

  assert.equal(complete.status, 'complete')
  assert.equal(complete.pendingTools.length, 1)
  assert.equal(complete.pendingTools[0].status, 'running')
})

test('a mirrored fallback tool reopens a board completed before evidence events arrived', async () => {
  const {
    completeParallelEvidence,
    createParallelEvidenceState,
    extractParallelEvidenceGroups,
    startParallelTool,
  } = await loadModel()
  const groups = extractParallelEvidenceGroups({
    layer_analysis: JSON.stringify({ abnormal_groups: realGroups }),
  })
  const complete = completeParallelEvidence(createParallelEvidenceState(groups))

  const resumed = startParallelTool(complete, {
    id: 'fallback-tool-1', toolName: 'kubectl_describe', status: 'running',
  })

  assert.equal(resumed.status, 'running')
  assert.equal(resumed.pendingTools.length, 1)
})
