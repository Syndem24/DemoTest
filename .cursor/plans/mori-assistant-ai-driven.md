# Mori Assistant — AI-driven guest chatbot (future implementation)

**Status:** Specification only — **do not treat as shipped**. No widget or `/api/chat` exists in this repo yet.  
**Written:** 2026-08-30  
**Surface:** Guest / public site only (`_CustomerLayout`). **Not** admin `_Layout`.  
**Mode:** **AI-driven only** for answers. Guardrails **refuse** unsafe asks; they do **not** replace Gemini with canned FAQ replies.

Related prior planning (conversation, not files): multi-provider token failover is **out of v1**. One Gemini key in the vault. Mid-conversation “transfer to Claude” is Phase 2+ if ever needed.

There is **no Mori Assistant topic inventory file** in this workspace. The design below uses the **pasted Mori Assistant documentation** (rules-first bot) as inspiration only.

---

## 1. Goal

A floating **Mori Assistant** on the guest site that answers **public hotel questions** by calling **Gemini** with a **server-built public context pack** (live available room *types*, online-visible offers, published hotel facts).

It **never** reads bookings, payments, staff accounts, flush/audit logs, secure settings, or connection strings.

If Gemini is missing or fails, the guest gets a **desk fallback** (phone/email from the public contact block)—not invented confirmations.

---

## 2. How this differs from the source Mori Assistant doc

| Source doc (rules-first) | This hotel (AI-driven) |
|--------------------------|-------------------------|
| Keyword rules answer rooms/rates/offers; Gemini last resort | **Gemini answers** every allowed question |
| `Gemini:UseFallback` flag | **Gemini is the product**; no FAQ rule engine |
| Unofficial Google Translate gtx for rule matching | **Do not use gtx**. Ask Gemini in the guest’s language; optional later: Cloud Translation with a vault key |
| `usedAiFallback` in public JSON | **Do not expose** whether AI ran |
| Global 20 rpm limiter; welcome unthrottled | **Per-IP** limits on welcome **and** message (see gaps we adopt) |
| Session counter only (40 msgs; cookie reset) | Per-IP + **signed daily quota** so clearing cookies does not reset spend |
| Rules run first for topics | **Sensitive refuse** runs first; then Gemini or desk |

**Keep from the source doc (good ideas):**

- Guest widget only; name configurable (`Chatbot:AssistantName`, default **Mori Assistant**).
- Input **1–500** characters; suggested chips send as normal text.
- CSRF header `RequestVerificationToken` on send (already `Program.cs` antiforgery).
- Escape HTML before `innerHTML`; apply `**bold**` only after escape.
- User bubbles `class="notranslate"` so the page translator does not rewrite typed text.
- Privacy line: chat does not share private booking data; call the hotel.
- **No chat transcript table** (stateless). Session may hold a counter; IP quota is the real cap.
- Vault-only Gemini key (`SecureSettingKeys.GeminiApiKey`); never appsettings/git.
- Key injected server-side (`x-goog-api-key` handler pattern).
- Temperature **0.3**, short **max output tokens** (256–400).
- System instructions: no invented bookings, prices, or credentials; no cancellations/payments processing.
- Failures → generic “ask the front desk” + public phone/email.
- Output filter after Gemini (same sensitive regex; reject “your reservation is confirmed” / fake MOR- codes).
- Isolate the visitor question from the context pack (two parts or clear delimiters)—do not concatenate untrusted text into the hotel facts block.
- Hide `usedAiFallback` from the client.
- Do not over-block “Wi-Fi password” as if it were staff credentials (allow public amenity Wi‑Fi copy only).
- Disclose Google processing on the **guest** privacy notice when chat ships.

**Reject from the source doc:**

- Topic keyword map / canned replies as the primary brain.
- Unofficial Translate for English-first filters as the only safety net (keep **multilingual sensitive regex** + script detection; still refuse booking-lookup *intents* without needing gtx).
- Building the widget on **admin** `_Layout`.
- Multi-model free-tier mesh in v1.

---

## 3. Privacy and out-of-scope (hard)

### Never query

- `Booking`, `PaymentRecord`, `BookingCharge`, assignment, walk-in internals
- `StaffAccount` / Identity / `StaffAccountAudit` / `SystemAuditLog` / `SystemFlushLog`
- `SecureSetting` ciphertext or any vault **read of other keys** except “is Gemini configured”
- Guest PII from a prior stay; emails+“my booking”; MOR- reference lookup
- **Physical room numbers** (`RoomDto.RoomNumber`) and occupancy of a specific door
- Walk-in-only offers (`GetActiveForWalkInAsync`) — staff channel

### Allowed context pack (server-assembled)

| Source | What to include | What to strip |
|--------|-----------------|---------------|
| `IRoomService.GetAllAsync` | **Available** room **types** only: type name, price/night, max occupancy, bed count, inclusions, public description | `RoomNumber`, `Id` of a unit, Unavailable/Cleaning rooms, `CreatedAt` |
| `ISpecialOfferService.GetActiveForGuestAsync` | Title, description, promo vs regular, min nights, end date (guest-facing) | Internal ids if not needed; walk-in-only rows |
| Public hotel facts | Name **Mori International Hotel**; address from guest footer/contact (MCity Properties, AS Fortuna, Mandaue City, Cebu); phones `+63 960 441 7525`, `(032) 238 8855`; check-in **14:00** / early **11:30** from `StayTimeFees`; “book on Accommodations” | Staff emails, SMTP, OCR, Gemini key |
| Reviews | **None in this repo today** — do not invent aggregates. Add later only if a **published** review API exists | Admin comments |

There is **no `HotelProfile` table**. Hardcode or `appsettings` **public** profile (`Chatbot:PublicProfile`) so contact copy is not scraped from Razor. Do not read Integration/Privacy admin view as “profile.”

### Guest data leaving the hotel

- The **question** and the **public context pack** go to **Google Gemini** when the key is set.
- **Do not** store the question in SQL.
- Logs: count + outcome (`refused` / `gemini` / `desk` / `error`) + IP hash optional. **Do not** log full prompts or answers with PII.
- Guest privacy page (when chat ships): “Questions may be sent to Google to generate a reply. We do not look up your reservation in chat.”

### Conversation memory (v1)

- **No DB transcript.** Optional: last **N ≤ 8** turns in an **encrypted session cookie** or server memory keyed by session id, **not** SQL, TTL short (e.g. 30 minutes). Enough for “what did I just ask about Deluxe” without a stealable history table.
- Mid-chat model failover (replay history to DeepSeek/ChatGPT): **not in v1**. If Gemini 429s, return desk fallback (and optional cooldown like OCR).

---

## 4. Security control map

### Pipeline (every `POST /api/chat/message`)

1. **AllowAnonymous** + antiforgery header (same as other JSON POSTs).
2. **Per-IP rate limit** (new policy `guest-chat`, e.g. 10/minute) — **not** a global 20/min bucket.
3. **Daily quota** that survives cookie clear: partition by IP (and optional `X-Forwarded-For` only if you already trust a proxy). Cap e.g. 40 successful Gemini calls / IP / UTC day. In-memory is enough (one process).
4. Length **1–500** trim; reject empty.
5. **Sensitive refuse** (no Gemini): booking lookup, MOR- codes, CVV/PAN, password reset / staff login, guest list, connection string, “show me everyone’s reservation”, email+reservation combo. Apply on raw text **and** a simple Unicode-normalized form. **Allow** generic “Wi‑Fi password for guests” as an amenity question.
6. If Gemini key **missing** or `Chatbot:Enabled` false → desk reply (200 with safe copy, or 503 with same copy—pick one and keep it).
7. Build **context pack** (cached 60–120s in `IMemoryCache`; invalidate on room/offer admin writes if easy).
8. Gemini: **system** = role + refuse list + “only use CONTEXT”; **context** = pack; **user** = guest text **only** (isolated).
9. **Output filter**: if reply matches sensitive patterns or claims a confirmed booking/payment, replace with desk copy.
10. Return `{ reply }` only. No model name, no `usedAiFallback`, no token counts.

### `GET /api/chat/welcome`

- Public, no CSRF.
- **Must** use the same **per-IP** limiter (or a lighter welcome policy). Source doc’s unthrottled welcome is a gap—do not copy it.
- Static or lightly localized welcome; **no Gemini** on welcome (saves quota, no prompt injection).

### Widget

- Partial on `_CustomerLayout` **except** auth/immersive-if-noisy: skip `GuestAuthPage` / Account / GoogleVerification (same `isAuthPage` flag).
- `hotel-chat.js` + styles in `booking.css` (navy `#0b1f3a`, teal `#1aa6a6`, white). No purple AI theme.
- Chips: `textContent` only.
- ~1.5s typing delay optional (UX); do not block the server on it.
- Suggested chips are **examples**, not a rule engine.

### Abuse / cost

- Per-IP on message + welcome.
- Daily IP Gemini cap (cookie-proof).
- Short max tokens; temperature 0.3.
- No LiteLLM / OpenRouter in v1.

### Prompt injection

- Jailbreak cannot `SELECT` bookings (context has none).
- Jailbreak **can** invent “you are confirmed.” **Output filter** is mandatory.
- Never put guest text inside the context JSON.

---

## 5. API (to implement later)

| Method | Route | Auth | Notes |
|--------|-------|------|--------|
| GET | `/api/chat/welcome` | Anonymous | Rate-limited; `{ reply, assistantName }` |
| POST | `/api/chat/message` | Anonymous + CSRF | Body `{ message }`; `{ reply }` |

Config (`appsettings` **non-secrets** only):

```json
"Chatbot": {
  "Enabled": false,
  "AssistantName": "Mori Assistant",
  "Model": "gemini-2.0-flash",
  "MaxInputChars": 500,
  "MaxOutputTokens": 256,
  "Temperature": 0.3,
  "MaxGeminiPerIpPerDay": 40,
  "HistoryTurns": 6
}
```

Key stays in vault. `Chatbot:Enabled` defaults **false** until the widget is tested.

---

## 6. Files to touch later (when exiting spec)

| Piece | Where |
|-------|--------|
| Widget markup | `Views/Shared/_HotelChatWidget.cshtml` + render from `_CustomerLayout` (not auth) |
| JS / CSS | `wwwroot/js/hotel-chat.js`, `wwwroot/css/booking.css` |
| API | `Controllers/ChatApiController.cs` |
| Orchestration | Replace stub `GeminiChatClient` with real HTTP + `DelegatingHandler` for API key |
| Context pack | `Services/ChatPublicContextBuilder.cs` — rooms + guest offers + public profile |
| Guardrails | `Services/ChatGuardrails.cs` — refuse + output filter |
| Rate limit | `Program.cs` policy `guest-chat` |
| i18n | `wwwroot/locales/*.json` keys for privacy line / desk fallback only |
| Guest privacy copy | Public privacy/terms page (not admin Integration) |
| Integration UI | `Views/Home/Privacy.cshtml` — change “does not turn chat on” when `Enabled` is documented |

**Do not** add chat to `BookingService`, admin sidebar, or React Room SPA.

**Patterns (backend-systems-architect):** `IMemoryCache` for context pack; `AddRateLimiter` partition by IP; vault like SMTP; OCR-style fail-open to desk on 429. No Redis, no Polly package, no queue.

---

## 7. UX (guest)

- FAB bottom-right, above toasts; navy/teal; Outfit + short Cormorant title if needed.
- Privacy one-liner in the panel footer.
- Desk fallback always includes **public** phone numbers from the contact block.
- Language: send `lang` from `guest-i18n` as a **hint** in the system prompt (“reply in this language if the question is in that language”). Allowlist `en`, `fil`/`tl`, `zh-Hans`, etc. from existing locale files—**do not** accept arbitrary `lang` into prompts without allowlist (source-doc gap).

---

## 8. Implementation phases (when coding starts)

**v1 (this spec):** widget + Gemini + guardrails + per-IP/daily quota + no transcript + privacy disclosure.  
**v1.1:** cache invalidation on room/offer write; admin kill switch already in config.  
**v2 (optional):** encrypted short history; 429 cooldown; **not** multi-vendor free-tier mesh.  
**Never:** booking lookup, staff chat, Google verify, guest “Continue with Google” as chat identity.

---

## 9. Validation / test plan (when built)

1. Ask “what rooms do you have?” → prices match **Available** types only; **no room numbers**.
2. “What’s my booking MOR-…” → refuse, no Gemini (or Gemini never sees a lookup).
3. “Cancel reservation 123” / “confirm I’m booked” → refuse or output filter → desk.
4. XSS payload in the box → escaped bubble; no script.
5. 500+ chars → 400.
6. Burst from one IP → 429 + desk copy.
7. Clear cookies, keep same IP → daily Gemini cap still applies.
8. Empty Gemini key → desk, no 500.
9. Auth pages (Login) → **no** widget.
10. Admin `/Rooms` → **no** guest widget.
11. Offer question → only `GetActiveForGuestAsync` data.
12. Privacy page mentions Google when chat is enabled.

---

## 10. Rollback

- `Chatbot:Enabled: false` and omit the partial.
- Leave vault key in place.
- No migration to revert if no transcript table.

---

## 11. Decision log

| Question | Decision |
|----------|----------|
| Rules-first vs AI-driven | **AI-driven** for answers |
| Guest vs admin | **Guest `_CustomerLayout` only** |
| Bookings in context | **Never** |
| Transcript SQL | **Never (v1)** |
| Unofficial Translate | **Never** |
| Multi-model failover | **Not v1** |
| `usedAiFallback` | **Never public** |
| Room numbers | **Never in context** |

When implementing, treat this file as the source of truth unless a later `/plan` supersedes it.
