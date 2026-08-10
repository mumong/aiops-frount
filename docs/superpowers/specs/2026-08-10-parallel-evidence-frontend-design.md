# Parallel Evidence Frontend Design

## Goal

Adapt the existing React chat UI to the Backend's multi-anomaly `parallel_evidence` workflow without changing Backend code, replacing the current single mixed Evidence stream with a precise, readable per-group presentation while preserving streaming output, tool details, final Markdown, history, and the existing single-anomaly path.

## Confirmed product decisions

- Use the existing `ChatWidget -> SSE -> NodeBlock -> ToolCall -> MarkdownReport` architecture.
- Add a grouped-card overview only for the `parallel_evidence` node.
- Keep every group collapsed by default. Operators explicitly expand a group to inspect its tools.
- Keep the current rendering for `evidence` and all workflows with at most two anomaly groups.
- Do not introduce Ant Design X, assistant-ui, another agent runtime, or a new state library.
- Borrow the interaction patterns of Ant Design X ThoughtChain and assistant-ui Tool UI: compact status first, details on demand, streaming state visible, raw tool output retained.
- Do not parse or rewrite the final conclusion. `MarkdownReport` remains the authoritative report renderer.

## Authoritative Backend inputs

The existing SSE protocol already provides enough information for a safe frontend-only adaptation:

1. `node_complete` for `layer` contains `state_snapshot.layer_analysis` as a JSON string. Its `abnormal_groups` array provides authoritative `group_id`, `pod_abnormal_type`, `status_keywords`, and exact Pod entities.
2. `node_start` identifies the `parallel_evidence` node.
3. `thinking/tool_start` identifies a pending tool, but does not include `group_id` or entity arguments.
4. `thinking/tool_result` includes `result_preview`. Observability results contain source-backed `OBSERVABILITY_QUERY={...}` and `ENTITY={...}` records with dimension and exact namespace/Pod identity.
5. `node_complete` marks the whole `parallel_evidence` node complete. Its snapshot is currently empty, so the frontend must not depend on per-group completion data there.
6. `final` carries the existing deterministic evidence report and LLM conclusion.

Because `tool_start` has no entity, the UI must not guess a group while the call is pending. It shows pending calls at board level, then moves each returned result into a group only after exact entity matching. Unmatched results remain visible in an explicit unassigned section.

## Frontend state model

`NodeBlock` gains one optional `parallelEvidence` field so all existing nodes remain source-compatible.

```ts
interface ParallelEvidenceState {
  groups: ParallelEvidenceGroup[]
  pendingTools: ToolCall[]
  unassignedResults: ParallelEvidenceResult[]
  status: 'running' | 'complete'
}

interface ParallelEvidenceGroup {
  groupId: string
  abnormalType: string
  statusKeywords: string[]
  entities: EvidenceEntity[]
  results: ParallelEvidenceResult[]
}

interface ParallelEvidenceResult {
  id: string
  toolName: string
  status: 'success' | 'error'
  resultPreview: string
  resultData: string
  dimension: 'kubernetes' | 'metrics' | 'logging' | 'tracing' | 'topology' | 'other'
  sourceSystem?: string
  entity?: EvidenceEntity
}
```

The optional field is persisted automatically because chat history already stores complete `NodeBlock[]` snapshots.

## Event flow

### Layer completion

Parse `state_snapshot.layer_analysis` defensively. Accept a JSON string or object. Extract `abnormal_groups` only when at least three valid groups with exact IDs exist. Cache the catalog for the current assistant message. Malformed or incomplete data leaves the existing UI unchanged.

### Parallel node start

Create the normal `NodeBlock` and attach a `ParallelEvidenceState` seeded from the cached group catalog. The node label is `并发证据采集`. Board-level streaming state begins immediately.

### Tool start

Append the tool to `pendingTools`. The board shows the pending count and the existing shared thinking stream, but does not place the call inside a group.

### Tool result

Parse the structured marker records in `result_preview` using a balanced-JSON scanner rather than a greedy regular expression. Normalize the source dimension. Match exact `namespace + pod/name` against each group's Pod entities.

- Exactly one match: remove one pending call with the same tool name and append the result to that group.
- No match or ambiguous match: remove one pending call with the same tool name and append the result to `unassignedResults`.
- Failed result: retain it with error status in the matched group or unassigned section.
- Duplicate tool names are safe because attribution comes from the returned entity, not call order.

Non-observability Kubernetes tool previews may not carry `ENTITY`. They remain unassigned instead of being incorrectly attributed. This preserves all evidence while respecting the current Backend contract.

### Parallel node completion

Set the board and normal node block to complete. Any still-pending calls remain visible as unfinished. Do not synthesize per-group success when the Backend did not provide it.

### Final event

Keep the current `MarkdownReport` unchanged below the workflow cards. The final report remains the only source for group summaries, causality, confidence, deterministic evidence tables, and remediation output.

## Visual design

The board appears inside the expanded `parallel_evidence` NodeBlock.

- Header: anomaly group count, returned result count, pending count, failed count, and an indeterminate streaming bar while running.
- Body: responsive two-column group-card grid on desktop and one column on narrow screens.
- Group card collapsed by default: group ID, normalized anomaly type, exact namespace/Pod, status keywords, returned result count, and dimension badges.
- Group card expanded by operator: independent Kubernetes, Metrics, Logging, Tracing, Topology, and Other counts plus the complete tool list.
- Tool row: status, exact tool name, source system, and bounded preview. A nested disclosure displays the complete SSE result payload already available to the frontend.
- Unassigned section: visible only when it contains returned evidence or pending tools. It explains why attribution is waiting or unavailable.
- Shared reasoning: retains the existing thinking stream in a separate collapsed section; it is not duplicated into groups without authoritative group identity.

Group cards use real buttons and `aria-expanded`, clear focus states, sufficient contrast, and no hover-only information.

## File boundaries

- Create `src/components/aiops-chat/parallelEvidenceModel.ts`: pure parsing and immutable state updates.
- Create `src/components/aiops-chat/ParallelEvidenceBoard.tsx`: rendering and local disclosure state.
- Create `src/components/aiops-chat/ParallelEvidenceBoard.module.css`: isolated responsive visual treatment.
- Modify `src/components/aiops-chat/types.ts`: optional state interfaces and `parallel_evidence` label/order.
- Modify `src/components/aiops-chat/nodeBlockUpdates.ts`: seed, start, result, and completion adapters around the pure model.
- Modify `src/components/aiops-chat/ChatWidget.tsx`: consume layer snapshot and route parallel events.
- Modify `src/components/aiops-chat/BotMessage.tsx`: render the new board only when present.
- Create `tests/parallel-evidence-model.test.mjs`: model and parsing regressions.
- Extend `tests/node-block-updates.test.mjs`: integration with `NodeBlock` updates.

## Error handling and compatibility

- A parser failure returns an empty catalog and never interrupts SSE handling.
- Missing entity identity never drops or guesses evidence.
- A single tool failure cannot replace successful results from the same group.
- Pending calls at stream completion remain visible.
- Existing `evidence`, `layer`, `rca`, `conclusion`, remediation, non-SSE text fallback, and history behavior remain unchanged.
- No Backend, deployment protocol, or API request changes are in scope.

## Verification

Automated tests must prove:

- five valid groups are extracted from real-shaped `layer_analysis`;
- malformed Layer JSON falls back safely;
- same-name tool results returned out of order map to the correct Pods;
- Kubernetes, Prometheus, Elasticsearch, DeepFlow/Tempo, and topology dimensions remain independent;
- failed and unassigned results are retained;
- all groups are collapsed by default in the rendered interaction contract;
- the pre-existing `NodeBlock` behavior remains unchanged when no parallel state exists;
- history-compatible state is serializable;
- all existing tests, TypeScript compilation, lint, and production build pass.

Runtime acceptance uses a real cluster query with more than two anomaly groups. The deployed Frontend must visibly show one collapsed card per Layer group, live pending/result counts, correctly attributed observability results, expandable tool payloads, the complete final Markdown report, and no regression in a single-Pod diagnosis.

## References

- Ant Design X ThoughtChain: <https://x.ant.design/components/thought-chain/>
- Ant Design X repository: <https://github.com/ant-design/x>
- assistant-ui repository and Tool UI patterns: <https://github.com/assistant-ui/assistant-ui>
- LangGraph Agent Chat UI streaming patterns: <https://github.com/langchain-ai/agent-chat-ui>

These are interaction references only; no dependency or runtime migration is planned.
