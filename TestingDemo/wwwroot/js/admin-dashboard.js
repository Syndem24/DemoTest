(function () {
  const gridEl = document.getElementById("dashGrid");
  if (!gridEl || typeof GridStack === "undefined") return;

  const storageKey =
    "mori-dash-layout:" +
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
    const merged = [];
    const seen = new Set();

    defaults.forEach(function (node) {
      const savedNode = savedById.get(node.id);
      merged.push(savedNode ? { ...savedNode } : node);
      seen.add(node.id);
    });

    savedById.forEach(function (node, id) {
      if (!seen.has(id)) merged.push(node);
    });

    return merged;
  }

  const grid = GridStack.init(
    {
      column: 12,
      cellHeight: 88,
      margin: 10,
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

  const payloadEl = document.getElementById("dashChartData");
  if (!payloadEl || typeof Chart === "undefined") return;

  let payload;
  try {
    payload = JSON.parse(payloadEl.textContent || "{}");
  } catch (_) {
    return;
  }

  const navy = "#0b1f3a";
  const teal = "#1aa6a6";
  const days = payload.days || [];
  const status = payload.status || [];
  const channels = payload.channels || [];
  const charts = [];

  const revenueCanvas = document.getElementById("dashRevenueChart");
  if (revenueCanvas) {
    charts.push(
      new Chart(revenueCanvas, {
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
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: navy, boxWidth: 10 }
            }
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
      })
    );
  }

  const statusCanvas = document.getElementById("dashStatusChart");
  if (statusCanvas) {
    charts.push(
      new Chart(statusCanvas, {
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
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: navy, boxWidth: 10 }
            }
          }
        }
      })
    );
  }

  const channelCanvas = document.getElementById("dashChannelChart");
  if (channelCanvas && channels.length) {
    charts.push(
      new Chart(channelCanvas, {
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
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: navy, boxWidth: 10 }
            }
          }
        }
      })
    );
  }

  grid.on("resizestop", function () {
    charts.forEach(function (chart) { chart.resize(); });
  });
})();
