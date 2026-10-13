# Frontend testing

The previously bundled skill/plugin testing guide is preserved in [skills-testing.md](skills-testing.md); it is not the application test workflow.

## Required local checks

Use Node.js 24 LTS and npm ci. Run make check from the repository root.
This runs npm test, npm run lint, and npm run build sequentially and does not contact Kubernetes.
Individual commands remain available as make test, make lint, and make app-build.
make build is the existing Docker build command, not this local verification step.

The Node built-in runner executes tests/*.test.mjs. Pure TypeScript utilities are loaded through TypeScript transpilation or Vite SSR; component checks render static React markup.
Coverage includes session request policy, streaming node/tool transitions, grouped evidence, route truthfulness, remediation approvals, handoff parsing, and deployment file contracts.
No numerical coverage claim is made. SSR does not verify browser interaction, timers or scrolling.

## Browser replay (no model or cluster writes)

Start the local application with npm run dev -- --host 127.0.0.1 --port 5175 --strictPort.
Install Python Playwright and Chromium in a suitable development environment if absent. Supply the actual Chromium executable path to each script.

~~~bash
python3 tests/autonomous-parallel.browser.py --url http://127.0.0.1:5175 --chromium /path/to/chrome --screenshot /tmp/aiops-parallel.png
python3 tests/remediation-review.browser.py --url http://127.0.0.1:5175 --chromium /path/to/chrome
python3 tests/direct-query.browser.py --url http://127.0.0.1:5175 --chromium /path/to/chrome
python3 tests/diagnosis-layout.browser.py --url http://127.0.0.1:5175 --chromium /path/to/chrome --verify --screenshots /tmp/aiops-layout
python3 tests/ui-workspace.browser.py --url http://127.0.0.1:5175 --chromium /path/to/chrome --screenshots /tmp/aiops-workspace
python3 tests/session-switch.browser.py --url http://127.0.0.1:5175 --chromium /path/to/chrome
~~~

These scripts inject fetch responses or localStorage fixtures, not real diagnosis/remediation calls. They cover out-of-order parallel results and history, approval controls after final reports, direct query rendering, desktop/mobile layout and raw result expansion.
The workspace replay also verifies shortcut draft insertion without sending, editing/reselecting suggestions, Enter/Send submission through the unified /ask routing entry and absence of manual mode controls. The session-switch replay verifies overlapping streams, background completion without navigation, per-session drafts and final snapshots, delayed approvals after final while another session is visible, preserved approval UI state, and legacy query sessions submitting through /ask, and scoped new/stop/delete behavior including late callbacks after cancellation. Clear-all coverage includes confirmation/cancellation, filtered-out sessions, mobile use, disconnection of concurrent streams, rejection of late events, persisted empty history after reload, and new conversations after clearing.
The live-parallel-replay.browser.py script additionally requires an existing sanitized JSONL capture via --events. It does not create a live capture or invoke the backend itself. Do not use or publish captured secrets.

## Refactor regression boundaries

chat-transition.test.mjs, sse-decoder.test.mjs and bot-message.test.mjs were first run against the original callback/parser implementation before extraction. They now test the exported module boundaries.
The decoder intentionally retains existing LF and spaced-field behavior, including current CRLF and incomplete UTF-8 EOF handling. Improving those semantics requires a separately authorized change.
Tests keep final reports distinct from stream closure; queued message updates and node snapshots must preserve events delivered in one browser turn.

Builds currently warn about a minified JavaScript chunk exceeding 500 kB. SSR can warn that the browser Notification API is unavailable; neither warning is a passing browser acceptance test.
Report exact commands and results, including skipped capture-based tests and existing selector drift, instead of claiming all frontend acceptance is complete.

## Structured streaming display (2026-10-13)

`structured-presentation.test.mjs` checks mixed JSON/prose, nested structures, incomplete streamed input, Markdown code fences and exact source preservation. `structured-stream.browser.py` replays real SSE handling using a mocked API at 1100px and 390px: visible incremental text, lazy expandable JSON, initially collapsed tools and unchanged persisted content. `direct-query.browser.py` remains the regression for streamed QueryAnswer and history restoration. No backend/model or cluster writes are performed by these replays. Frontend 0.1.52 changes presentation only; the existing bottom-follow behavior and backend remain unchanged.

## Repair approval experience (2026-10-12)

`tests/repair-ux.browser.py --url <frontend-url> --chromium <executable>` runs Chromium with mocked repair APIs (no real approval or cluster mutation). It checks immediate submission feedback, 20 clicks producing one POST, a 10-second timeout followed by GET status reconciliation without resubmission, approval expiry, and an explicit planning-failure/replan view. `tests/repair-transport.test.mjs` covers bounded waits and no automatic retries. The browser replay passed against deployed frontend 0.1.51; grouped-repair replay also covers group isolation and mobile layout. These checks do not prove live model or repair execution success.

## Chinese Markdown and interface wording

`markdown-report.test.mjs` checks Chinese punctuation next to bold markers in prose, lists and tables, standard Markdown and incomplete streamed labels. Inline/fenced code, escaped stars, URLs and raw HTML retain parser behavior. The compatibility plugin operates on parsed text nodes; stored messages and copied source remain unchanged. `direct-query.browser.py` also verifies bold rendering during streaming and after history reload, with exact persisted report text.

Interface wording distinguishes stage results from final results, pending analysis from completed operations, and stopping reception from stopping backend execution. Repair requests still populate a draft; approval permissions and request payloads are unchanged. Backend-generated report wording is preserved.
