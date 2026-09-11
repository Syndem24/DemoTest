# Runtime Error Inspector — Checklist

Detailed patterns and stack-trace signatures. Read this after scoping files in `SKILL.md`.

---

## 1. Divide by zero

| Language | Risky pattern | Prefer |
|---|---|---|
| C# | `total / count`, `% 0`, averages without guard | `count == 0 ? 0 : total / count` or early return |
| Python | `a / b`, `a // b` with `b` from input | Guard `if not b` |
| JS | Same; also `n % 0` → `NaN` | Guard before divide |

**Hotel examples:** occupancy %, fee per night, dashboard averages over empty booking sets.

**Stack traces:** `System.DivideByZeroException`, Python `ZeroDivisionError`.

---

## 2. Null / None reference

| Language | Risky pattern | Prefer |
|---|---|---|
| C# | `FirstOrDefault()` then `.Property`; `?.` omitted on config; `as` then use | null-check, `FirstAsync` when required, `??`, null-forgiving only when proven |
| Python | `dict["k"]`, attribute on `None` | `.get()`, explicit `is None` |
| JS | `obj.prop.prop`, optional chaining skipped | `?.`, default values |

**Hotel examples:** booking not found, missing room type after delete, vault key missing, chat translator returning null, Identity user null after Google login.

**Stack traces:** `NullReferenceException`, `ArgumentNullException`, Python `AttributeError` / `TypeError`, JS `TypeError: Cannot read properties of null/undefined`.

---

## 3. Index / key out of range

| Language | Risky pattern | Prefer |
|---|---|---|
| C# | `list[i]`, `dict[key]` | `i < Count`, `TryGetValue`, `ElementAtOrDefault` |
| Python | `lst[i]`, `d[k]` | `if i < len`, `.get()` |
| JS | `arr[i]` assumed defined; `Map` misuse | length checks; optional chaining |

**Hotel examples:** wizard step arrays, inclusion pickers, room assignment loops, locale JSON keys missing.

**Stack traces:** `IndexOutOfRangeException`, `ArgumentOutOfRangeException`, `KeyNotFoundException`, Python `IndexError` / `KeyError`.

---

## 4. Type errors / invalid casts

| Language | Risky pattern | Prefer |
|---|---|---|
| C# | `(int)obj`, `as Foo` without null-check, `int.Parse`, JSON number-as-string | `TryParse`, `JsonSerializer` with types, pattern matching |
| Python | `int(x)` on bad input | try/except or validation |
| JS | `JSON.parse` unchecked; `==` coercion | schema validation, `Number.isFinite` |

**Hotel examples:** query-string booking ids, OCR amounts as strings, SignalR payloads, chat `lang` codes.

**Stack traces:** `InvalidCastException`, `FormatException`, `JsonException`, Python `ValueError` / `TypeError`.

---

## 5. Stack overflow / infinite recursion

| Language | Risky pattern | Prefer |
|---|---|---|
| Any | Recursion without base case; cyclic entity graphs | Explicit depth limit, iterative walk, cycle detection |

**Hotel examples:** recursive include graphs, circular navigation properties serialized without `[JsonIgnore]`, tree-like offer/channel logic.

**Stack traces:** `StackOverflowException` (often process-killing in .NET), JS `RangeError: Maximum call stack size exceeded`, Python `RecursionError`.

---

## 6. Out of memory / unbounded growth

| Language | Risky pattern | Prefer |
|---|---|---|
| C# | `ToListAsync()` on unbounded tables; `IMemoryCache` without size/expiry; `ReadAllBytes` on uploads | Paging (`Skip`/`Take`), streaming, cache size limits, max upload size |
| JS | Holding full chat/history arrays forever | Cap history (already used in hotel chat) |
| Python | Reading whole files into memory | chunked reads |

**Hotel examples:** admin booking list without filters, payment history export loading everything, chat history, room image uploads.

**Stack traces:** `OutOfMemoryException`, process killed by OOM, browser tab freeze.

---

## 7. Unhandled exceptions on I/O / external calls

| Language | Risky pattern | Prefer |
|---|---|---|
| C# ASP.NET | DB/HTTP/file/OCR without handling → 500 | Catch specific exceptions; return ProblemDetails / user-safe message; log with `ILogger` |
| Any | Fire-and-forget async without observation | `await` or log `Task` faults |

**Hotel examples:** SQL timeouts, Azure Document Intelligence OCR, Gemini/Groq/translate HTTP, SMTP, Google OAuth, receipt file IO.

**Reuse:** OCR timeout/retry/fallback pattern (`AzureReceiptOcrService`); chat translate already falls back on failure.

**Stack traces:** `SqlException`, `HttpRequestException`, `TaskCanceledException`, `IOException`, `DbUpdateException`, `DbUpdateConcurrencyException`.

---

## 8. Concurrency / race conditions

| Language | Risky pattern | Prefer |
|---|---|---|
| C# | Check-then-act without transaction; static mutable caches | Existing `Serializable` booking txn; unique indexes; avoid shared static mutable state |

**Hotel examples:** two guests booking last Twin; concurrent room assignment; double payment post; shift open unique filter races.

**Reuse:** `BookingService.CreateAsync` serializable transaction; unique `(BookingItemId, RoomId)`; `BookingConcurrencyException` / `BookingAvailabilityException`.

**Stack traces:** intermittent uniqueness violations, wrong availability counts, duplicate references under load.

---

## 9. Deployment / dependency errors

| Area | Risky pattern | Prefer |
|---|---|---|
| NuGet | Target framework mismatch (`net9` vs SDK 10 only); private packages | `global.json` pin; restore in clean CI; matching runtime |
| npm | Missing lockfile; SPA build in publish without Node | Commit lockfile; `SkipSpaBuild` only when intentional |
| Config | Secrets only in local user-secrets | `SecureSetting` / env / Key Vault on deploy |
| SQL | LocalDB path in prod connection string | Azure SQL / real SQL connection |

**Stack / log clues:** `NU1101`, `NETSDK1045`, `error MSB4018`, npm `ERESOLVE`, `MissingMethodException` from wrong runtime, config null at startup.

---

## Stack-trace triage cheat sheet

| You see | Start category | First question |
|---|---|---|
| `NullReferenceException` / `AttributeError` | Null | Which expression was null? |
| `DivideByZeroException` / `ZeroDivisionError` | Divide by zero | Which denominator can be 0? |
| `IndexOutOfRange` / `KeyNotFound` / `KeyError` | Index/key | Bounds or missing key? |
| `InvalidCast` / `FormatException` / `JsonException` | Type | What type arrived vs expected? |
| `StackOverflow` / `RecursionError` | Recursion | Where is the base case? |
| `OutOfMemory` | Memory | What collection is unbounded? |
| `SqlException` / `HttpRequestException` / `IOException` | Unhandled I/O | Is it caught and degraded safely? |
| Intermittent under load only | Concurrency | Missing transaction/unique constraint? |
| Only fails in CI/prod restore | Deploy/deps | Lockfile, SDK, feeds, config? |

---

## Reporting severity (blast radius)

| Severity | Use when |
|---|---|
| **Critical** | Can corrupt money/bookings, leak auth, or take down checkout/payment/auth |
| **High** | Unhandled 500 on common admin/guest paths |
| **Medium** | Edge-case crash with workaround |
| **Low** | Unlikely path; defensive improvement |

Always show a concrete fix snippet for Critical/High findings.
