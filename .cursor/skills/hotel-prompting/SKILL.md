---
name: hotel-prompting
description: >-
  Turns vague hotel-system requests into clear implementation plans using project
  prompt templates. Use when the user asks how to prompt, wants optimized prompts,
  prompt templates, or smoother agent requests for this hotel booking system.
---

# Hotel prompting

## Goal
Help the user write short prompts the agent can execute without guessing.

## Prompt formula
Use this shape:

```text
[Surface]: [Goal]. [Data/behavior]. [UI constraint]. [Out of scope].
```

| Part | Options |
|------|---------|
| Surface | Admin / Customer booking / Rooms SPA / Shared |
| Goal | what changes on screen or in flow |
| Data | from Room Management / UI-only / save to DB |
| UI | 3 colors, hero photo only, scalable, modals |
| Out of scope | "no backend yet", "don't touch admin", etc. |

## Ready templates

### Customer UI
```text
Customer booking: [change]. Pull available rooms from Room Management. UI-only (modals/toasts). Keep navy/white/teal. Hero image only on hero.
```

### Admin
```text
Admin: [change] in sidebar/layout/Rooms. Don't change customer booking unless needed.
```

### Wire real booking later
```text
Implement real reservation save for Booking. Add model/service/API as needed. Keep current customer UI. Validate dates + available room.
```

### Responsive fix
```text
Make Booking page scalable on mobile/tablet/desktop. No redesign. Fix overflow and tap targets only.
```

### Small visual tweak
```text
Booking UI only: [specific element]. Don't change data or navigation.
```

## Agent response when this skill is used
1. Rewrite the user's ask into one filled template
2. Confirm assumptions in one line
3. Implement (or wait if user only asked for the prompt)
