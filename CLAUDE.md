# Project Rules

## API Documentation Verification (MANDATORY)

Before writing or modifying ANY code that touches Gradium or World Labs APIs, you MUST re-fetch and verify the current documentation first. Do not rely on memory or cached knowledge — these are new APIs and details change.

- **Gradium docs:** https://gradium.ai/api_docs.html
- **World Labs docs:** https://docs.worldlabs.ai/api
- **SparkJS docs:** https://sparkjs.dev/docs/

Verify: endpoint URLs, request/response schemas, auth headers, audio formats, message types. If anything in the code doesn't match the docs, fix it immediately.

## Changelog Updates (MANDATORY)

Every time you make ANY change to the codebase — no matter how small — you MUST update `docs/CHANGELOG.md` before considering the task complete. Use the format specified in the changelog template:

```markdown
## [Session X] - YYYY-MM-DD HH:MM

### Added
- **Feature/item name** — Justification for why this was added
  - `path/to/file1.ts`
  - `path/to/file2.py`

### Changed
- **What changed** — Why this change was made
  - `path/to/modified/file.ts`

### Fixed
- **Bug description** — Root cause and how it was resolved
  - `path/to/fixed/file.py`

### Removed
- **What was removed** — Why it was removed
  - `path/to/deleted/file.ts`

### Notes
- Observations, decisions, blockers, or anything worth remembering
```

Rules:
- Include EVERY file you created, modified, or deleted
- Write a clear justification for each change
- Use the correct section (Added/Changed/Fixed/Removed)
- Increment the session number from the last entry
- If no session entries exist yet, start with `[Session 1]`

## Project Docs

All project context lives in `docs/`:
- `docs/PRD.md` — Product requirements
- `docs/TECHNICAL.md` — Architecture and API integration details
- `docs/ROADMAP.md` — Execution checklist
- `docs/CHANGELOG.md` — Log every change with justification and file paths
