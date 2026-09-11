---
name: runtime-error-inspector
description: >-
  Inspects source code for runtime failure risks before deployment — divide-by-zero,
  null/None reference errors, index/key-out-of-range errors, type mismatches, stack
  overflow/infinite recursion, out-of-memory patterns, unhandled exceptions, and
  dependency/package restore errors (NuGet, npm, pip) that surface at build or deploy
  time. Use whenever the user asks to "check for bugs before deploying", "review this
  code for runtime errors", "why might this crash in production", "audit for null
  reference / divide by zero / index errors", pastes a stack trace / exception and asks
  what caused it or how to prevent it, or is preparing to deploy/publish and wants a
  pre-flight code safety check. Defaults to C#/.NET conventions for ASP.NET Core; the
  checklist generalizes to any language.
---

# Runtime Error Inspector

A systematic pre-deployment scan for the failure modes that don't show up until code actually runs — as opposed to compiler/syntax errors, which the build already catches.

## When to use this

- The user wants a safety pass over code before shipping/deploying it.
- The user pasted an exception, stack trace, or crash log and wants root cause + fix.
- The user asks "what could go wrong at runtime" or "why did this work locally but crash in prod".
- The user mentions a package/dependency restore failure (NuGet, npm, pip) blocking a build or deploy.

## Don't use this for

Pure syntax/compile errors (the compiler already reports those clearly) — this skill is about errors that only appear under certain data or environment conditions.

## Mori hotel defaults (this repo)

Prefer these hot paths when scope is vague:

| Priority | Area | Typical files |
|---|---|---|
| P0 | Booking / double-book | `Services/BookingService.cs`, booking APIs |
| P0 | Payments / receipts | `Services/PaymentService.cs`, OCR receipt path |
| P0 | Auth / password / Google | `AccountController`, Identity middleware |
| P1 | Admin concurrency | Room assign, checkout, SignalR hubs |
| P1 | Guest chat | `Services/Chat/*`, `ChatApiController` |
| P2 | Deploy restore | `TestingDemo.csproj`, `ClientApp/package.json`, `global.json` |

Reuse existing primitives: `Serializable` booking transactions, unique indexes, `guest-bookings` rate limiter, antiforgery, `SecureSetting` vault, `PhilippinesTime` UTC rules. Do not invent Redis/Hangfire/Polly for a finding unless the user asks.

## Workflow

1. **Scope the inspection.** Ask (or infer from context) which files/modules are in play — don't try to scan an entire large repo blindly. If the user references a specific feature (e.g. "the booking checkout flow"), find the files touching that flow first.
2. **Read the actual code, don't guess from filenames.** For each file, walk it against the checklist below ([references/checklist.md](references/checklist.md)) category by category.
3. **Report findings as a table or list:** `file:line`, category, why it's risky, concrete fix. Never just say "looks fine" without having checked each category explicitly.
4. **Prioritize by blast radius:** unhandled exceptions on hot paths (checkout, auth, payment) outrank cosmetic issues.
5. **Offer the fix, not just the diagnosis** — show the corrected snippet inline, or apply it directly if asked.
6. **If the user pasted a stack trace instead of code,** work backward: identify the exception type first (see [references/checklist.md](references/checklist.md) for how each error type manifests per language), then ask for or locate the offending file/line.

## Categories to check every time

Read [references/checklist.md](references/checklist.md) for full detail and per-language examples (C#/.NET, Python, JavaScript). Summary:

1. **Divide by zero** — unguarded arithmetic on user input, counts, or averages (`total / count` where `count` can be 0).
2. **Null / None reference** — dereferencing something that can be null: DB lookups (`FirstOrDefault`, `.get()`), optional config values, deserialized JSON, chained calls without null-checks.
3. **Index / key out of range** — array/list indexing without bounds checks, dictionary access with `[]` instead of `TryGetValue`/`.get()`, off-by-one loops.
4. **Type errors / invalid casts** — unchecked casts (`(int)obj`, `as` without null-check), string-to-number parsing without `TryParse`, mixing types across API boundaries (e.g. JSON field expected as int arrives as string).
5. **Stack overflow / infinite recursion** — recursive functions without a solid base case, especially over user-controlled or cyclic data (e.g. tree structures, self-referencing entities).
6. **Out of memory / unbounded growth** — loading full result sets into memory instead of paging, unbounded caches/collections, large file uploads read entirely into memory, recursive/streaming logic that buffers everything.
7. **Unhandled exceptions on I/O and external calls** — DB calls, HTTP calls, file I/O, payment gateway calls without try/catch or without handling the specific exception types those calls can throw. This matters most in ASP.NET Core middleware/controllers where an unhandled exception becomes a 500.
8. **Concurrency/race conditions** — shared mutable state touched by concurrent requests without locking (e.g. double-booking a room), especially relevant for booking/reservation systems.
9. **Deployment/dependency errors** — package restore failures (NuGet/npm/pip) from version conflicts, missing lockfile entries, or packages present locally but not restorable in CI (private feed not configured, target framework mismatch); missing environment variables/config that only exist locally, not in the deploy target.

## Output format

Default to a table:

| Location | Category | Risk | Fix |
|---|---|---|---|
| `path:line` | Null reference | … | … |

For a single deep-dive (e.g. one stack trace), prose is fine: **cause → why it happens → fix → how to prevent the class of bug going forward.**

Keep the response scoped to what was asked — don't dump all nine categories against files that were never in question.

## Explicit checklist discipline

Before closing, confirm you walked each applicable category for the scoped files:

```
Checked:
- [ ] Divide by zero
- [ ] Null / None
- [ ] Index / key
- [ ] Type / cast
- [ ] Recursion
- [ ] Memory growth
- [ ] Unhandled I/O
- [ ] Concurrency
- [ ] Deploy / restore
```

If a category does not apply to the scoped files, mark it N/A — do not skip silently.

## Additional resources

- Full per-language patterns and stack-trace mapping: [references/checklist.md](references/checklist.md)
