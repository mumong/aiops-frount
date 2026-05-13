# DeepSeek Superpowers

## Overview

You have access to the full **Superpowers** software development workflow system by obra. These skills define best practices for TDD, planning, debugging, code review, and collaboration.

## Skills System

Skills are loaded on demand via `read_file` when relevant. Each skill file is a complete reference guide for a specific workflow technique. The skills are stored in `skills/` directory.

### Skill Priority

1. **User's explicit instructions** (CLAUDE.md, AGENTS.md, direct requests) — highest priority
2. **Superpowers skills** — override default behavior where they conflict
3. **Default system prompt** — lowest priority

### Skill Types

- **Rigid** (TDD, debugging): Follow exactly. Don't adapt away discipline.
- **Flexible** (patterns): Adapt principles to context.

The skill itself tells you which type it is.

## Skill References

### Process Skills (HOW to approach the task)

| Skill | When to Use | File |
|-------|-------------|------|
| **brainstorming** | Any creative work - features, components, UI - before ANY code | `skills/brainstorming/SKILL.md` |
| **writing-plans** | Multi-step task with approved spec, before touching code | `skills/writing-plans/SKILL.md` |
| **subagent-driven-development** | Executing plans with independent tasks in current session | `skills/subagent-driven-development/SKILL.md` |
| **executing-plans** | Executing plans in a separate session with checkpoints | `skills/executing-plans/SKILL.md` |
| **dispatching-parallel-agents** | 2+ independent tasks that can run in parallel | `skills/dispatching-parallel-agents/SKILL.md` |

### Debugging Skills

| Skill | When to Use | File |
|-------|-------------|------|
| **systematic-debugging** | Any bug, test failure, or unexpected behavior | `skills/systematic-debugging/SKILL.md` |
| **verification-before-completion** | Before claiming work is done, fixed, or passing | `skills/verification-before-completion/SKILL.md` |

### Implementation Skills

| Skill | When to Use | File |
|-------|-------------|------|
| **test-driven-development** | Any feature or bugfix implementation | `skills/test-driven-development/SKILL.md` |
| **using-git-worktrees** | Starting feature work needing isolation | `skills/using-git-worktrees/SKILL.md` |
| **finishing-a-development-branch** | Implementation complete, before merge/PR | `skills/finishing-a-development-branch/SKILL.md` |

### Code Review Skills

| Skill | When to Use | File |
|-------|-------------|------|
| **requesting-code-review** | After tasks, major features, before merge | `skills/requesting-code-review/SKILL.md` |
| **receiving-code-review** | When receiving review feedback | `skills/receiving-code-review/SKILL.md` |

### Meta Skills

| Skill | When to Use | File |
|-------|-------------|------|
| **using-superpowers** | Starting any conversation - introduces skills system | `skills/using-superpowers/SKILL.md` |
| **writing-skills** | Creating or editing skills | `skills/writing-skills/SKILL.md` |

## Core Workflow

The standard end-to-end development workflow:

1. **Brainstorm** (`brainstorming`) — Understand intent, explore approaches, get design approval
2. **Worktree** (`using-git-worktrees`) — Create isolated workspace
3. **Write Plan** (`writing-plans`) — Break into bite-sized tasks
4. **Implement** (`subagent-driven-development` or `executing-plans`) — TDD per task
5. **Review** (`requesting-code-review`) — Review after each task/feature
6. **Finish** (`finishing-a-development-branch`) — Merge/PR/cleanup

## Tool Adaptation

This is DeepSeek TUI. Skills reference Claude Code tool names. The equivalents are:

| Claude Code | DeepSeek TUI |
|-------------|--------------|
| `Skill` tool | `read_file` (load skill content) |
| `TodoWrite` | `checklist_write` / `todo_write` |
| `Task` (subagent) | `agent_spawn` |
| `Bash` | `exec_shell` |
| `Write` | `write_file` |
| `Read` | `read_file` |
| `Edit` / `Edit` | `edit_file` / `apply_patch` |
| `Glob` | `file_search` |
| `Grep` | `grep_files` |
| `Agent result` | `agent_result` |
| `Send` | `agent_send_input` |
| `Wait` | `agent_wait` |

## Principles

- **Test-Driven Development** — Write tests first, always
- **Systematic over ad-hoc** — Process over guessing
- **Complexity reduction** — Simplicity as primary goal
- **Evidence over claims** — Verify before declaring success
- **DRY, YAGNI, TDD, frequent commits**
