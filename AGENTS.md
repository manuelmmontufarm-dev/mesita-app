# AGENTS.md — Active AI Agents on mesita-app

This file tells every AI working on this repo who else is here, what each one owns,
and how to avoid stomping on each other's work.

**Rule:** Before starting any task, read HANDOFF.md to see what's in flight.
After finishing (or pausing), update HANDOFF.md with your status.

---

## Active Agents

### 1. Claude Code (Anthropic — Claude Sonnet 4.6)
- **Launched via:** Claude Code VSCode extension / CLI
- **Primary role:** Full-stack implementation, bug fixes, feature work
- **Strengths:** File edits, running tests, reading the whole codebase, git ops
- **Does NOT:** push to remote or deploy without user confirmation
- **Handoff style:** Updates HANDOFF.md after each task block

### 2. Codex (OpenAI)
- **Launched via:** Cursor left panel
- **Primary role:** Code generation, refactors, quick edits suggested in Cursor
- **Strengths:** Fast inline suggestions, agentic task execution in Cursor
- **Does NOT:** have access to terminal by default unless granted
- **Handoff style:** Should update HANDOFF.md or leave a `// CODEX:` comment near changed code

### 3. Cursor Agent (Claude / GPT — Cursor Tab)
- **Launched via:** Cursor right panel ("Agents Window")
- **Primary role:** Context-aware code completion, inline Q&A, architecture advice
- **Strengths:** Sees the open file and selection; good for explaining and quick patches
- **Does NOT:** run shell commands unless in agent mode
- **Handoff style:** Updates HANDOFF.md or flags open questions there

---

## Coordination Rules

1. **One agent per task at a time.** If HANDOFF.md shows an agent is mid-task on a file,
   don't touch that file until it marks the task done.

2. **HANDOFF.md is the shared inbox.** Check it first. Write to it last.

3. **TODAY.md is the permanent log.** Every completed change goes there (per CLAUDE.md rules).
   HANDOFF.md is for in-progress / ephemeral notes.

4. **Conflicts:** If two agents edited the same file, the human resolves it.
   Agents should not silently overwrite each other.

5. **Tests before handoff.** If you ran `npm test`, paste the summary in HANDOFF.md
   so the next agent knows the suite is green (or what's failing).

---

## File Ownership Defaults

| Area | Primary agent | Notes |
|---|---|---|
| `src/app/pay/customer.css` | Claude Code | iOS Liquid Glass system — careful with this |
| `src/lib/demo-scenarios.ts` | Any | Add scenarios for bugs before fixing them |
| `src/lib/demo-table-store.ts` | Claude Code | CAS logic is subtle — coordinate before touching |
| `TODAY.md` | All | Every agent writes here after a change |
| `HANDOFF.md` | All | Every agent reads/writes here |
| `AGENTS.md` | Human | Don't auto-edit this file |
| `prisma/` | Claude Code | Schema changes need migration |
| `landing/` | Any | Separate CSS system — don't mix with app Tailwind |
