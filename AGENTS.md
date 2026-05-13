# Repository Guidelines

## Project Structure & Module Organization
This repository is currently minimal: the `frountind/` directory does not yet contain application source files, tests, or static assets. Keep new work organized from the start:

- `src/`: application code, grouped by feature or page
- `public/`: static assets served as-is
- `tests/` or `src/__tests__/`: automated tests
- `docs/`: architecture notes, setup details, and design decisions

Prefer small, focused modules. Example paths: `src/components/Header.tsx`, `src/pages/Dashboard.tsx`, `src/api/client.ts`.

## Build, Test, and Development Commands
No build tooling is checked in yet, so contributors should add and document commands together with the initial app scaffold. For a typical Node-based frontend, keep these scripts in `package.json`:

- `npm install`: install dependencies
- `npm run dev`: start the local development server
- `npm run build`: create a production build
- `npm run test`: run the test suite
- `npm run lint`: run static analysis

If you introduce a different toolchain such as `pnpm`, `yarn`, or `vite`, update this file and the project `README` in the same change.

## Coding Style & Naming Conventions
Use consistent formatting from the first commit:

- Indentation: 2 spaces for JSON, YAML, Markdown, and frontend source
- File names: `PascalCase` for React components, `camelCase` for utilities, `kebab-case` for folders when grouping by route or feature
- Keep files ASCII unless the file already uses non-ASCII text

Add ESLint and Prettier before the codebase grows. Avoid large multi-purpose files; split UI, API, and state logic cleanly.

## Testing Guidelines
Testing infrastructure is not present yet. When adding it, choose one primary runner and keep naming predictable:

- Unit tests: `*.test.ts` or `*.test.tsx`
- Component tests near the source file or under `tests/`
- Cover core rendering, user interaction, and API error handling

Every new feature should include tests or a short explanation in the PR for why tests were deferred.

## Commit & Pull Request Guidelines
The current history is minimal (`first push`), so set a clearer standard going forward:

- Write short, imperative commit messages, such as `add login page scaffold`
- Keep commits focused; avoid mixing refactors with feature work
- PRs should include purpose, key changes, test status, and screenshots for UI work

Link related issues when available and note any follow-up work explicitly.
