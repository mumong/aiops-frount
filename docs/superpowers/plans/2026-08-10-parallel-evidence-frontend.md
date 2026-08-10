# Parallel Evidence Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a precise, streaming, per-anomaly Evidence board to the existing React chat UI without changing Backend behavior or regressing the existing single-anomaly workflow.

**Architecture:** Parse the authoritative anomaly catalog from the Layer snapshot, maintain an optional immutable `parallelEvidence` presentation state on the existing `NodeBlock`, and attribute returned tools by exact entity identity. Render that state in one isolated React component while preserving the existing node timeline, thinking stream, final Markdown, history, and remediation flow.

**Tech Stack:** React 18, TypeScript 5.6, Vite 6, CSS Modules, Node test runner, React server rendering for component contracts.

---

### Task 1: Parse authoritative anomaly groups and result identity

**Files:**
- Modify: `src/components/aiops-chat/types.ts`
- Create: `src/components/aiops-chat/parallelEvidenceModel.ts`
- Create: `tests/parallel-evidence-model.test.mjs`

- [ ] **Step 1: Write the failing parsing tests**

Create a real-shaped five-group `layer_analysis` string and tests that import the TypeScript model through `typescript.transpileModule`:

```js
test('extracts five authoritative groups from layer snapshot', async () => {
  const { extractParallelEvidenceGroups } = await loadModel()
  const groups = extractParallelEvidenceGroups({
    layer_analysis: JSON.stringify({ abnormal_groups: realGroups }),
  })
  assert.equal(groups.length, 5)
  assert.deepEqual(groups[2].entities[0], {
    kind: 'Pod', namespace: 'aiops-case-06', name: 'workload-7679bcf76-tbg7w',
  })
})

test('malformed layer analysis safely disables the board', async () => {
  const { extractParallelEvidenceGroups } = await loadModel()
  assert.deepEqual(extractParallelEvidenceGroups({ layer_analysis: '{bad' }), [])
})

test('parses observability dimension and exact entity from result preview', async () => {
  const { parseParallelResultMetadata } = await loadModel()
  const metadata = parseParallelResultMetadata(
    'query_pod_logs',
    'OBSERVABILITY_QUERY={"source_system":"elasticsearch","dimension":"logging"}\n' +
      'ENTITY={"kind":"Pod","namespace":"aiops-case-06","name":"pod-a"}',
  )
  assert.equal(metadata.dimension, 'logging')
  assert.equal(metadata.sourceSystem, 'elasticsearch')
  assert.equal(metadata.entity.namespace, 'aiops-case-06')
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/parallel-evidence-model.test.mjs`

Expected: FAIL because `parallelEvidenceModel.ts` and its exports do not exist.

- [ ] **Step 3: Add exact optional presentation types**

Add to `types.ts`:

```ts
export type EvidenceDimension =
  | 'kubernetes' | 'metrics' | 'logging' | 'tracing' | 'topology' | 'other'

export interface EvidenceEntity {
  kind: string
  namespace: string
  name: string
}

export interface ParallelEvidenceResult {
  id: string
  toolName: string
  status: 'success' | 'error'
  resultPreview: string
  resultData: string
  dimension: EvidenceDimension
  sourceSystem?: string
  entity?: EvidenceEntity
}

export interface ParallelEvidenceGroup {
  groupId: string
  abnormalType: string
  statusKeywords: string[]
  entities: EvidenceEntity[]
  results: ParallelEvidenceResult[]
}

export interface ParallelEvidenceState {
  status: 'running' | 'complete'
  groups: ParallelEvidenceGroup[]
  pendingTools: ToolCall[]
  unassignedResults: ParallelEvidenceResult[]
}
```

Add `parallelEvidence?: ParallelEvidenceState` to `NodeBlock`, add the label `parallel_evidence: '⚡ 并发证据采集'`, and place it after `layer` in `NODE_ORDER`.

- [ ] **Step 4: Implement defensive marker parsing**

In `parallelEvidenceModel.ts`, implement these exports:

```ts
export function extractParallelEvidenceGroups(
  snapshot: Record<string, unknown> | undefined,
): ParallelEvidenceGroup[]

export function parseParallelResultMetadata(
  toolName: string,
  resultPreview: string,
): {
  dimension: EvidenceDimension
  sourceSystem?: string
  entity?: EvidenceEntity
}
```

Use a balanced-brace JSON scanner for `OBSERVABILITY_QUERY=` and `ENTITY=` markers. Accept `layer_analysis` as an object, plain JSON string, or fenced JSON string. Return groups only when there are more than two valid records. Infer `kubernetes` for `kubectl_*` and `kubernetes_*`; otherwise use `other` when no structured dimension exists.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test tests/parallel-evidence-model.test.mjs`

Expected: all parsing tests pass.

### Task 2: Maintain immutable parallel tool state without losing evidence

**Files:**
- Modify: `src/components/aiops-chat/parallelEvidenceModel.ts`
- Modify: `tests/parallel-evidence-model.test.mjs`

- [ ] **Step 1: Write failing concurrency and retention tests**

```js
test('same-name results returned out of order map to exact pod groups', async () => {
  const { createParallelEvidenceState, startParallelTool, finishParallelTool } = await loadModel()
  let state = createParallelEvidenceState(realGroups)
  state = startParallelTool(state, { id: 't1', toolName: 'execute_pod_promql', status: 'running' })
  state = startParallelTool(state, { id: 't2', toolName: 'execute_pod_promql', status: 'running' })
  state = finishParallelTool(
    state,
    'execute_pod_promql',
    'success',
    'OBSERVABILITY_QUERY={"dimension":"metrics"}\nENTITY={"kind":"Pod","namespace":"ns-2","name":"g2-pod"}\nresult-two',
    '{}',
  )
  state = finishParallelTool(
    state,
    'execute_pod_promql',
    'success',
    'OBSERVABILITY_QUERY={"dimension":"metrics"}\nENTITY={"kind":"Pod","namespace":"ns-1","name":"g1-pod"}\nresult-one',
    '{}',
  )
  assert.equal(state.groups[0].results[0].resultPreview, 'result-one')
  assert.equal(state.groups[1].results[0].resultPreview, 'result-two')
  assert.equal(state.pendingTools.length, 0)
})

test('failed unmatched result remains visible', async () => {
  const { finishParallelTool } = await loadModel()
  const next = finishParallelTool(state, 'run_bash_command', 'error', 'failed', '{"error":true}')
  assert.equal(next.unassignedResults.length, 1)
  assert.equal(next.unassignedResults[0].status, 'error')
})
```

Add assertions that metrics, logging, tracing, topology, and Kubernetes counts remain independent and that JSON serialization preserves the complete state.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/parallel-evidence-model.test.mjs`

Expected: FAIL because the immutable state operations do not exist.

- [ ] **Step 3: Implement minimal immutable operations**

Add:

```ts
export function createParallelEvidenceState(
  groups: ParallelEvidenceGroup[],
): ParallelEvidenceState

export function startParallelTool(
  state: ParallelEvidenceState,
  tool: ToolCall,
): ParallelEvidenceState

export function finishParallelTool(
  state: ParallelEvidenceState,
  toolName: string,
  status: string,
  resultPreview: string,
  resultData: string,
  fallbackId?: string,
): ParallelEvidenceState

export function completeParallelEvidence(
  state: ParallelEvidenceState,
): ParallelEvidenceState

export function dimensionCounts(
  group: ParallelEvidenceGroup,
): Record<EvidenceDimension, number>
```

`finishParallelTool` removes one pending tool with the same name, creates a result using the parsed entity, matches only one exact namespace/name group, and otherwise appends to `unassignedResults`. It never removes previous results.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/parallel-evidence-model.test.mjs`

Expected: all parser, concurrency, failure, dimension, and serialization tests pass.

### Task 3: Render the grouped board with collapsed accessible cards

**Files:**
- Create: `src/components/aiops-chat/ParallelEvidenceBoard.tsx`
- Create: `src/components/aiops-chat/ParallelEvidenceBoard.module.css`
- Create: `tests/parallel-evidence-board.test.mjs`

- [ ] **Step 1: Write a failing SSR interaction contract test**

Use Vite `ssrLoadModule` plus `react-dom/server`:

```js
test('renders every group collapsed and keeps tool details hidden initially', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: Board } = await server.ssrLoadModule(
      '/src/components/aiops-chat/ParallelEvidenceBoard.tsx',
    )
    const html = renderToStaticMarkup(createElement(Board, { state }))
    assert.match(html, /5 个异常组/)
    assert.match(html, /g1/)
    assert.match(html, /aria-expanded="false"/)
    assert.doesNotMatch(html, /execute_pod_promql/)
  } finally {
    await server.close()
  }
})
```

Add a second test with pending, failed, and unassigned evidence and assert all three summary counts render.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/parallel-evidence-board.test.mjs`

Expected: FAIL because the board component does not exist.

- [ ] **Step 3: Implement the board**

The component signature is:

```tsx
export default function ParallelEvidenceBoard({
  state,
}: {
  state: ParallelEvidenceState
})
```

Use `useState<Set<string>>(() => new Set())` so every group is collapsed by default. Render board totals, an indeterminate streaming bar, responsive group buttons, exact entity labels, dimension badges, pending calls, and unassigned results. Each expanded result renders status, tool name, source, full preview, and a nested disclosure containing `resultData`.

- [ ] **Step 4: Implement isolated responsive styling**

Use a two-column grid above 780px and one column below it. Match the current blue/green palette, use visible focus rings, avoid horizontal page scrolling, and constrain raw details with internal scrolling.

- [ ] **Step 5: Run board tests and production compilation**

Run: `node --test tests/parallel-evidence-board.test.mjs && npm run build`

Expected: board tests pass and Vite completes without TypeScript errors.

### Task 4: Wire real SSE events into the existing NodeBlock flow

**Files:**
- Modify: `src/components/aiops-chat/ChatWidget.tsx`
- Modify: `src/components/aiops-chat/BotMessage.tsx`
- Modify: `tests/node-block-updates.test.mjs`
- Create: `tests/parallel-evidence-wiring.test.mjs`

- [ ] **Step 1: Write failing wiring contract tests**

Test the required integration points before editing production code:

```js
test('ChatWidget consumes layer snapshots and routes parallel tool events', () => {
  const source = readFileSync(chatWidgetPath, 'utf8')
  assert.match(source, /extractParallelEvidenceGroups/)
  assert.match(source, /startParallelTool/)
  assert.match(source, /finishParallelTool/)
  assert.match(source, /completeParallelEvidence/)
})

test('BotMessage renders the board only when parallel state exists', () => {
  const source = readFileSync(botMessagePath, 'utf8')
  assert.match(source, /block\.parallelEvidence/)
  assert.match(source, /ParallelEvidenceBoard/)
})
```

Extend the existing NodeBlock regression data with no `parallelEvidence` field and assert existing thinking/tool updates still produce the same deep equality output.

- [ ] **Step 2: Run wiring and regression tests and verify RED**

Run: `node --test tests/parallel-evidence-wiring.test.mjs tests/node-block-updates.test.mjs`

Expected: wiring test fails; existing regressions remain green.

- [ ] **Step 3: Capture the Layer catalog synchronously**

In `ChatWidget`, add a `parallelGroupsRef`. On `node_complete` for `layer`, call `extractParallelEvidenceGroups(data.state_snapshot)` and assign the returned groups to the ref. Do not alter the normal completion handling.

- [ ] **Step 4: Seed and update only the parallel node**

On `node_start` for `parallel_evidence`, create the normal block and attach `createParallelEvidenceState(parallelGroupsRef.current)` when the catalog has more than two groups.

For `thinking` events whose node is `parallel_evidence` and whose block has parallel state:

- `tool_start`: call `startParallelTool` and do not duplicate the tool in generic `toolCalls`;
- `tool_result`: call `finishParallelTool` with the complete event JSON as `resultData`;
- `ai_token` and `ai_message`: keep the existing shared `thinkingTokens` behavior.

On `node_complete` for `parallel_evidence`, call `completeParallelEvidence` and complete the normal node.

- [ ] **Step 5: Keep the live ref and history snapshot current**

Introduce one `updateNodeBlocks` callback that updates `nodeBlocksRef.current` inside the React state updater before returning the next blocks. Route all SSE-driven NodeBlock updates through it so a following `final` event always saves the latest grouped state.

- [ ] **Step 6: Render the board without changing normal nodes**

In `NodeBlockCard`, initialize the outer node disclosure open for `parallel_evidence`, render `ParallelEvidenceBoard` before shared thinking when `block.parallelEvidence` exists, and retain the existing generic tool list for every other node.

- [ ] **Step 7: Run focused integration tests and build**

Run: `node --test tests/parallel-evidence-wiring.test.mjs tests/node-block-updates.test.mjs tests/parallel-evidence-model.test.mjs tests/parallel-evidence-board.test.mjs && npm run build`

Expected: all focused tests and TypeScript/Vite build pass.

### Task 5: Full regression, real stream acceptance, release, and deployment

**Files:**
- Modify: `VERSION`
- Modify: `deploy/k8s-simple.yaml`
- Test: `tests/deployment-files.test.mjs`

- [ ] **Step 1: Run complete local quality gates**

Run: `npm test && npm run lint && npm run build`

Expected: every Node test passes, ESLint reports no errors, and Vite builds the production bundle.

- [ ] **Step 2: Run a real multi-anomaly SSE diagnosis**

Use the deployed Backend `/ask?format=sse&stream=true` against the current cluster with more than two abnormal Pods. Confirm the stream contains a Layer snapshot with at least three `abnormal_groups`, a `parallel_evidence` node, interleaved tool events, and a final report.

- [ ] **Step 3: Bump and test the Frontend release**

Increment `VERSION` from `0.1.1` to `0.1.2` and update the image in `deploy/k8s-simple.yaml` to `xnet.registry.io:8443/xnet-cloud/aiops-copilot-frontend:0.1.2`.

Run: `node --test tests/deployment-files.test.mjs`

Expected: deployment contract passes with matching version and image.

- [ ] **Step 4: Build, push, and deploy the Frontend image**

Run: `make build push deploy`

Expected: Harbor push returns a digest and `kubectl rollout status deployment/aiops-copilot-frontend -n aiops` succeeds.

- [ ] **Step 5: Verify the deployed UI and cluster state**

Check the deployed image ID, Pod Ready state, restart count, browser rendering of the real multi-group stream, expandable tool detail, unchanged final Markdown, and one single-Pod diagnosis path.

- [ ] **Step 6: Commit and synchronize the completed Frontend**

Stage only Frontend source, tests, docs, `VERSION`, and its deployment manifest. Commit the implementation, then push `main` to GitLab and GitHub using the configured remotes and `/root/vpn.txt` for GitHub connectivity.
