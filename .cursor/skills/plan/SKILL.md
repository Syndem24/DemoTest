---
name: plan
description: >-
  Runs planning-only deep discussions between prompter and agent without implementing code.
  Use when the user says /plan or asks for architecture planning, risk review, overlap checks,
  vulnerability checks, clarification-first analysis, standards research, or a pre-implementation blueprint.
disable-model-invocation: true
---

# /plan

## Purpose
Use this skill for pure planning only.  
Do not implement code, do not edit files, and do not run destructive actions.

## Non-negotiable mode
When this skill is active:
1. Stay in analysis and planning mode only.
2. Do not propose "I'll implement now" unless the user explicitly exits `/plan`.
3. Prioritize correctness, clarity, and risk discovery over speed.

## Required behavior
For each `/plan` request:
1. Restate the goal in one short paragraph.
2. Detect and list:
   - overlap with existing features or flows
   - possible mistakes or contradictions in the prompt
   - unclear requirements that block safe implementation
   - system vulnerabilities or abuse paths
   - architecture failure points (scaling, coupling, data integrity, auth boundaries)
3. Ask targeted clarification questions when needed.
4. Research current engineering standards and best practices from reliable sources when needed.
5. Provide soft suggestions (not mandates) with trade-offs.
6. End with a proposed implementation-ready plan, but do not implement it.

## Live standards research (internet)
When the request asks for "latest", "modern", "up to today", "industry standard", or similar:
1. Use web research to gather current guidance from reputable sources.
2. Prefer primary/official documentation first (framework docs, vendor docs, standards orgs).
3. Add 1-3 secondary sources only for context, not as authority.
4. Compare findings against the current system constraints before recommending.
5. Call out stale patterns and suggest updated alternatives.

Reliability rules:
- Cite source + recency (year/version/date) in the planning response.
- If sources disagree, state disagreement and present options with trade-offs.
- Do not copy trends blindly; adapt to team size, system scale, and risk profile.
- If no strong sources are found, state uncertainty and ask for direction.

## Use-case deepening
For stronger implementation prep, include:
- primary use case and success path
- edge cases and failure modes
- security/privacy/abuse considerations
- observability and rollback expectations
- migration or rollout strategy when behavior changes

## Clarification trigger rules
Ask for clarification immediately if any of these are true:
- two requirements conflict
- the requested behavior can break security or permissions
- data ownership/boundary is ambiguous
- reliability constraints are missing (validation, retries, rollback, auditability)
- user intent is underspecified (surface, scope, success criteria)

If unclear, ask first before suggesting architecture.

## Soft suggestion style
Use calm, non-blocking language:
- "A safer option is..."
- "You may want to..."
- "If you prefer faster delivery, we can..."
- "Trade-off: ... / ... "

Never shame prompt quality. Improve it collaboratively.

## Output template
Use this exact section order:

1. **Goal alignment**
2. **Findings**
   - Overlaps
   - Prompt risks/mistakes
   - Vulnerabilities
   - Architecture failure risks
   - Current standards research (if applicable)
3. **Clarifications needed**
4. **Soft suggestions**
5. **Implementation blueprint (no coding yet)**
   - scope
   - components/files to touch later
   - validation/test plan
   - rollback/fallback notes

## Done criteria for /plan
The `/plan` response is complete only when:
- risks are explicitly called out
- clarifications are explicit and actionable
- current standards are researched when requested
- blueprint is detailed enough for strong implementation later
- no code implementation is performed
