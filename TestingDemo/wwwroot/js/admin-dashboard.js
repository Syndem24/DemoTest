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

    return resolveLayoutOverlaps(enforceVerticalGaps(merged, defaultById));
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
    bumpBelow("channels", ["attention"], 1);
    bumpBelow("attention", ["room-types", "reviews"], 1);

    return nodes;
  }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  /* Saved layouts (server or localStorage) can contain stale cells that
     collide after widget sizes change — push each colliding node below
     whatever it overlaps so two frames can never share a cell. */
  function resolveLayoutOverlaps(nodes) {
    const sorted = nodes
      .slice()
      .sort(function (a, b) {
        return (a.y - b.y) || (a.x - b.x);
      });
    const placed = [];
    sorted.forEach(function (n) {
      n.w = Math.max(1, Math.min(12, n.w ?? 1));
      n.h = Math.max(1, n.h ?? 1);
      n.x = Math.max(0, Math.min(12 - n.w, n.x ?? 0));
      n.y = Math.max(0, n.y ?? 0);
      let guard = 0;
      while (guard++ < 200) {
        let pushTo = -1;
        for (const p of placed) {
          if (rectsOverlap(n, p)) pushTo = Math.max(pushTo, p.y + p.h);
        }
        if (pushTo < 0) break;
        n.y = pushTo;
      }
      placed.push(n);
    });
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
    let mergedNodes = null;
    try {
      mergedNodes = mergeLayout(savedLayout, grid);
      grid.load(mergedNodes, false);
    } catch (_) {
      /* keep markup defaults */
    }
    applyingLayout = false;
    /* Rewrite the saved layout when the merge had to move anything — a stale
       overlapping layout must not reload the same collisions next visit. */
    if (mergedNodes) {
      const beforeById = new Map();
      savedLayout.forEach(function (r) {
        const n = normalizeNode(r);
        if (n.id) beforeById.set(n.id, n);
      });
      const moved = mergedNodes.some(function (n) {
        const s = beforeById.get(n.id);
        return !s || s.y !== n.y || s.x !== n.x || s.w !== n.w || s.h !== n.h;
      });
      if (moved) persistLayout();
    }
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
    }
  }

  function renderStayMix(slices) {
    const bar = document.querySelector("[data-dash-staymix]");
    if (!bar) return;
    const bookings = (slices || []).find(function (s) {
      return (s.label ?? s.Label) === "Bookings";
    });
    const reservations = (slices || []).find(function (s) {
      return (s.label ?? s.Label) === "Reservations";
    });
    const bCount = bookings ? (bookings.count ?? bookings.Count ?? 0) : 0;
    const rCount = reservations ? (reservations.count ?? reservations.Count ?? 0) : 0;
    const total = bCount + rCount;
    const bookingPct = total > 0 ? (bCount / total) * 100 : 0;
    const bSeg = bar.querySelector("[data-staymix-booking]");
    const rSeg = bar.querySelector("[data-staymix-reservation]");
    const bNum = bar.querySelector("[data-staymix-booking-n]");
    const rNum = bar.querySelector("[data-staymix-reservation-n]");
    if (bSeg) bSeg.style.width = `${bookingPct}%`;
    if (rSeg) rSeg.style.width = `${100 - bookingPct}%`;
    if (bNum) bNum.textContent = String(bCount);
    if (rNum) rNum.textContent = String(rCount);
    bar.querySelector(".dash-staymix-bar")?.setAttribute(
      "aria-label",
      `Open stays: ${bCount} bookings, ${rCount} reservations`,
    );
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

        const action = item.action ?? item.Action ?? "";
        const bookingId = item.bookingId ?? item.BookingId ?? 0;
        if (bookingId) {
          link.setAttribute("data-dash-open-booking", String(bookingId));
        }
        const wrap = document.createElement("div");
        wrap.className = "dash-attention-actions";
        if (bookingId && action === "review") {
          wrap.append(
            attentionActionButton("confirm", bookingId, "Confirm", false),
            attentionActionButton("reject", bookingId, "Reject", true));
          li.append(wrap);
        } else if (bookingId && action === "arrival") {
          wrap.append(attentionActionButton("done", bookingId, "Done", false));
          li.append(wrap);
        }

        attentionRoot.append(li);
      });
    }

    const roomTypes = snapshot.roomTypes ?? snapshot.RoomTypes ?? [];
    const roomTypesRoot = document.querySelector("[data-dash-widget='room-types']");
    if (roomTypesRoot) {
      const canManage = roomTypesRoot.getAttribute("data-dash-can-manage") === "true";
      roomTypesRoot.replaceChildren();
      const roomGroups = [
        { label: "Open", css: "is-available", match: (s) => s === "Available" },
        { label: "Occupied", css: "is-occupied", match: (s) => s === "Occupied" },
        { label: "Maintaining", css: "is-cleaning", match: (s) => s === "Cleaning" || s === "Unavailable" },
      ];
      roomTypes.forEach(function (t) {
        const li = document.createElement("li");
        const avail = t.availableCount ?? t.AvailableCount ?? 0;
        const total = t.roomCount ?? t.RoomCount ?? 0;
        const occupied = t.occupiedCount ?? t.OccupiedCount ?? 0;
        const name = t.name ?? t.Name ?? "";
        const rooms = t.rooms ?? t.Rooms ?? [];

        const head = document.createElement("div");
        head.className = "dash-roomtype-head";
        const info = document.createElement("div");
        info.className = "dash-roomtype-info";
        const strong = document.createElement("strong");
        strong.textContent = name;
        const span = document.createElement("span");
        span.textContent = `${avail} / ${total} open` + (occupied > 0 ? ` · ${occupied} occupied` : "");
        info.append(strong, span);
        head.append(info);

        if (canManage) {
          const isOpen = avail > 0;
          const occupiedNumbers = rooms
            .filter(function (r) { return (r.status ?? r.Status) === "Occupied"; })
            .map(function (r) { return r.roomNumber ?? r.RoomNumber; });
          const closeBlocked = isOpen && occupiedNumbers.length > 0;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "dash-roomtype-switch" + (isOpen ? " is-on" : "");
          btn.setAttribute("role", "switch");
          btn.setAttribute("aria-checked", isOpen ? "true" : "false");
          btn.setAttribute("aria-label", `${name} — guest booking availability`);
          btn.setAttribute("data-dash-roomtype-id", String(t.roomTypeId ?? t.RoomTypeId ?? 0));
          btn.setAttribute("data-dash-roomtype-name", name);
          if (closeBlocked) {
            btn.disabled = true;
            btn.title = `Cannot close — room(s) ${occupiedNumbers.join(", ")} still have guests inside. Check them out first.`;
          } else {
            btn.title = isOpen
              ? "Stop new bookings for this room type"
              : "Reopen this room type for bookings";
          }
          const track = document.createElement("span");
          track.className = "dash-roomtype-track";
          track.setAttribute("aria-hidden", "true");
          const thumb = document.createElement("span");
          thumb.className = "dash-roomtype-thumb";
          track.append(thumb);
          const state = document.createElement("span");
          state.className = "dash-roomtype-state";
          state.textContent = isOpen ? "Open" : "Closed";
          btn.append(track, state);
          head.append(btn);
        }
        li.append(head);

        const breakdown = document.createElement("div");
        breakdown.className = "dash-roomtype-rooms";
        roomGroups.forEach(function (group) {
          const members = rooms.filter(function (r) {
            return group.match(r.status ?? r.Status ?? "");
          });
          if (!members.length) return;
          const grp = document.createElement("div");
          grp.className = "dash-roomtype-group";
          const label = document.createElement("em");
          label.textContent = group.label;
          const chips = document.createElement("div");
          chips.className = "dash-roomchips";
          members.forEach(function (r) {
            const chip = document.createElement("span");
            chip.className = `dash-roomchip ${group.css}`;
            chip.textContent = r.roomNumber ?? r.RoomNumber ?? "";
            chips.append(chip);
          });
          grp.append(label, chips);
          breakdown.append(grp);
        });
        li.append(breakdown);

        roomTypesRoot.append(li);
      });
    }

    const reviews = snapshot.pendingReviews ?? snapshot.PendingReviews ?? [];
    const reviewsRoot = document.querySelector("[data-dash-widget='reviews']");
    if (reviewsRoot) {
      reviewsRoot.replaceChildren();
      reviews.forEach(function (review) {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = review.href ?? review.Href ?? "/AdminReviews?replyState=pending";
        const reviewId = review.reviewId ?? review.ReviewId ?? 0;
        if (reviewId) {
          link.setAttribute("data-dash-open-review", String(reviewId));
        }
        const strong = document.createElement("strong");
        strong.textContent = review.title ?? review.Title ?? "";
        const span = document.createElement("span");
        span.textContent = review.detail ?? review.Detail ?? "";
        link.append(strong, span);
        li.append(link);
        reviewsRoot.append(li);
      });
    }
    const reviewsCount = document.querySelector("[data-dash-widget='reviews-count']");
    if (reviewsCount) {
      const count = snapshot.pendingReviewCount ?? snapshot.PendingReviewCount ?? reviews.length;
      reviewsCount.textContent = String(count);
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

    renderStayMix(snapshot.stayMix ?? snapshot.StayMix ?? []);
  }

  function attentionActionButton(act, bookingId, label, danger) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.setAttribute("data-dash-attention-act", act);
    btn.setAttribute("data-dash-booking-id", String(bookingId));
    if (danger) btn.classList.add("is-danger");
    return btn;
  }

  /* Inline desk actions: confirm/reject a pending stay, or dismiss a same-day
     arrival. Uses the same API + antiforgery pattern as the bookings page. */
  document
    .querySelector("[data-dash-widget='attention']")
    ?.addEventListener("click", function (event) {
      const btn = event.target.closest("[data-dash-attention-act]");
      if (!btn) return;
      event.preventDefault();

      const act = btn.getAttribute("data-dash-attention-act");
      const id = btn.getAttribute("data-dash-booking-id");
      if (!act || !id) return;

      if (act === "reject" && !window.confirm("Reject this pending booking? The guest’s request will be declined.")) {
        return;
      }

      const token = readAntiForgeryToken();
      const isStatus = act === "confirm" || act === "reject";
      const url = isStatus
        ? `/api/admin/bookings/${encodeURIComponent(id)}/status`
        : `/api/admin/bookings/${encodeURIComponent(id)}/read`;
      const headers = { RequestVerificationToken: token };
      const init = { method: "POST", credentials: "same-origin", headers };
      if (isStatus) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify({
          status: act === "confirm" ? "Confirmed" : "Rejected",
          assignments: []
        });
      }

      const row = btn.closest("li");
      btn.disabled = true;
      fetch(url, init)
        .then(async function (res) {
          if (!res.ok) {
            let message = "Couldn’t update — try again.";
            try {
              const payload = await res.json();
              if (payload && payload.message) message = payload.message;
            } catch (_) { /* keep default message */ }
            throw new Error(message);
          }
          row?.classList.add("is-done");
          void refreshSnapshot();
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.title = err.message;
          btn.classList.add("is-error");
        });
    });

  /* Room-type booking switch — bulk open/close via /api/rooms/types/{id}/open.
     Occupied rooms are skipped server-side and reported back as a stop warning. */
  document
    .querySelector("[data-dash-widget='room-types']")
    ?.addEventListener("click", function (event) {
      const btn = event.target.closest("[data-dash-roomtype-id]");
      if (!btn) return;
      event.preventDefault();

      const id = btn.getAttribute("data-dash-roomtype-id");
      const name = btn.getAttribute("data-dash-roomtype-name") || "Room type";
      const open = btn.getAttribute("aria-checked") !== "true";
      if (!id) return;

      btn.disabled = true;
      fetch(`/api/rooms/types/${encodeURIComponent(id)}/open`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          RequestVerificationToken: readAntiForgeryToken()
        },
        body: JSON.stringify({ open })
      })
        .then(async function (res) {
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(payload.message || "Couldn't update the room type.");
          }
          const blocked = payload.blockedRooms ?? payload.BlockedRooms ?? [];
          const typeName = payload.typeName ?? payload.TypeName ?? name;
          const changed = payload.changedCount ?? payload.ChangedCount ?? 0;
          if (typeof window.showMoriNotice === "function") {
            if (blocked.length > 0) {
              window.showMoriNotice(
                `Stopped: room(s) ${blocked.join(", ")} still have guests inside — check them out first. ${typeName}: ${changed} other room(s) updated.`,
                "error");
            } else {
              window.showMoriNotice(
                open
                  ? `${typeName} is open — ${changed} room(s) bookable again.`
                  : `${typeName} is closed — no longer bookable online.`,
                "success");
            }
          }
          void refreshSnapshot();
        })
        .catch(function (err) {
          btn.disabled = false;
          if (typeof window.showMoriNotice === "function") {
            window.showMoriNotice(err.message || "Couldn't update the room type.", "error");
          }
        });
    });

  /* ---- Detail modal: open a booking or review in place so staff never
     leave the dashboard. Reuses the existing admin APIs + modal chrome. ---- */
  const detailModal = document.querySelector("[data-dash-detail-modal]");
  const detailBody = detailModal?.querySelector("[data-dash-detail-body]");
  const detailActions = detailModal?.querySelector("[data-dash-detail-actions]");
  const detailTitle = detailModal?.querySelector("[data-dash-detail-title]");
  let detailLastFocus = null;

  function openDashDetail(title, kicker, ref) {
    if (!detailModal || !detailBody) return;
    detailLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const kickerEl = detailModal.querySelector("[data-dash-detail-kicker]");
    const refEl = detailModal.querySelector("[data-dash-detail-ref]");
    if (kickerEl) kickerEl.textContent = kicker || "Details";
    if (refEl) refEl.textContent = ref || "";
    if (detailTitle) detailTitle.textContent = title;
    detailBody.innerHTML = '<p class="admin-reviews-empty">Loading…</p>';
    detailActions?.replaceChildren();
    detailModal.hidden = false;
    document.body.classList.add("admin-booking-modal-open");
    detailModal.querySelector("[data-dash-detail-close]")?.focus?.();
  }

  function closeDashDetail() {
    if (!detailModal || detailModal.hidden) return;
    detailModal.hidden = true;
    document.body.classList.remove("admin-booking-modal-open");
    detailLastFocus?.focus?.();
    detailLastFocus = null;
  }

  /* Small stroke-icon set mirroring the bookings modal glyphs. */
  const DASH_ICONS = {
    guest: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20c1.4-3.8 4.2-5.7 7.5-5.7s6.1 1.9 7.5 5.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3h3.6l1.4 4.6-2.3 1.4a12.4 12.4 0 0 0 5.8 5.8l1.4-2.3L21 13.9v3.6a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    checkin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3 12h10m0 0-3-3m3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    checkout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M21 12H11m0 0 3-3m-3 3 3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    rooms: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3 18h18M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    channel: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.7 5.2 3.7 8.5s-1.3 6.2-3.7 8.5c-2.4-2.3-3.7-5.2-3.7-8.5s1.3-6.2 3.7-8.5z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    peso: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h6a4 4 0 0 1 0 8H7zM7 4v16M7 8h8M4.5 8.5H10M4.5 11.5H10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M6.5 15h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 7V6a2 2 0 0 1 2-2h10M15.5 14.5h4.5v3h-4.5a1.5 1.5 0 0 1 0-3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4m0 1h11l-2.5 3.5L17 12H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11V5a1 1 0 0 1 1-1h6l9 9-8 8-8-10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    offer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 5 5 19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="7.5" cy="7.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="16.5" cy="16.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v12H9l-4 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    reply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17l-5-5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12h9a7 7 0 0 1 7 7v1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };

  function dashField(label, value, iconKey) {
    const field = document.createElement("div");
    field.className = "admin-booking-detail-field";
    const term = document.createElement("div");
    term.className = "admin-booking-detail-field-label";
    if (iconKey && DASH_ICONS[iconKey]) {
      const icon = document.createElement("span");
      icon.className = "dash-field-ico";
      icon.innerHTML = DASH_ICONS[iconKey];
      term.append(icon);
    }
    term.append(document.createTextNode(label));
    const val = document.createElement("div");
    val.className = "admin-booking-detail-field-value";
    if (value != null && typeof value === "object" && value.nodeType) {
      val.append(value);
    } else {
      val.textContent = value || "—";
    }
    field.append(term, val);
    return field;
  }

  function dashSection(title, fields) {
    const section = document.createElement("section");
    section.className = "dash-detail-section";
    const heading = document.createElement("h3");
    heading.className = "dash-detail-section-title";
    heading.textContent = title;
    const grid = document.createElement("div");
    grid.className = "admin-booking-detail-grid";
    fields.forEach(function (f) { grid.append(f); });
    section.append(heading, grid);
    return section;
  }

  function dashStars(rating, size) {
    const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    const wrap = document.createElement("span");
    wrap.className = "dash-stars" + (size ? ` is-${size}` : "");
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", `${n} out of 5 stars`);
    for (let i = 1; i <= 5; i++) {
      const star = document.createElement("span");
      star.className = "dash-star" + (i <= n ? " is-on" : "");
      star.textContent = "★";
      wrap.append(star);
    }
    return wrap;
  }

  function dashStatusPill(status) {
    const map = {
      Pending: "is-pending",
      Confirmed: "is-confirmed",
      CheckedIn: "is-occupying",
      Occupying: "is-occupying",
      CheckedOut: "is-checkedout",
      Cancelled: "is-cancelled",
      Rejected: "is-rejected",
      Completed: "is-checkedout",
    };
    const label = String(status || "—");
    const pill = document.createElement("span");
    pill.className = `admin-booking-status ${map[label] || ""}`.trim();
    pill.textContent = label;
    return pill;
  }

  function dashManilaWhen(iso) {
    const d = new Date(iso || "");
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function dashModalFail(text) {
    if (!detailBody) return;
    detailBody.innerHTML = "";
    const p = document.createElement("p");
    p.className = "admin-reviews-empty";
    p.textContent = text;
    detailBody.appendChild(p);
  }

  async function dashFetchJson(url) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message || `Request failed (${response.status})`);
    }
    return response.json();
  }

  async function dashWriteJson(url, method, payload) {
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        RequestVerificationToken: readAntiForgeryToken(),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || `Request failed (${response.status})`);
    }
    return response.json().catch(() => null);
  }

  function bookingRoomSummary(booking) {
    const items = booking?.items || [];
    if (!items.length) return "—";
    return items
      .map(function (item) {
        const doors = (item.assignedRooms || [])
          .map(function (r) { return `#${r.roomNumber ?? r.RoomNumber}`; })
          .join(", ");
        const qty = item.quantity > 1 ? `${item.quantity}× ` : "";
        return `${qty}${item.roomTypeName || "Room"}${doors ? ` (${doors})` : ""}`;
      })
      .join(" · ");
  }

  function bookingNights(booking) {
    const inDate = new Date(booking.checkInAtUtc || "");
    const outDate = new Date(booking.checkoutTimeUtc || "");
    const ms = outDate - inDate;
    if (!Number.isFinite(ms) || ms <= 0) return 0;
    return Math.round(ms / 86400000);
  }

  async function openDashBooking(bookingId, fallbackTitle) {
    openDashDetail(fallbackTitle || "Booking details", "Reservation");
    let booking;
    try {
      booking = await dashFetchJson(`/api/admin/bookings/${bookingId}`);
    } catch (error) {
      dashModalFail(error?.message || "Could not load booking details.");
      return;
    }
    renderDashBooking(booking, null);
    if (detailModal && !detailModal.hidden) {
      try {
        const paySummary = await dashFetchJson(`/api/admin/payments/booking/${bookingId}`);
        renderDashBooking(booking, paySummary);
      } catch (_) {
        /* payment summary is optional — keep the booking view */
      }
    }
  }

  function renderDashBooking(booking, paySummary) {
    if (!detailBody || !booking || !detailModal || detailModal.hidden) return;
    const kickerEl = detailModal.querySelector("[data-dash-detail-kicker]");
    const refEl = detailModal.querySelector("[data-dash-detail-ref]");
    if (kickerEl) kickerEl.textContent = booking.kind === "Reservation" ? "Reservation" : "Booking";
    if (refEl) refEl.textContent = booking.reference || "";
    if (detailTitle) detailTitle.textContent = booking.guestName || "Booking details";
    detailBody.innerHTML = "";
    detailActions?.replaceChildren();

    const nights = bookingNights(booking);
    const guests = (booking.adultCount || 0) + (booking.childCount || 0);
    const paid = paySummary ? paySummary.amountPaid : booking.paidTotal;
    const balance = paySummary ? paySummary.balanceDue : Math.max(0, (booking.totalAmount || 0) - (paid || 0));

    /* Status + balance summary strip — same look as the bookings page modal. */
    const summary = document.createElement("div");
    summary.className = "admin-booking-detail-summary";
    const statusGroup = document.createElement("div");
    statusGroup.className = "admin-booking-status-cell";
    statusGroup.append(dashStatusPill(booking.status));
    if (booking.specialOfferId || booking.cashOnlyPromo) {
      const offerFlag = document.createElement("span");
      offerFlag.className = "admin-booking-status is-special-offer";
      offerFlag.textContent = booking.cashOnlyPromo ? "Special offer · Cash only" : "Special offer";
      offerFlag.title = booking.specialOfferTitle || "Guest booked a special offer";
      statusGroup.append(offerFlag);
    }
    const balanceBlock = document.createElement("div");
    balanceBlock.className = "admin-booking-balance-due" + (balance <= 0 ? " is-paid" : "");
    const balanceLabel = document.createElement("span");
    balanceLabel.textContent = balance <= 0 ? "Fully paid" : "Balance due";
    const balanceValue = document.createElement("strong");
    balanceValue.textContent = money(balance);
    balanceBlock.append(balanceLabel, balanceValue);
    summary.append(statusGroup, balanceBlock);
    detailBody.appendChild(summary);

    detailBody.appendChild(dashSection("Guest", [
      dashField("Guest", booking.guestName, "guest"),
      dashField("Email", booking.guestEmail, "mail"),
      dashField("Phone", booking.guestPhone || "—", "phone"),
    ]));

    detailBody.appendChild(dashSection("Stay", [
      dashField("Check-in", dashManilaWhen(booking.checkInAtUtc), "checkin"),
      dashField("Check-out", dashManilaWhen(booking.checkoutTimeUtc), "checkout"),
      dashField(
        "Length",
        `${nights} night${nights === 1 ? "" : "s"}${guests ? ` · ${guests} guest${guests === 1 ? "" : "s"}` : ""}`,
        "moon"),
      dashField("Rooms", bookingRoomSummary(booking), "rooms"),
      dashField("Channel", String(booking.channel || "—"), "channel"),
      dashField("Type", String(booking.kind || "—"), "tag"),
    ]));

    const paymentFields = [
      dashField("Stay total", money(booking.totalAmount), "peso"),
      dashField("Paid", money(paid), "wallet"),
      dashField("Balance", money(balance), "wallet"),
      dashField("Payment option", String(booking.paymentOption || "—"), "card"),
    ];
    if (booking.specialOfferTitle) {
      paymentFields.push(dashField("Offer", booking.specialOfferTitle, "offer"));
    }
    if (booking.charges?.length) {
      const chargeText = booking.charges
        .map(function (c) { return `${c.label} ${money(c.amount ?? c.total ?? 0)}`; })
        .join(" · ");
      paymentFields.push(dashField("Extra charges", chargeText, "note"));
    }
    detailBody.appendChild(dashSection("Payment", paymentFields));

    if (!detailActions) return;
    if (booking.status === "Pending") {
      const wrap = document.createElement("div");
      wrap.className = "dash-attention-actions";
      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.textContent = "Confirm booking";
      const rejectBtn = document.createElement("button");
      rejectBtn.type = "button";
      rejectBtn.className = "is-danger";
      rejectBtn.textContent = "Reject";
      wrap.append(confirmBtn, rejectBtn);
      detailActions.appendChild(wrap);

      const runStatus = function (status, button) {
        if (button.disabled) return;
        button.disabled = true;
        dashWriteJson(`/api/admin/bookings/${booking.id}/status`, "POST", {
          status,
          assignments: [],
        })
          .then(function () {
            closeDashDetail();
            if (typeof window.showMoriNotice === "function") {
              window.showMoriNotice(
                status === "Confirmed"
                  ? `${booking.reference} confirmed.`
                  : `${booking.reference} rejected.`,
                "success");
            }
            void refreshSnapshot();
          })
          .catch(function (error) {
            button.disabled = false;
            button.classList.add("is-error");
            button.title = error?.message || "Action failed.";
          });
      };
      confirmBtn.addEventListener("click", function () {
        runStatus("Confirmed", confirmBtn);
      });
      rejectBtn.addEventListener("click", function () {
        if (!window.confirm(`Reject booking ${booking.reference}?`)) return;
        runStatus("Rejected", rejectBtn);
      });
    }

    const manage = document.createElement("a");
    manage.className = "dash-detail-manage";
    manage.href = `/AdminBookings?booking=${booking.id}`;
    manage.textContent = "Open full booking view →";
    detailActions.appendChild(manage);
  }

  /* Same heuristic + endpoint as the review-moderation page — comments in
     non-Latin scripts (CJK, Hangul, Cyrillic) get a See translation toggle. */
  function dashNeedsTranslation(value) {
    if (!value || value.length < 8) return false;
    return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7a3\u0400-\u04ff]/u.test(value);
  }

  async function dashFetchTranslation(text) {
    const response = await fetch("/api/guest/reviews/translate", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, targetLang: "en" }),
    });
    if (!response.ok) throw new Error(`Translate failed (${response.status})`);
    const body = await response.json();
    const translated = String(body?.translated || "").trim();
    if (!translated) throw new Error("Empty translation");
    return translated;
  }

  async function dashToggleTranslation(button, originalEl, translatedEl) {
    if (button.getAttribute("data-showing") === "1") {
      translatedEl.hidden = true;
      originalEl.hidden = false;
      button.setAttribute("data-showing", "0");
      button.setAttribute("aria-expanded", "false");
      button.textContent = "See translation";
      return;
    }
    const cached = button.getAttribute("data-translated-text");
    if (cached) {
      translatedEl.textContent = cached;
      translatedEl.hidden = false;
      originalEl.hidden = true;
      button.setAttribute("data-showing", "1");
      button.setAttribute("aria-expanded", "true");
      button.textContent = "Show original";
      return;
    }
    button.disabled = true;
    button.textContent = "Translating…";
    try {
      const text = await dashFetchTranslation(originalEl.textContent || "");
      button.setAttribute("data-translated-text", text);
      translatedEl.textContent = text;
      translatedEl.hidden = false;
      originalEl.hidden = true;
      button.setAttribute("data-showing", "1");
      button.setAttribute("aria-expanded", "true");
      button.textContent = "Show original";
    } catch {
      button.textContent = "Translation unavailable";
      window.setTimeout(function () {
        button.textContent = "See translation";
        button.disabled = false;
      }, 1800);
      return;
    }
    button.disabled = false;
  }

  async function openDashReview(reviewId, fallbackTitle) {
    openDashDetail(fallbackTitle || "Guest review", "Guest review");
    let review;
    try {
      review = await dashFetchJson(`/api/admin/reviews/${reviewId}`);
    } catch (error) {
      dashModalFail(error?.message || "Could not load this review.");
      return;
    }
    if (!detailModal || detailModal.hidden) return;
    const kickerEl = detailModal.querySelector("[data-dash-detail-kicker]");
    const refEl = detailModal.querySelector("[data-dash-detail-ref]");
    if (kickerEl) kickerEl.textContent = "Guest review";
    if (refEl) refEl.textContent = review.bookingReference || "";
    if (detailTitle) detailTitle.textContent = review.guestDisplayName || "Guest review";
    detailBody.innerHTML = "";
    detailActions?.replaceChildren();

    /* Summary strip: visibility pill + overall stars, matching the booking peek. */
    const summary = document.createElement("div");
    summary.className = "admin-booking-detail-summary";
    const statusGroup = document.createElement("div");
    statusGroup.className = "admin-booking-status-cell";
    const visibility = document.createElement("span");
    visibility.className = `admin-booking-status ${review.isPublished ? "is-confirmed" : "is-cancelled"}`;
    visibility.textContent = review.isPublished ? "Published" : "Hidden";
    statusGroup.append(visibility);
    const overall = document.createElement("div");
    overall.className = "admin-booking-balance-due dash-detail-overall";
    const overallLabel = document.createElement("span");
    overallLabel.textContent = "Overall rating";
    overall.append(overallLabel, dashStars(review.overallRating, "lg"));
    summary.append(statusGroup, overall);
    detailBody.appendChild(summary);

    const tiles = document.createElement("div");
    tiles.className = "dash-rating-tiles";
    [
      ["Staff", review.staffRating],
      ["Comfort", review.comfortRating],
      ["Facilities", review.facilitiesRating],
    ].forEach(function ([label, rating]) {
      const tile = document.createElement("div");
      tile.className = "dash-rating-tile";
      const tileLabel = document.createElement("span");
      tileLabel.className = "dash-rating-tile-label";
      tileLabel.textContent = label;
      tile.append(tileLabel, dashStars(rating));
      tiles.append(tile);
    });
    detailBody.appendChild(tiles);

    const detailFields = [
      dashField("Booking", review.bookingReference, "tag"),
      dashField("Posted", dashManilaWhen(review.createdAtUtc), "clock"),
      dashField("Visibility", review.isPublished ? "Published" : "Hidden", "eye"),
    ];
    if (review.tags?.length) {
      detailFields.push(dashField("Tags", review.tags.join(", "), "tag"));
    }
    detailBody.appendChild(dashSection("Details", detailFields));

    const rawComment = String(review.comment || "").trim();
    if (rawComment && dashNeedsTranslation(rawComment)) {
      const wrap = document.createElement("div");
      wrap.className = "admin-reviews-comment-wrap";
      const original = document.createElement("p");
      original.className = "admin-reviews-comment";
      original.textContent = rawComment;
      const translated = document.createElement("p");
      translated.className = "admin-reviews-comment is-translated";
      translated.hidden = true;
      const translateBtn = document.createElement("button");
      translateBtn.type = "button";
      translateBtn.className = "admin-reviews-translate";
      translateBtn.setAttribute("aria-expanded", "false");
      translateBtn.textContent = "See translation";
      translateBtn.addEventListener("click", function () {
        void dashToggleTranslation(translateBtn, original, translated);
      });
      wrap.append(original, translated, translateBtn);
      detailBody.appendChild(wrap);
    } else if (rawComment) {
      const comment = document.createElement("p");
      comment.className = "dash-detail-comment";
      comment.textContent = rawComment;
      detailBody.appendChild(comment);
    }
    if (review.hotelReply) {
      const reply = document.createElement("p");
      reply.className = "dash-detail-reply";
      reply.textContent = `Your reply: ${review.hotelReply}`;
      detailBody.appendChild(reply);
    }

    if (!detailActions) return;
    const replyLabel = document.createElement("span");
    replyLabel.className = "dash-detail-reply-label";
    const replyIcon = document.createElement("span");
    replyIcon.className = "dash-field-ico";
    replyIcon.innerHTML = DASH_ICONS.reply;
    replyLabel.append(replyIcon, document.createTextNode("Hotel reply"));
    detailActions.appendChild(replyLabel);
    const replyBox = document.createElement("textarea");
    replyBox.className = "dash-detail-reply-input";
    replyBox.rows = 3;
    replyBox.placeholder = "Reply to this guest…";
    replyBox.value = review.hotelReply || "";
    detailActions.appendChild(replyBox);

    const actionRow = document.createElement("div");
    actionRow.className = "dash-attention-actions";

    const replyBtn = document.createElement("button");
    replyBtn.type = "button";
    replyBtn.textContent = review.hotelReply ? "Update reply" : "Send reply";
    replyBtn.addEventListener("click", function () {
      const text = replyBox.value.trim();
      if (!text) {
        replyBox.focus();
        return;
      }
      replyBtn.disabled = true;
      dashWriteJson(`/api/admin/reviews/${review.id}/reply`, "PUT", { reply: text })
        .then(function () {
          if (typeof window.showMoriNotice === "function") {
            window.showMoriNotice("Reply posted.", "success");
          }
          closeDashDetail();
          void refreshSnapshot();
        })
        .catch(function (error) {
          replyBtn.disabled = false;
          replyBtn.classList.add("is-error");
          replyBtn.title = error?.message || "Reply failed.";
        });
    });
    actionRow.appendChild(replyBtn);

    const publishBtn = document.createElement("button");
    publishBtn.type = "button";
    publishBtn.className = "is-quiet";
    publishBtn.textContent = review.isPublished ? "Unpublish" : "Publish";
    publishBtn.addEventListener("click", function () {
      publishBtn.disabled = true;
      dashWriteJson(`/api/admin/reviews/${review.id}/publish`, "PUT", {
        isPublished: !review.isPublished,
      })
        .then(function () {
          review.isPublished = !review.isPublished;
          publishBtn.disabled = false;
          publishBtn.textContent = review.isPublished ? "Unpublish" : "Publish";
          if (typeof window.showMoriNotice === "function") {
            window.showMoriNotice(
              review.isPublished ? "Review is now public." : "Review hidden.",
              "success");
          }
          void refreshSnapshot();
        })
        .catch(function (error) {
          publishBtn.disabled = false;
          publishBtn.title = error?.message || "Couldn't update visibility.";
        });
    });
    actionRow.appendChild(publishBtn);
    detailActions.appendChild(actionRow);

    const manage = document.createElement("a");
    manage.className = "dash-detail-manage";
    manage.href = "/AdminReviews?replyState=pending";
    manage.textContent = "Open review moderation →";
    detailActions.appendChild(manage);
  }

  detailModal?.addEventListener("click", function (event) {
    if (event.target.closest("[data-dash-detail-close]")) closeDashDetail();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeDashDetail();
      closeDashOfferModal();
    }
  });

  document
    .querySelector("[data-dash-widget='attention']")
    ?.addEventListener("click", function (event) {
      const link = event.target.closest("a[data-dash-open-booking]");
      if (!link) return;
      event.preventDefault();
      const bookingId = Number(link.getAttribute("data-dash-open-booking"));
      if (bookingId) {
        void openDashBooking(bookingId, link.querySelector("strong")?.textContent);
      }
    });

  document
    .querySelector("[data-dash-widget='reviews']")
    ?.addEventListener("click", function (event) {
      const link = event.target.closest("a[data-dash-open-review]");
      if (!link) return;
      event.preventDefault();
      const reviewId = Number(link.getAttribute("data-dash-open-review"));
      if (reviewId) {
        void openDashReview(reviewId, link.querySelector("strong")?.textContent);
      }
    });

  /* ---- Special offers: one row per campaign + activate/deactivate ---- */
  const offersRoot = document.querySelector("[data-dash-widget='offers']");
  const offerModal = document.querySelector("[data-dash-offer-modal]");
  const offerStartInput = offerModal?.querySelector("[data-dash-offer-start]");
  const offerEndInput = offerModal?.querySelector("[data-dash-offer-end]");
  const offerError = offerModal?.querySelector("[data-dash-offer-error]");
  const offerLede = offerModal?.querySelector("[data-dash-offer-lede]");
  const offerEditLink = offerModal?.querySelector("[data-dash-offer-edit]");
  const offerActivateBtn = offerModal?.querySelector("[data-dash-offer-activate]");
  const offersCanManage = offersRoot?.getAttribute("data-dash-can-manage") === "true";

  let dashOffers = [];
  let dashOfferTarget = null;

  const DASH_OFFER_KINDS = {
    LimitedTime: "Limited time",
    StayLongerSaveMore: "Stay longer, save more",
    GoogleLoyalty: "Loyalty Coupon",
  };

  function dashManilaDateTimeLocal(date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date || new Date());
    const get = function (t) {
      return parts.find(function (p) { return p.type === t; })?.value || "00";
    };
    const hour = get("hour") === "24" ? "00" : get("hour");
    return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
  }

  function dashManilaToUtcIso(value) {
    const parts = String(value || "").split("T");
    const dmy = (parts[0] || "").split("-").map(Number);
    const hm = (parts[1] || "").split(":").map(Number);
    const nums = dmy.concat(hm);
    if (nums.length < 5 || nums.some(function (n) { return !Number.isFinite(n); })) {
      throw new Error("Invalid date/time value.");
    }
    // Manila is UTC+8 with no DST — wall time minus 8h is UTC.
    return new Date(Date.UTC(nums[0], nums[1] - 1, nums[2], nums[3] - 8, nums[4])).toISOString();
  }

  /* One logical offer spans a row per room type — collapse siblings into a
     campaign, matching the special-offers page grouping. */
  function dashOfferGroups(rows) {
    const map = new Map();
    (rows || []).forEach(function (o) {
      const key = `${o.title}|${o.kind}|${o.startsAtUtc}|${o.endsAtUtc}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(o);
    });
    const groups = Array.from(map.values()).map(function (sibs) {
      sibs.sort(function (a, b) { return a.id - b.id; });
      const primary = sibs[0];
      const endMs = Date.parse(primary.endsAtUtc);
      const startMs = Date.parse(primary.startsAtUtc);
      return {
        primary,
        ids: sibs.map(function (s) { return s.id; }),
        roomTypes: Array.from(new Set(sibs.map(function (s) { return s.roomTypeName; }))),
        isActive: sibs.some(function (s) { return s.isActive; }),
        isCurrentlyActive: sibs.some(function (s) { return s.isCurrentlyActive; }),
        ended: !Number.isNaN(endMs) && endMs < Date.now(),
        startsInFuture: !Number.isNaN(startMs) && startMs > Date.now(),
      };
    });
    const rank = function (g) {
      return g.isCurrentlyActive ? 0 : g.isActive ? 1 : 2;
    };
    groups.sort(function (a, b) { return rank(a) - rank(b); });
    return groups;
  }

  function dashOfferStatus(group) {
    if (group.isCurrentlyActive) return { key: "live", label: "Live" };
    if (group.isActive && group.startsInFuture) return { key: "scheduled", label: "Scheduled" };
    return { key: "off", label: "Off" };
  }

  function dashOfferWindow(group) {
    const startMs = Date.parse(group.primary.startsAtUtc);
    const endMs = Date.parse(group.primary.endsAtUtc);
    if (Number.isNaN(startMs) || startMs < 946684800000) return "No dates set";
    const start = dashManilaWhen(group.primary.startsAtUtc);
    const end = group.primary.openEnded || Number.isNaN(endMs)
      ? "until deactivated"
      : dashManilaWhen(group.primary.endsAtUtc);
    return `${start} → ${end}`;
  }

  function renderDashOffers() {
    if (!offersRoot) return;
    offersRoot.replaceChildren();
    const groups = dashOfferGroups(dashOffers);
    if (!groups.length) {
      const empty = document.createElement("li");
      empty.className = "dash-offer-empty";
      empty.textContent = "No special offers yet.";
      offersRoot.appendChild(empty);
      return;
    }
    groups.forEach(function (group) {
      const status = dashOfferStatus(group);
      const li = document.createElement("li");
      li.className = "dash-offer";

      const info = document.createElement("div");
      info.className = "dash-offer-info";
      const title = document.createElement("strong");
      const kind = DASH_OFFER_KINDS[group.primary.kind] || group.primary.kind;
      title.textContent = group.primary.title && group.primary.title !== kind
        ? `${kind} · ${group.primary.title}`
        : kind;
      const meta = document.createElement("span");
      meta.textContent = `${group.roomTypes.join(", ")} · ${dashOfferWindow(group)}`;
      info.append(title, meta);

      const pill = document.createElement("span");
      pill.className = `dash-offer-pill is-${status.key}`;
      pill.textContent = status.label;

      li.append(info, pill);

      if (offersCanManage) {
        const btn = document.createElement("button");
        btn.type = "button";
        if (group.isActive && !group.ended) {
          btn.className = "is-quiet";
          btn.textContent = "Deactivate";
          btn.setAttribute("data-dash-offer-deactivate", String(group.primary.id));
        } else {
          btn.textContent = "Activate";
          btn.setAttribute("data-dash-offer-activate", String(group.primary.id));
        }
        li.append(btn);
      }

      offersRoot.appendChild(li);
    });
  }

  async function loadDashOffers() {
    if (!offersRoot) return;
    try {
      dashOffers = await dashFetchJson("/api/special-offers");
    } catch (_) {
      offersRoot.innerHTML = '<li class="dash-offer-empty">Couldn’t load offers.</li>';
      return;
    }
    renderDashOffers();
  }

  function dashOfferFail(text) {
    if (!offerError) return;
    offerError.textContent = text;
    offerError.hidden = false;
  }

  function openDashOfferModal(group) {
    if (!offerModal) return;
    dashOfferTarget = group;
    const kind = DASH_OFFER_KINDS[group.primary.kind] || group.primary.kind;
    if (offerLede) {
      offerLede.textContent = `Choose a new start and end for ${kind} (Manila time). Previous dates are cleared.`;
    }
    const nowLocal = dashManilaDateTimeLocal();
    if (offerStartInput) {
      offerStartInput.min = nowLocal;
      offerStartInput.value = "";
    }
    if (offerEndInput) {
      offerEndInput.min = nowLocal;
      offerEndInput.value = "";
    }
    if (offerError) offerError.hidden = true;
    if (offerEditLink) offerEditLink.href = `/AdminSpecialOffers/Edit/${group.primary.id}`;
    offerModal.hidden = false;
    document.body.classList.add("admin-booking-modal-open");
    offerStartInput?.focus?.();
  }

  function closeDashOfferModal() {
    if (!offerModal || offerModal.hidden) return;
    offerModal.hidden = true;
    document.body.classList.remove("admin-booking-modal-open");
    dashOfferTarget = null;
  }

  offerModal?.addEventListener("click", function (event) {
    if (event.target.closest("[data-dash-offer-close]")) closeDashOfferModal();
  });

  offerStartInput?.addEventListener("change", function () {
    if (!offerEndInput || !offerStartInput.value) return;
    const nowLocal = dashManilaDateTimeLocal();
    offerEndInput.min = offerStartInput.value > nowLocal ? offerStartInput.value : nowLocal;
  });

  offerActivateBtn?.addEventListener("click", function () {
    const group = dashOfferTarget;
    if (!group || offerActivateBtn.disabled) return;
    const start = offerStartInput?.value || "";
    const end = offerEndInput?.value || "";
    const nowLocal = dashManilaDateTimeLocal();

    if (!start || !end) {
      dashOfferFail("Choose both start and end times (Manila).");
      return;
    }
    if (start < nowLocal) {
      dashOfferFail("Start cannot be in the past (Manila time).");
      return;
    }
    if (end < nowLocal || end <= start) {
      dashOfferFail("End must be after the start.");
      return;
    }
    const kind = group.primary.kind;
    const liveSameKind = dashOffers.some(function (o) {
      return !group.ids.includes(o.id)
        && o.kind === kind
        && o.isActive
        && o.isCurrentlyActive;
    });
    if (liveSameKind) {
      dashOfferFail(
        `Another ${DASH_OFFER_KINDS[kind] || kind} offer is currently live. Deactivate it first, then activate this one.`,
      );
      return;
    }

    offerActivateBtn.disabled = true;
    if (offerError) offerError.hidden = true;
    let startIso;
    let endIso;
    try {
      startIso = dashManilaToUtcIso(start);
      endIso = dashManilaToUtcIso(end);
    } catch (error) {
      offerActivateBtn.disabled = false;
      dashOfferFail(error?.message || "Invalid date/time value.");
      return;
    }
    dashWriteJson(
      `/api/special-offers/${group.primary.id}/reactivate`,
      "POST",
      { startsAtUtc: startIso, endsAtUtc: endIso },
    )
      .then(function () {
        closeDashOfferModal();
        if (typeof window.showMoriNotice === "function") {
          window.showMoriNotice(
            "Offer activated — it goes live at the selected Manila start time.",
            "success");
        }
        void loadDashOffers();
        void refreshSnapshot();
      })
      .catch(function (error) {
        offerActivateBtn.disabled = false;
        dashOfferFail(error?.message || "Unable to activate this offer.");
      });
  });

  offersRoot?.addEventListener("click", function (event) {
    const activateBtn = event.target.closest("[data-dash-offer-activate]");
    if (activateBtn) {
      const id = Number(activateBtn.getAttribute("data-dash-offer-activate"));
      const group = dashOfferGroups(dashOffers).find(function (g) {
        return g.ids.includes(id);
      });
      if (group) openDashOfferModal(group);
      return;
    }

    const deactivateBtn = event.target.closest("[data-dash-offer-deactivate]");
    if (!deactivateBtn || deactivateBtn.disabled) return;
    const id = Number(deactivateBtn.getAttribute("data-dash-offer-deactivate"));
    if (!id) return;
    if (!window.confirm("Deactivate this offer? Guests will stop seeing it immediately.")) {
      return;
    }
    deactivateBtn.disabled = true;
    fetch(`/api/special-offers/${id}/deactivate`, {
      method: "POST",
      credentials: "same-origin",
      headers: { RequestVerificationToken: readAntiForgeryToken() },
    })
      .then(async function (res) {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.message || "Couldn't deactivate the offer.");
        }
        if (typeof window.showMoriNotice === "function") {
          window.showMoriNotice("Offer deactivated.", "success");
        }
        void loadDashOffers();
        void refreshSnapshot();
      })
      .catch(function (error) {
        deactivateBtn.disabled = false;
        if (typeof window.showMoriNotice === "function") {
          window.showMoriNotice(error?.message || "Couldn't deactivate the offer.", "error");
        }
      });
  });

  void loadDashOffers();

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
      void loadDashOffers();
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
