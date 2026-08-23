# Claude Code Workflow Kit

Reusable checklists, prompts, and handoff templates for cleaner Claude Code sessions.

This kit is for developers, solo founders, technical creators, and small teams who use Claude Code/Codex-style agents and want less chaos: clearer tasks, better reviews, fewer half-finished branches, and handoffs that another agent or human can actually continue.

## What is inside

- `templates/01-repo-audit-checklist.md`
- `templates/02-bug-investigation-template.md`
- `templates/03-pr-review-template.md`
- `templates/04-release-preflight-checklist.md`
- `templates/05-agent-handoff-template.md`
- `templates/06-refactor-plan-template.md`
- `templates/07-test-plan-template.md`
- `templates/08-github-issue-pack.md`
- `templates/09-project-instructions-template.md`
- `templates/10-client-delivery-note.md`
- `examples/example-agent-handoff.md`
- `examples/example-release-preflight.md`

## How to use it

1. Copy the template you need into your repository, issue, pull request, or Codex/Claude task.
2. Replace bracketed fields like `[repo]`, `[branch]`, `[risk]`, and `[owner decision]`.
3. Keep the sections you actually need. Delete the rest.
4. Ask the agent to follow the template literally.
5. Save completed handoffs in your project so future sessions can resume without archaeology.

## Recommended folder layout

```text
docs/agent-workflows/
  repo-audit.md
  release-preflight.md
  handoff.md
.github/
  ISSUE_TEMPLATE/
    bug-agent-ready.md
    feature-agent-ready.md
```

## License

Personal and commercial use allowed. You may use and modify the templates inside your own projects and client work. Do not resell or redistribute the kit itself as a competing template pack.

