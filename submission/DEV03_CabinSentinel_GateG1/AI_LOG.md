# AI Log

Project: DEV-03 CabinSentinel  
Team: T068 - GradFlow  
Purpose: Maintain an auditable record of AI-assisted work and human review.

## Entry 001 - Source extraction and requirements consolidation

- Date: 2026-09-20
- Tool: OpenAI Codex
- Input: User-provided DOCX containing the CabinSentinel PRD draft.
- Task: Extract the existing Brief/PRD material, complete Wireframe/UI Flow and Gate G1 repo setup.
- Output: One-page brief, completed PRD, wireframe/UI flow PDF, Gate G1 checklist, and repository automation files.
- Human review required: Validate product facts, 35°C threshold, owner/team metadata, and final GitHub URL.
- Decision: Safety state remains deterministic; an LLM may format text but cannot choose CRITICAL/SAFE.

## Entry 002 - UX and safety flow

- Date: 2026-09-20
- Tool: OpenAI Codex
- Prompt summary: Design low-fidelity screens for SAFE, NOTICE, CRITICAL, ERROR and the end-to-end flow.
- Output: Desktop monitoring dashboard, mobile alert variants, HITL actions, component states, responsive and accessibility notes.
- Human review required: Confirm terminology and simulated actions match the planned demo.
- Decision: CRITICAL cannot be dismissed with Escape and remains active on partial tool failure.

## Entry 003 - Repository controls

- Date: 2026-09-20
- Tool: OpenAI Codex
- Prompt summary: Add AI Log, pre-commit hook, GitHub Actions, and deterministic submission validation.
- Output: AI_LOG.md, .githooks/pre-commit, .github/workflows/gate-g1.yml, scripts/validate_submission.py.
- Human review required: Create or accept the GitHub remote, push main, confirm Actions passes, and grant lecturer access.
- Decision: GitHub link is not claimed as live until independently verified.

## Logging rule

For every material AI-assisted change, append the date, tool/model, task or prompt summary, files changed, verification performed, human reviewer, and final decision. Never record secrets, tokens, private images, or personal data not needed for the submission.

## Entry 004 - GitHub repository publication

- Date: 2026-09-20
- Tool: OpenAI Codex
- Task: Create the final public repository using the user-selected submission name.
- Repository: https://github.com/hientran-ai/G05-T068-Gradflow-Dev03-CabinSentinel
- Verification: Confirm repository visibility, push the main branch, and inspect the Gate G1 Validation workflow.
- Decision: Use a public repository so the lecturer can inspect files, commit history, AI Log, hook, and GitHub Actions without a separate invitation.

## Entry 005 - Final remote verification

- Date: 2026-09-20
- Repository: https://github.com/hientran-ai/G05-T068-Gradflow-Dev03-CabinSentinel
- Branch: main
- GitHub Actions: Gate G1 Validation completed successfully.
- Verification: Public visibility, pushed commit history, workflow result, final checklist rendering, and local validator all passed.
- Decision: Gate G1 package status changed from conditional ready to ready.

## Entry 006 - Wireframe and UI Flow redesign

- Date: 2026-09-20
- Tool: OpenAI Codex
- Task: Redesign `03_CabinSentinel_Wireframe_UI_Flow.pdf` with greater visual fidelity, clearer safety interactions, and developer-ready detail.
- Output: Expanded the artifact from 7 to 11 pages with experience principles, design tokens, SAFE/WARNING/CRITICAL screens, tool progress, event audit, device health, end-to-end flow, mobile behavior, accessibility, and developer handoff.
- Verification: Rendered and visually inspected all 11 pages; checked text extraction, page count, clipping, spacing, and local Gate G1 validation.
- Decision: Preserve the same filename and repository/Drive links so the submission references remain stable.

## Entry 007 - Official organizer repository correction

- Date: 2026-09-20
- Official repository: https://github.com/AI20K-Build-Phase-Cohort-4/P-068
- Finding: The organizer-provided README states that repositories created outside the cohort organization are not graded.
- Action: Move the Gate G1 submission into `P-068` while preserving the organizer template, hooks, `.ai-log`, CI, and technical guide files.
- Decision: Use `P-068` as the only submission link. Keep the personal repository as a backup only.
