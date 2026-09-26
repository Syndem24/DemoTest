(function () {
  const gridEl = document.getElementById("dashGrid");
  if (!gridEl || typeof GridStack === "undefined") return;

  const storageKey =
    "mori-dash-layout:v3:" +
    (gridEl.getAttribute("data-dash-user") || "staff") +
    ":" +
    (gridEl.getAttribute("data-dash-role") || "any");
  const layoutUrl = gridEl.getAttribute("data-layout-url") || "/Dashboard/SaveLayout";

  function readAntiForgeryToken() {
    return (
      document.querySelector("#adminAntiForgery input[name='__RequestVerificationToken']")?.value ||
      document.querySelector("input[name='__RequestVerificationToken']")?.value ||
      ""
    );
  }

  function readSavedLayout() {
    const layoutEl = document.getElementById("dashLayoutData");
    if (layoutEl?.textContent) {
      try {
        const server = JSON.parse(layoutEl.textContent);
        if (Array.isArray(server) && server.length) return server;
      } catch (_) {
        /* fall through */
      }
    }

    try {
      const local = localStorage.getItem(storageKey);
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (_) {
      /* keep defaults */
    }

    return null;
  }

  function normalizeNode(node) {
    return {
      id: node.id || node.Id,
      x: node.x ?? node.X ?? 0,
      y: node.y ?? node.Y ?? 0,
      w: node.w ?? node.W ?? 2,
      h: node.h ?? node.H ?? 2
    };
  }

  function mergeLayout(saved, grid) {
    const savedById = new Map();
    saved.forEach(function (raw) {
      const node = normalizeNode(raw);
      if (node.id) savedById.set(node.id, node);
    });

    const defaults = grid.save(false).map(normalizeNode);
    const defaultById = new Map();
    defaults.forEach(function (node) {
      if (node.id) defaultById.set(node.id, node);
    });

    const merged = [];
    const seen = new Set();

    defaults.forEach(function (node) {
      const savedNode = savedById.get(node.id);
      if (savedNode) {
        const defaultY = node.y ?? 0;
        const savedY = savedNode.y ?? 0;
        merged.push({
          ...savedNode,
          y: Math.max(savedY, defaultY),
        });
      } else {
        merged.push(node);
      }
      seen.add(node.id);
    });

    savedById.forEach(function (node, id) {
      if (!seen.has(id)) merged.push(node);
    });

    return enforceVerticalGaps(merged, defaultById);
  }

  /** Ensure at least one empty grid row between major dashboard bands. */
  function enforceVerticalGaps(nodes, defaultById) {
    const byId = new Map(nodes.map(function (n) { return [n.id, n]; }));

    function bandBottom(id) {
      const n = byId.get(id);
      if (!n) return 0;
      return (n.y ?? 0) + (n.h ?? 0);
    }

    function bumpBelow(topId, bottomIds, minGapRows) {
      const floor = bandBottom(topId) + minGapRows;
      bottomIds.forEach(function (id) {
        const n = byId.get(id);
        if (!n) return;
        const def = defaultById.get(id);
        const minY = Math.max(floor, def?.y ?? 0);
        if ((n.y ?? 0) < minY) n.y = minY;
      });
    }

    bumpBelow("offers", ["revenue-chart", "status-chart"], 1);
    bumpBelow("revenue-chart", ["signals", "channels"], 1);
    bumpBelow("signals", ["attention"], 1);

    return nodes;
  }

  const grid = GridStack.init(
    {
      column: 12,
      cellHeight: 88,
      margin: 6,
      marginTop: 12,
      marginBottom: 12,
      marginLeft: 6,
      marginRight: 6,
      marginUnit: "px",
      float: false,
      disableOneColumnMode: false,
      handle: ".dash-widget-handle",
      resizable: { handles: "se" },
      animate: true
    },
    gridEl
  );

  let applyingLayout = false;
  const savedLayout = readSavedLayout();
  if (savedLayout) {
    applyingLayout = true;
    try {
      grid.load(mergeLayout(savedLayout, grid), false);
    } catch (_) {
      /* keep markup defaults */
    }
    applyingLayout = false;
  }

  let persistTimer = null;

  function serializeLayout() {
    return grid.save(false).map(function (node) {
      return { id: node.id, x: node.x, y: node.y, w: node.w, h: node.h };
    });
  }

  function persistLayout() {
    if (applyingLayout) return;

    const nodes = serializeLayout();
    localStorage.setItem(storageKey, JSON.stringify(nodes));

    const token = readAntiForgeryToken();
    fetch(layoutUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        RequestVerificationToken: token
      },
      body: JSON.stringify(nodes)
    }).catch(function () {
      /* localStorage still holds the last layout */
    });
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistLayout, 400);
  }

  grid.on("change", schedulePersist);

  const resetBtn = document.querySelector("[data-dash-reset]");
  resetBtn?.addEventListener("click", function () {
    localStorage.removeItem(storageKey);
    const token = readAntiForgeryToken();
    fetch(layoutUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        RequestVerificationToken: token
      },
      body: "[]"
    }).finally(function () {
      window.location.reload();
    });
  });

  const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
  function money(value) {
    return peso.format(Number(value || 0));
  }

  const chartInstances = [];
  let revenueChart = null;
  let statusChart = null;
  let channelChart = null;

  const payloadEl = document.getElementById("dashChartData");
  if (payloadEl && typeof Chart !== "undefined") {
    let payload;
    try {
      payload = JSON.parse(payloadEl.textContent || "{}");
    } catch (_) {
      payload = null;
    }

    if (payload) {
      const navy = "#0b1f3a";
      const teal = "#1aa6a6";
      const days = payload.days || [];
      const status = payload.status || [];
      const channels = payload.channels || [];

      const chartLayout = {
        padding: { top: 6, bottom: 12, left: 4, right: 4 }
      };

      const chartLegend = {
        position: "bottom",
        labels: {
          color: navy,
          boxWidth: 10,
          boxHeight: 10,
          padding: 12
        }
      };

      const revenueCanvas = document.getElementById("dashRevenueChart");
      if (revenueCanvas) {
        revenueChart = new Chart(revenueCanvas, {
          type: "bar",
          data: {
            labels: days.map(function (d) { return d.Label || d.label; }),
            datasets: [
              {
                type: "bar",
                label: "Posted ₱",
                data: days.map(function (d) { return d.Revenue ?? d.revenue ?? 0; }),
                backgroundColor: "rgba(26, 166, 166, 0.72)",
                borderRadius: 6,
                yAxisID: "y"
              },
              {
                type: "line",
                label: "Arrivals",
                data: days.map(function (d) { return d.Arrivals ?? d.arrivals ?? 0; }),
                borderColor: navy,
                backgroundColor: navy,
                tension: 0.3,
                yAxisID: "y1"
              }
            ]
          },
          options: {
            maintainAspectRatio: false,
            layout: chartLayout,
            plugins: {
              legend: chartLegend
            },
            scales: {
              x: { ticks: { color: navy }, grid: { display: false } },
              y: { ticks: { color: navy }, beginAtZero: true, position: "left" },
              y1: {
                ticks: { color: navy, precision: 0 },
                beginAtZero: true,
                position: "right",
                grid: { drawOnChartArea: false }
              }
            }
          }
        });
        chartInstances.push(revenueChart);
      }

      const statusCanvas = document.getElementById("dashStatusChart");
      if (statusCanvas) {
        statusChart = new Chart(statusCanvas, {
          type: "doughnut",
          data: {
            labels: status.map(function (s) { return s.Label || s.label; }),
            datasets: [
              {
                data: status.map(function (s) { return s.Count ?? s.count ?? 0; }),
                backgroundColor: [teal, navy, "rgba(11,31,58,0.45)", "rgba(26,166,166,0.35)", "rgba(11,31,58,0.2)"],
                borderWidth: 0
              }
            ]
          },
          options: {
            maintainAspectRatio: false,
            layout: chartLayout,
            plugins: {
              legend: chartLegend
            }
          }
        });
        chartInstances.push(statusChart);
      }

      const channelCanvas = document.getElementById("dashChannelChart");
      if (channelCanvas && channels.length) {
        channelChart = new Chart(channelCanvas, {
          type: "doughnut",
          data: {
            labels: channels.map(function (s) { return s.Label || s.label; }),
            datasets: [
              {
                data: channels.map(function (s) { return s.Count ?? s.count ?? 0; }),
                backgroundColor: [teal, navy, "rgba(11,31,58,0.45)", "rgba(26,166,166,0.35)", "rgba(11,31,58,0.2)", "rgba(26,166,166,0.55)", "rgba(11,31,58,0.3)"],
                borderWidth: 0
              }
            ]
          },
          options: {
            maintainAspectRatio: false,
            layout: chartLayout,
            plugins: {
              legend: chartLegend
            }
          }
        });
        chartInstances.push(channelChart);
      }
    }
  }

  grid.on("resizestop", function () {
    chartInstances.forEach(function (chart) { chart.resize(); });
  });

  function applySnapshot(snapshot) {
    if (!snapshot) return;

    const occupancyPct = Number(snapshot.occupancyPercent ?? snapshot.OccupancyPercent ?? 0);
    const roomsOccupied = snapshot.roomsOccupied ?? snapshot.RoomsOccupied ?? 0;
    const roomsTotal = snapshot.roomsTotal ?? snapshot.RoomsTotal ?? 0;
    const roomsAvailable = snapshot.roomsAvailable ?? snapshot.RoomsAvailable ?? 0;
    const roomsCleaning = snapshot.roomsCleaning ?? snapshot.RoomsCleaning ?? 0;
    const roomsUnavailable = snapshot.roomsUnavailable ?? snapshot.RoomsUnavailable ?? 0;
    const revenueToday = snapshot.revenueToday ?? snapshot.RevenueToday ?? 0;
    const revenueMonth = snapshot.revenueMonth ?? snapshot.RevenueMonth ?? 0;
    const refundsMonth = snapshot.refundsMonth ?? snapshot.RefundsMonth ?? 0;
    const pipelineValue = snapshot.pipelineValue ?? snapshot.PipelineValue ?? 0;
    const averageStayValue = snapshot.averageStayValue ?? snapshot.AverageStayValue ?? 0;
    const activeOffers = snapshot.activeOffers ?? snapshot.ActiveOffers ?? 0;
    const confirmedStays = snapshot.confirmedStays ?? snapshot.ConfirmedStays ?? 0;
    const bookedSharePercent = snapshot.bookedSharePercent ?? snapshot.BookedSharePercent ?? 0;
    const adr = snapshot.adr ?? snapshot.Adr ?? 0;
    const revPar = snapshot.revPar ?? snapshot.RevPar ?? 0;
    const asOfPh = snapshot.asOfPh ?? snapshot.AsOfPh ?? "";
    const isAdmin = snapshot.isAdminManager ?? snapshot.IsAdminManager ?? false;

    const heroOccupancy = document.querySelector("[data-dash-field='occupancyPercent']");
    if (heroOccupancy) heroOccupancy.textContent = occupancyPct.toFixed(1).replace(/\.0$/, "") + "%";
    const heroRooms = document.querySelector("[data-dash-field='occupancyRooms']");
    if (heroRooms) heroRooms.textContent = roomsOccupied + " of " + roomsTotal + " rooms";
    const heroRevenue = document.querySelector("[data-dash-field='revenueToday']");
    if (heroRevenue) heroRevenue.textContent = money(revenueToday);
    const heroAsOf = document.querySelector("[data-dash-field='asOfPh']");
    if (heroAsOf) heroAsOf.textContent = asOfPh;

    const occupancyStat = document.querySelector("[data-dash-widget='occupancy-stat']");
    if (occupancyStat) occupancyStat.textContent = occupancyPct.toFixed(1).replace(/\.0$/, "") + "%";
    const occupancyMeta = document.querySelector("[data-dash-widget='occupancy-meta']");
    if (occupancyMeta) occupancyMeta.textContent = roomsOccupied + " occupied · " + roomsAvailable + " open";
    const occupancyNote = document.querySelector("[data-dash-widget='occupancy-note']");
    if (occupancyNote) occupancyNote.textContent = roomsCleaning + " maintaining · " + roomsUnavailable + " unavailable";
    const occupancyRates = document.querySelector("[data-dash-widget='occupancy-rates']");
    if (occupancyRates) occupancyRates.textContent = "ADR " + money(adr) + " · RevPAR " + money(revPar);

    const arrivalsEl = document.querySelector("[data-dash-arrivals]");
    if (arrivalsEl) arrivalsEl.textContent = String(snapshot.arrivalsToday ?? snapshot.ArrivalsToday ?? 0);
    const departuresEl = document.querySelector("[data-dash-departures]");
    if (departuresEl) departuresEl.textContent = String(snapshot.departuresToday ?? snapshot.DeparturesToday ?? 0);
    const inHouseEl = document.querySelector("[data-dash-inhouse]");
    if (inHouseEl) inHouseEl.textContent = String(snapshot.inHouseStays ?? snapshot.InHouseStays ?? 0);
    const pendingEl = document.querySelector("[data-dash-pending]");
    if (pendingEl) pendingEl.textContent = String(snapshot.pendingStays ?? snapshot.PendingStays ?? 0);

    const moneyStat = document.querySelector("[data-dash-widget='money-stat']");
    if (moneyStat) moneyStat.textContent = money(revenueMonth);
    const moneyToday = document.querySelector("[data-dash-revenue-today]");
    if (moneyToday) moneyToday.textContent = money(revenueToday);
    const moneyRefunds = document.querySelector("[data-dash-widget='money-refunds']");
    if (moneyRefunds && isAdmin) moneyRefunds.textContent = "Refunded this month " + money(refundsMonth);
    const moneyPipeline = document.querySelector("[data-dash-widget='money-pipeline']");
    if (moneyPipeline) moneyPipeline.textContent = "Open stay value " + money(pipelineValue) + " · avg " + money(averageStayValue);

    const offersStat = document.querySelector("[data-dash-widget='offers-stat']");
    if (offersStat) offersStat.textContent = String(activeOffers);
    const offersNote = document.querySelector("[data-dash-widget='offers-note']");
    if (offersNote) {
      offersNote.textContent = confirmedStays + " confirmed · " + Number(bookedSharePercent).toFixed(1).replace(/\.0$/, "") + "% of open stays confirmed";
    }

    const signals = snapshot.signals ?? snapshot.Signals ?? [];
    const signalsRoot = document.querySelector("[data-dash-widget='signals']");
    if (signalsRoot) {
      signalsRoot.replaceChildren();
      signals.forEach(function (signal) {
        const li = document.createElement("li");
        li.className = "dash-signal dash-signal--" + (signal.level ?? signal.Level ?? "info");
        const strong = document.createElement("strong");
        strong.textContent = signal.title ?? signal.Title ?? "";
        const span = document.createElement("span");
        span.textContent = signal.detail ?? signal.Detail ?? "";
        li.append(strong, span);
        signalsRoot.append(li);
      });
    }

    const attention = snapshot.attention ?? snapshot.Attention ?? [];
    const attentionRoot = document.querySelector("[data-dash-widget='attention']");
    if (attentionRoot) {
      attentionRoot.replaceChildren();
      attention.forEach(function (item) {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = item.href ?? item.Href ?? "#";
        const strong = document.createElement("strong");
        strong.textContent = item.title ?? item.Title ?? "";
        const span = document.createElement("span");
        span.textContent = item.detail ?? item.Detail ?? "";
        link.append(strong, span);
        li.append(link);
        attentionRoot.append(li);
      });
    }

    const last7Days = snapshot.last7Days ?? snapshot.Last7Days ?? [];
    if (revenueChart && last7Days.length) {
      revenueChart.data.labels = last7Days.map(function (d) { return d.label ?? d.Label; });
      revenueChart.data.datasets[0].data = last7Days.map(function (d) { return d.revenue ?? d.Revenue ?? 0; });
      revenueChart.data.datasets[1].data = last7Days.map(function (d) { return d.arrivals ?? d.Arrivals ?? 0; });
      revenueChart.update("none");
    }

    const statusMix = snapshot.statusMix ?? snapshot.StatusMix ?? [];
    if (statusChart && statusMix.length) {
      statusChart.data.labels = statusMix.map(function (s) { return s.label ?? s.Label; });
      statusChart.data.datasets[0].data = statusMix.map(function (s) { return s.count ?? s.Count ?? 0; });
      statusChart.update("none");
    }

    const channelMix = snapshot.channelMix ?? snapshot.ChannelMix ?? [];
    if (channelChart && channelMix.length) {
      channelChart.data.labels = channelMix.map(function (s) { return s.label ?? s.Label; });
      channelChart.data.datasets[0].data = channelMix.map(function (s) { return s.count ?? s.Count ?? 0; });
      channelChart.update("none");
    }
  }

  async function refreshSnapshot() {
    const snapshotUrl = gridEl.getAttribute("data-dash-snapshot-url");
    if (!snapshotUrl) return;
    try {
      const response = await fetch(snapshotUrl, {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) return;
      const snapshot = await response.json();
      applySnapshot(snapshot);
    } catch (_) {
      /* keep current numbers */
    }
  }

  function shouldRefreshDashboard(scopes) {
    return scopes.includes("all") || scopes.includes("dashboard");
  }

  window.addEventListener("mori:admin-refresh", function (event) {
    const scopes = event.detail?.scopes || [];
    if (!shouldRefreshDashboard(scopes)) return;
    if (window.MoriAdminRealtime) {
      window.MoriAdminRealtime.scheduleRefresh("dashboard", refreshSnapshot);
    } else {
      void refreshSnapshot();
    }
  });

})();


/* ---------------------------------------------------------------------- */
/* Generate report — independent of GridStack so a CDN failure can't kill  */
/* the report button. Flow: pick a Manila date range → preview → save as   */
/* PDF (server-generated file via /api/admin/dashboard/report.pdf).        */
/* ---------------------------------------------------------------------- */
(function () {
  const reportBtn = document.querySelector("[data-dash-report]");
  const reportModal = document.querySelector("[data-dash-report-modal]");
  const reportDoc = document.querySelector("[data-dash-report-doc]");
  const fromInput = reportModal?.querySelector("[data-dash-report-from]");
  const toInput = reportModal?.querySelector("[data-dash-report-to]");
  const previewBtn = reportModal?.querySelector("[data-dash-report-preview]");
  const printBtn = reportModal?.querySelector("[data-dash-report-print]");

  const ROWS_PER_SHEET = 22;
  const PLACEHOLDER =
    '<p class="admin-report-placeholder">Choose a date range, then select <strong>Preview report</strong>.</p>';

  const pesoFmt = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  });
  const manilaDayFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const phDate = (utc) =>
    utc
      ? new Date(utc).toLocaleString("en-PH", {
          timeZone: "Asia/Manila",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "—";
  const esc = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  /* ---- helpers -------------------------------------------------------- */

  const chunk = (items, size) => {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  };

  const tableHead = (head) =>
    `<thead><tr>${head
      .map(
        (h) =>
          `<th class="${/total|paid|amount|rate|count|available|occupied|cleaning|unavailable|occ|\(\d+\)$/i.test(h) ? "num" : ""}">${esc(h)}</th>`
      )
      .join("")}</tr></thead>`;

  /**
   * One report section → array of sheet-inner HTML strings, each holding at
   * most ROWS_PER_SHEET rows. Continued sheets repeat the table header.
   */
  function tableParts(title, note, head, rowHtmlList, emptyText) {
    if (!rowHtmlList.length) {
      return [
        `<h2>${esc(title)}</h2>
         ${note ? `<p class="admin-report-note">${esc(note)}</p>` : ""}
         <table class="admin-report-table">${tableHead(head)}
           <tbody><tr><td colspan="${head.length}" class="admin-report-empty">${esc(emptyText || "No records.")}</td></tr></tbody>
         </table>`,
      ];
    }
    return chunk(rowHtmlList, ROWS_PER_SHEET).map(
      (rows, i) =>
        `<h2>${esc(title)}${i ? ` <span class="admin-report-cont">(continued)</span>` : ""}</h2>
         ${!i && note ? `<p class="admin-report-note">${esc(note)}</p>` : ""}
         <table class="admin-report-table">${tableHead(head)}<tbody>${rows.join("")}</tbody></table>`
    );
  }

  function reportBars(title, note, entries) {
    const max = Math.max(1, ...entries.map((e) => e.value));
    const rows = entries
      .map(
        (e) => `<div class="admin-report-bar-row">
          <span class="admin-report-bar-label">${esc(e.label)}</span>
          <span class="admin-report-bar-track"><i style="width:${((e.value / max) * 100).toFixed(1)}%"></i></span>
          <span class="admin-report-bar-value">${esc(e.display ?? e.value)}</span>
        </div>`
      )
      .join("");
    return `<div class="admin-report-chart">
      <h3>${esc(title)}</h3>
      ${note ? `<p class="admin-report-note">${esc(note)}</p>` : ""}
      ${rows}
    </div>`;
  }

  /* ---- document builder ------------------------------------------------ */

  function buildReportDoc(data) {
    const kpi = (label, value) =>
      `<li><span>${esc(label)}</span><strong>${esc(value)}</strong></li>`;

    const generatedAt = new Date(data.generatedAtUtc).toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "full",
      timeStyle: "short",
    });
    const docRef = `OPS-${esc(data.generatedBy || "staff")}-${new Date(data.generatedAtUtc).toISOString().slice(0, 10)}`;

    const headHtml = `<header class="admin-report-head">
        <div class="admin-report-masthead">
          <img class="admin-report-logo" src="/Images/Logo.png" alt="">
          <div>
            <p class="admin-report-hotel">${esc(data.hotelName || "Mori International Hotel")}</p>
            <h1>Operations report</h1>
            <p class="admin-report-meta">Period: ${esc(data.rangeLabel || "")} · Generated ${esc(generatedAt)} · by ${esc(data.generatedBy || "staff")}</p>
            <p class="admin-report-ref">Doc ref ${docRef}</p>
          </div>
        </div>
        <ul class="admin-report-kpis">
          ${kpi("Bookings", data.bookingCount)}
          ${kpi("Reservations", data.reservationCount)}
          ${kpi("Payment records", data.paymentRecordCount)}
          ${kpi("Rooms", data.roomCount)}
          ${kpi("Posted revenue", pesoFmt.format(data.revenuePostedTotal || 0))}
        </ul>
      </header>`;

    const stayCols = ["Reference", "Guest", "Stay", "Rooms", "Status", "Total", "Paid"];
    const stayRow = (b) => `<tr>
          <td>${esc(b.reference)}</td><td>${esc(b.guestName)}</td>
          <td>${phDate(b.checkInAtUtc)} → ${phDate(b.checkoutTimeUtc)}</td>
          <td>${esc(b.rooms)}</td><td>${esc(b.status)}</td>
          <td class="num">${pesoFmt.format(b.totalAmount)}</td>
          <td class="num">${pesoFmt.format(b.paidTotal)}</td>
        </tr>`;

    const paymentRows = (data.payments || []).map(
      (p) => `<tr>
          <td>${esc(p.receiptNumber)}</td><td>${esc(p.bookingReference)}</td>
          <td>${esc(p.eventType)}</td><td>${esc(p.method)}</td>
          <td class="num">${pesoFmt.format(p.amount)}</td>
          <td>${esc(p.status)}</td>
          <td>${phDate(p.paidAtUtc)}</td><td>${esc(p.receivedBy)}</td>
        </tr>`
    );

    /* Per-date availability grid — Opera-style date rows × room-type columns. */
    const typeColumns = data.roomTypeColumns || [];
    const availHead = [
      "Date",
      ...typeColumns.map((c) => `${c.name} (${c.total})`),
      "Occupied",
      "Available",
      "Occ %",
    ];
    const availRows = (data.availabilityByDate || []).map(
      (r) => `<tr>
          <td>${esc(r.dateLabel)}</td>
          ${(r.bookedByType || []).map((n) => `<td class="num">${n}</td>`).join("")}
          <td class="num"><strong>${r.occupied}</strong></td>
          <td class="num">${r.available}</td>
          <td class="num">${r.occupancyPercent}%</td>
        </tr>`
    );

    /* Per-date house status — same dates, one column per status category. */
    const statusHead = ["Date", "Occupied", "Available", "Cleaning", "Unavailable", "Occ %"];
    const statusRows = (data.availabilityByDate || []).map(
      (r) => `<tr>
          <td>${esc(r.dateLabel)}</td>
          <td class="num"><strong>${r.occupied}</strong></td>
          <td class="num">${r.available}</td>
          <td class="num">${r.cleaning}</td>
          <td class="num">${r.unavailable}</td>
          <td class="num">${r.occupancyPercent}%</td>
        </tr>`
    );

    const chartsInner = `<h2>Charts</h2>
        <p class="admin-report-note">Visual summary for ${esc(data.rangeLabel || "the selected period")} — this is the last page of the printed report.</p>
        ${reportBars(
          "Posted revenue — selected period",
          "Cash posted per day (or week for long ranges), Manila time.",
          (data.trend || []).map((d) => ({
            label: d.label,
            value: Number(d.revenue || 0),
            display: pesoFmt.format(d.revenue || 0),
          }))
        )}
        ${reportBars(
          "Arrivals — selected period",
          "Check-ins scheduled per day (or week).",
          (data.trend || []).map((d) => ({ label: d.label, value: Number(d.arrivals || 0) }))
        )}
        ${reportBars(
          "Booking status mix",
          "Bookings and reservations overlapping the period, by status.",
          (data.bookingStatusMix || []).map((s) => ({ label: s.label, value: Number(s.count || 0) }))
        )}
        ${reportBars(
          "Room status mix",
          "Physical room inventory by status — point-in-time, not date-filtered.",
          (data.roomStatusMix || []).map((s) => ({ label: s.label, value: Number(s.count || 0) }))
        )}`;

    const parts = [
      ...tableParts("Bookings", "Walk-in and online bookings whose stay overlaps the period.", stayCols, (data.bookings || []).map(stayRow), "No bookings in this period."),
      ...tableParts("Reservations", "Advance reservations whose stay overlaps the period.", stayCols, (data.reservations || []).map(stayRow), "No reservations in this period."),
      ...tableParts(
        "Payment records",
        "Append-only payment ledger posted in the period — latest 500 events.",
        ["Receipt", "Booking", "Event", "Method", "Amount", "Status", "Posted at", "Received by"],
        paymentRows,
        "No payment records in this period."
      ),
      ...tableParts(
        "Room availability by type",
        `Rooms booked per type for each date in the period — pending and confirmed stays deduct inventory. Housekeeping/off-market doors are already removed from "Available".${data.availabilityTruncated ? " Showing the first 93 days of the range." : ""}`,
        availHead,
        availRows,
        "No rooms configured."
      ),
      ...tableParts(
        "Room status by date",
        "House position per date: rooms held by bookings (Occupied), doors open to sell (Available), and current housekeeping flags applied flat (Cleaning / Unavailable).",
        statusHead,
        statusRows,
        "No rooms configured."
      ),
      chartsInner,
    ];

    return parts
      .map(
        (inner, i) =>
          `<section class="admin-report-sheet">
             <div class="admin-report-sheet-brand">
               <img src="/Images/Logo.png" alt="" onerror="this.style.display='none'">
               <span>Mori International Hotel</span>
               <em>${docRef}</em>
             </div>
             ${i === 0 ? headHtml : ""}${inner}
             <footer class="admin-report-sheet-foot">
               <span>Mori International Hotel · official operations softcopy · ${esc(data.generatedBy || "staff")}</span>
               <span class="admin-report-sheet-num">Page ${i + 1} of ${parts.length}</span>
             </footer>
           </section>`
      )
      .join("");
  }

  /* ---- modal + fetch flow ---------------------------------------------- */

  function openReportModal() {
    if (!reportModal) return;
    reportModal.hidden = false;
    document.body.classList.add("admin-report-modal-open");
    fromInput?.focus();
  }

  function closeReportModal() {
    if (!reportModal) return;
    reportModal.hidden = true;
    document.body.classList.remove("admin-report-modal-open");
    reportBtn?.focus();
  }

  function setPrintEnabled(enabled) {
    if (printBtn) printBtn.disabled = !enabled;
  }

  const showReportError = (message) => {
    if (reportDoc) {
      reportDoc.innerHTML = `<p class="admin-report-placeholder is-error">${esc(message)}</p>`;
    }
    setPrintEnabled(false);
  };

  async function loadReport() {
    const from = fromInput?.value;
    const to = toInput?.value;
    if (!from || !to) {
      showReportError("Pick both From and To dates first.");
      return;
    }
    if (from > to) {
      showReportError("The From date must be on or before the To date.");
      return;
    }
    // Guard unreasonable ranges: report is operational, not archival —
    // cap at 366 days (the availability grid itself truncates past 93).
    const spanDays =
      Math.round((Date.parse(to + "T00:00:00") - Date.parse(from + "T00:00:00")) / 86400000) + 1;
    if (spanDays > 366) {
      showReportError("That range is too wide — pick a span of one year or less.");
      return;
    }
    if (!Number.isFinite(spanDays) || spanDays < 1) {
      showReportError("Those dates are not valid — check the From and To fields.");
      return;
    }

    setPrintEnabled(false);
    window.setAdminExportLoading?.(true, {
      title: "Building report…",
      detail: "Gathering bookings, payments, and room status for the period.",
    });
    try {
      const res = await fetch(
        `/api/admin/dashboard/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers: { Accept: "application/json" }, credentials: "same-origin" }
      );
      if (!res.ok) throw new Error(`Report failed (${res.status})`);
      const data = await res.json();
      if (reportDoc) reportDoc.innerHTML = buildReportDoc(data);
      setPrintEnabled(true);
    } catch (error) {
      if (reportDoc) {
        reportDoc.innerHTML =
          '<p class="admin-report-placeholder is-error">Unable to build the report for that range. Try again.</p>';
      }
      alert(
        window.friendlyAdminExportError?.(error, "Unable to build the report. Please try again.") ||
          "Unable to build the report."
      );
    } finally {
      window.setAdminExportLoading?.(false);
    }
  }

  /* ---- wiring ------------------------------------------------------------ */

  reportBtn?.addEventListener("click", () => {
    // Default range: last 30 Manila days ending today.
    const todayManila = manilaDayFmt.format(new Date());
    const monthAgo = manilaDayFmt.format(new Date(Date.now() - 29 * 86400000));
    if (toInput && !toInput.value) toInput.value = todayManila;
    if (fromInput && !fromInput.value) fromInput.value = monthAgo;
    if (reportDoc) reportDoc.innerHTML = PLACEHOLDER;
    setPrintEnabled(false);
    openReportModal();
  });

  previewBtn?.addEventListener("click", loadReport);
  [fromInput, toInput].forEach((input) =>
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void loadReport();
      }
    })
  );

  reportModal?.querySelector("[data-dash-report-close]")?.addEventListener("click", closeReportModal);
  reportModal?.addEventListener("click", (event) => {
    if (event.target === reportModal) closeReportModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && reportModal && !reportModal.hidden) closeReportModal();
  });
  printBtn?.addEventListener("click", () => {
    const from = fromInput?.value;
    const to = toInput?.value;
    if (!from || !to) return;
    window.location.href =
      `/api/admin/dashboard/report.pdf?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  });
})();
