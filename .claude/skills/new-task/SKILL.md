---
name: new-task
description: Turn a feature request or bug report into a task spec in tasks/. Interviews the user until the objective, acceptance criteria and out-of-scope list are unambiguous, then drafts the spec for approval. Use when the user wants to plan new work, or asks for a change that no task spec covers yet.
argument-hint: "[what should be built or fixed]"
---

Request: $ARGUMENTS

1. Run `npm run tasks` to see existing tasks (so you don't duplicate one) and `npm run tasks -- --next-id` for the new id. Read `tasks/README.md` and `tasks/TEMPLATE.md`.
2. Read the code the request touches, enough to write criteria that can be tested against it. Don't change any code in this skill.
3. Ask the user about anything the code can't settle: expected behaviour, edge cases, failure handling, what's out of scope. Use AskUserQuestion, a few questions at a time, and recommend an answer for each. Stop when every criterion is observable and testable.
4. Write `tasks/<id>-<slug>.md` from the template. The slug is short, kebab-case and descriptive. Number the criteria AC1, AC2, ...; each one names an input or action and the result someone can observe. Under "Out of scope", list the adjacent work someone would be tempted to include.
5. The user approves the file write. Show them the criteria in your reply and stop: implementation starts in a fresh `/start-task <id>`, not in this turn.
