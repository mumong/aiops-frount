# Repository Guidelines

## Application structure

This is a React 18 / TypeScript 5 / Vite 6 chat frontend, served by Nginx in Kubernetes.

- src/components/aiops-chat/: chat orchestration, pure event transitions, presentation models and React views.
- src/hooks/: SSE transport/decoder and persisted chat history.
- tests/: Node test-runner suites (*.test.mjs) and independent Python Playwright browser replays (*.browser.py).
- deploy/: existing Kubernetes manifests. VERSION is the image version; package.json version is private package metadata.
- docs/testing.md: application verification. CONTRIBUTING.md: module and compatibility rules.

## Development and verification

Use npm ci with package-lock.json. Prefer Node 24 LTS; ESLint 10 requires Node 20.19+, 22.13+ or 24+.
Run make check for ordered npm tests, ESLint, TypeScript and Vite build. make build remains Docker image build; make app-build is the local production build. make help lists commands.
Browser replays are separate and require Python Playwright plus Chromium. Report checks actually run, warnings, and verification gaps.

## Editing conventions

Use two-space indentation; PascalCase for React component files and camelCase for hooks/utilities. Preserve existing Chinese UI text and established filenames. Avoid unrelated formatting or mechanical renames.
Keep transport, pure transitions, persistence and presentation separate. Characterize existing behavior before refactoring; prefer event/output assertions over matching implementation source.
Preserve the aiops_chat_sessions schema, synchronous final node snapshots, tool identity/group precedence, and post-final approval events. Protocol improvements and timeout fixes are separate behavior changes.

## Delivery

Do not commit, push, change versions, deploy or delete resources without task authority. Existing deployment commands are documented in README.md. Preserve credentials and data; never print secrets.
PR/change reports should state scope, behavior compatibility, checks and remaining risks. Licensing is unresolved: README historically says MIT but no LICENSE exists; do not add guessed ownership or authorization.
