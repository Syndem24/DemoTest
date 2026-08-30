# Analytical staff dashboard plan

**Status:** Implemented  
**Surface:** Admin `_Layout` — Receptionist and AdminManager only (`/Dashboard`)

## Tool search (use existing, do not add a BI stack)

| Need | Candidates | Choice |
|---|---|---|
| Drag / resize report frames | GridStack.js, Muuri, interact.js, react-grid-layout | **GridStack 11** (vanilla, MVC-friendly, no React/Blazor) |
| Charts | Chart.js, Apache ECharts, Plotly | **Chart.js 4** (small CDN, mixed bar+line + doughnut) |
| Full BI | Power BI, Metabase, Grafana | **Out of scope** — one hotel, one SQL database |
| Layout persist | DB JSON, localStorage | **localStorage** per staff user + role (reset button) |

CDN: `gridstack@11.3.0`, `chart.js@4.4.8`. No new NuGet packages.

## Calculations (server, PH calendar)

- Occupancy % = occupied rooms / total rooms
- ADR = posted revenue today / occupied rooms
- RevPAR = posted revenue today / total rooms
- Month posted / refunds from `PaymentRecord` (month start Manila → now)
- Pipeline = sum of pending + confirmed `TotalAmount`
- Average stay value = pipeline / open stays
- Booked share = confirmed / (pending + confirmed)
- 7-day revenue, arrivals, and occupied room-nights from overlapping stays
- Decision signals from occupancy, pending arrivals, housekeeping, refund ratio (admin), live offers

## Role split

- Both roles see house, cash posted, pipeline, charts, attention list
- AdminManager only: month refunds + refund-pressure signal
- Guest role cannot open `/Dashboard`
