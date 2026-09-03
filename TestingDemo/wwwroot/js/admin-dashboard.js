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
