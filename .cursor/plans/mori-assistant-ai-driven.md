# Mori Assistant — rules-first guest chatbot

**Status:** Implemented — FAQ rules + DB first; optional Gemini when `Chatbot:UseGeminiFallback` is true; translate-to-English for rule matching; reply localized to guest input language; `usedAiFallback: true` only when Gemini answered.

## Pipeline

1. Refuse sensitive intents (localized)  
2. Detect language + translate guest text → English (matching only)  
3. `TryRuleBasedReply` (rooms, rates, offers, book, pay, location, times, contact, wifi, reviews)  
4. Translate rule / unknown reply → guest language  
5. If miss + `UseGeminiFallback` + Gemini key → Gemini with language hint  
6. Else `BuildUnknownTopicReply` (localized) — HTTP 200, `usedAiFallback: false`  

Public JSON: `{ reply, usedAiFallback }`. Guest UI does not show “AI failed”.

## Config

- `Chatbot:UseGeminiFallback` in appsettings  
- Vault: `Gemini.ApiKey`  

---
