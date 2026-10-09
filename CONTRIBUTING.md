# Contributing

## Reproducible checks

Use Node.js 24 LTS and npm. ESLint 10 requires Node 20.19+, 22.13+ or 24+.
Run `npm ci`, then `make check` (tests, lint, TypeScript and Vite build, in order).
`make test`, `make lint`, and `make app-build` run the individual checks.
`make build` retains its existing meaning: Docker image build, not local checks.
Browser replay instructions and unverified boundaries are in [docs/testing.md](docs/testing.md).

## Module boundaries

- `ChatWidget.tsx` owns session navigation, the running-session list and per-session draft caches. Navigation does not cancel background runs.
- `ChatSessionPanel.tsx` owns one session's React state, synchronous snapshots and SSE connection. Running panels remain mounted while hidden so approval UI state survives navigation. Stream closure saves by session ID before an inactive panel unmounts; final reports alone keep the panel mounted for later approvals; stale callbacks after stop/delete must be ignored.
- `chatEventTransition.ts` takes explicit run state, an event and a timestamp; it returns new run state and ordered message updates. It must not fetch, persist, or read the clock.
- `useSSE.ts` owns fetch and abort; `sseDecoder.ts` owns incremental framing, not JSON interpretation.
- Display components retain their existing DOM, CSS Modules, labels and expansion defaults. Pure parsing and presentation functions stay separate from React.
- `useChatHistory.ts` owns the existing `aiops_chat_sessions` storage format. Saving by explicit session ID must not change the active view. Schema changes require migration and legacy-history tests.

Prefer focused modules and two-space indentation. React components use PascalCase; hooks and utility modules use camelCase. Preserve existing names instead of mechanically renaming the repository. User-visible text is currently Chinese; do not translate or rewrite it during structural refactoring.

## Behavior-preserving changes

First characterize existing behavior, then extract it and run the same assertions. Prefer event replay and rendered output over regex assertions about implementation location.
Keep synchronous node snapshots, captured request endpoint/session identity, backend tool-call and group matching, semantic failure precedence, and ordered approval upserts.
The final report event does not close the stream: approvals and remediation results can follow it. Heartbeats are activity but not visible analysis progress.
Do not combine protocol expansion, timeout changes, dependency upgrades, visual changes or behavior bug fixes with a structural refactor.

## Delivery and licensing

Do not commit, push or deploy merely to run checks. Deploy only within the authorized delivery workflow; preserve credentials, PVC data and unrelated resources. Report exact versions, rollout checks and verification gaps separately.
Deployment image versions come from `VERSION`; the private npm package version is independent metadata.
The historical README says MIT but no LICENSE file is present. Maintainers must confirm licensing and copyright before adding a license; do not infer ownership.
