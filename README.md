# Maestro de Español

A Spanish tutor in the browser: write a sentence in Spanish and get it back corrected, with an explanation of each error. Built with Next.js, TypeScript and Claude.

The repository is set up for AI-assisted development with Claude Code. Work is organised into task specs, and a small set of enforced guardrails keeps agents on task and honest about whether work is done (see [docs/harness.md](docs/harness.md)).

## Getting started

```bash
nvm use                         # Node 26, from .nvmrc
npm ci                          # also installs the git hooks
npx playwright install chromium # once, for the e2e tests
cp .env.example .env.local      # then add your ANTHROPIC_API_KEY
npm run dev                     # http://localhost:3000
```

## Commands

| Command          | What it runs                                                      |
| ---------------- | ----------------------------------------------------------------- |
| `npm run check`  | Task files, formatting, typecheck, lint, unit tests with coverage |
| `npm run verify` | `check`, then a production build and the Playwright e2e tests     |
| `npm run evals`  | LLM evals against the real Claude API (costs money)               |
| `npm run tasks`  | Task list and status                                              |

## Working with Claude Code

1. **Describe the work**: `/new-task <what you want>`. Claude interviews you and drafts a spec in `tasks/` for your approval.
2. **Build it**: `/start-task <id>`. Claude creates a task branch and a progress file, plans, then works test-first, one criterion at a time.
3. **Close it out**: `/finish-task`. Claude runs `verify`, has an independent reviewer check the diff against the spec, and records evidence against the [Definition of Done](docs/definition-of-done.md).
4. **Merge**: you review the pull request and merge it.

How tasks work is described in [tasks/README.md](tasks/README.md), and every guardrail in [docs/harness.md](docs/harness.md).

## Deployment

The app runs on Azure Container Apps, and merging to `main` deploys it once CI passes. The architecture, one-time setup, deploys, rollback, cost and teardown are described in [docs/deployment.md](docs/deployment.md).

## Layout

```
src/app/                 Next.js routes (thin)
src/features/<feature>/  Feature logic, prompts, schemas, UI and their tests
src/lib/llm/             The only code that talks to Claude
infra/                   Bicep for Azure, bootstrap and deploy scripts
e2e/                     Playwright tests and the mock Claude server they use
evals/                   LLM eval suites and runner
harness/                 Guardrail hooks and scripts for Claude Code (tested)
tasks/, progress/        Task specs and the agent's working notes
.claude/                 Claude Code settings, skills, subagents and rules
```
