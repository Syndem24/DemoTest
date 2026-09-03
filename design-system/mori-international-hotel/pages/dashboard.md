# Dashboard — Clean soft cards

> Overrides `MASTER.md` for `/Dashboard`.

---

## Design principle

**One card, one border, one shadow** — no nested inset frames. Readable KPI text without scrolling inside small widgets.

---

## Visual system

| Layer | Treatment |
|-------|-----------|
| Canvas | `#eef3f6` flat linen |
| Widget cards | White `#fff`, `1px` navy border, single soft drop shadow |
| Widget header | Hairline divider under title row |
| Today’s board | Plain grid — no per-cell inset boxes |
| Charts | No recessed frame — chart sits directly in card |
| Signals / attention | Light teal tint + left accent bar only |

---

## Layout defaults

Top KPI widgets default to **3 grid rows** height so stats and notes fit without inner scrollbars. Users with an old saved layout should click **Reset layout** once.

---

## Avoid

- Dual neumorphic shadows (white halo)
- Inset shadows on children inside cards
- `overflow: auto` on KPI list areas
