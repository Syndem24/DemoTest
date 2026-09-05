(() => {
  const root = document.querySelector('[data-admin-notification]');
  if (!root) return;

  const token = document.querySelector(
    '#adminAntiForgery input[name="__RequestVerificationToken"]'
  )?.value || '';
  const bell = root.querySelector('[data-notification-toggle]');
  const badge = root.querySelector('[data-notification-badge]');
  const panel = root.querySelector('[data-notification-panel]');
  const notificationItems = root.querySelector('[data-notification-items]');
  const soundButton = root.querySelector('[data-notification-sound]');
  const clearButton = root.querySelector('[data-notification-clear]');

  let pollTimer = 0;
  let audioContext = null;
  let audioUnlocked = false;
  let soundEnabled = localStorage.getItem('moriBookingSound') !== 'off';

  async function apiFetch(url, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {}),
    };
    if (options.method && options.method !== 'GET') {
      headers.RequestVerificationToken = token;
    }
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const validationMessage = payload.errors
        ? Object.values(payload.errors).flat().join(' ')
        : '';
      throw new Error(payload.message || validationMessage || `Request failed (${response.status}).`);
    }
    return payload;
  }

  function setSoundLabel() {
    if (!soundButton) return;
    soundButton.textContent = soundEnabled ? 'Sound on' : 'Sound off';
    soundButton.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
  }

  function unlockAudio() {
    if (audioUnlocked || !soundEnabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioContext ||= new AudioContext();
    audioContext.resume().then(() => {
      audioUnlocked = audioContext.state === 'running';
    }).catch(() => {});
  }

  function playChime() {
    if (!soundEnabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioContext ||= new AudioContext();

    const emit = () => {
      if (!audioContext) return;
      const now = audioContext.currentTime;
      [660, 880].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + index * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.13, now + index * 0.09 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.09 + 0.22);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(now + index * 0.09);
        oscillator.stop(now + index * 0.09 + 0.24);
      });
    };

    if (audioContext.state !== 'running') {
      audioContext.resume()
        .then(() => {
          audioUnlocked = audioContext?.state === 'running';
          if (audioUnlocked) emit();
        })
        .catch(() => {});
      return;
    }

    audioUnlocked = true;
    emit();
  }

  function showOfferEndingSoonAlert(notification) {
    const mins = Math.max(1, Number(notification?.minutesRemaining || 0));
    const title = String(notification?.title || 'Special offer');
    const rooms = Array.isArray(notification?.roomTypes) ? notification.roomTypes.filter(Boolean).join(', ') : '';
    const message = `${title} ends in about ${mins} minute${mins === 1 ? '' : 's'}${rooms ? ` (${rooms})` : ''}.`;
    const host = document.body;
    if (!host) return;
    const alert = document.createElement('div');
    alert.className = 'admin-live-alert is-warning';
    alert.textContent = message;
    host.append(alert);
    window.setTimeout(() => {
      alert.classList.add('is-leaving');
      window.setTimeout(() => alert.remove(), 250);
    }, 10000);
  }

  function setBadge(unread) {
    if (!badge) return;
    const count = Math.max(0, Number(unread || 0));
    badge.hidden = count === 0;
    badge.textContent = count > 99 ? '99+' : String(count);
    bell?.setAttribute(
      'aria-label',
      count ? `Open ${count} unread booking notifications` : 'Open booking notifications'
    );
  }

  function parseUtc(value) {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const raw = String(value).trim();
    if (!raw) return null;
    const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
    const iso = hasZone || !/T/.test(raw) ? raw : `${raw}Z`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDateTime(value) {
    const date = parseUtc(value);
    if (!date) return '';
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  function displayEnum(value) {
    if (value === 'CheckedOut') return 'Checked out';
    if (typeof value === 'string') return value;
    return String(value ?? '');
  }

  function notificationNode(item) {
    const itemContainer = document.createElement('div');
    itemContainer.className = `admin-notification-item${item.isRead ? '' : ' is-unread'}`;

    const contentBtn = document.createElement('button');
    contentBtn.type = 'button';
    contentBtn.className = 'admin-notification-content';

    const title = document.createElement('strong');
    title.textContent = `${item.reference} · ${item.guestName}`;
    const meta = document.createElement('span');
    meta.textContent = `${displayEnum(item.kind)} · ${formatDateTime(item.checkInAtUtc || item.checkIn)}`;
    const time = document.createElement('small');
    time.textContent = formatDateTime(item.createdAtUtc);
    contentBtn.append(title, meta, time);

    if (item.message) {
      const msg = document.createElement('div');
      const isAlert = /warning|arrival|call guest|checkout|auto-cancelled/i.test(item.message);
      msg.className = `admin-notification-msg ${isAlert ? 'is-warning' : 'is-info'}`;
      msg.textContent = item.message;
      contentBtn.append(msg);
    }

    contentBtn.addEventListener('click', () => {
      if (panel) {
        panel.hidden = true;
        bell?.setAttribute('aria-expanded', 'false');
      }

      const message = String(item.message || '');
      if (/call guest: checkout|checkout in 20/i.test(message)) {
        window.location.assign('/AdminBookings?checkouts=soon');
        return;
      }
      if (/call guest/i.test(message)) {
        window.location.assign('/AdminBookings?pendingCalls=soon');
        return;
      }
      if (/arrival/i.test(message)) {
        window.location.assign('/AdminBookings?arrivals=soon');
        return;
      }

      try {
        sessionStorage.setItem(
          'moriOpenBooking',
          JSON.stringify({
            id: item.id,
            reference: item.reference,
            guestName: item.guestName,
          })
        );
      } catch {
        // Ignore quota / private-mode failures; URL handoff still works.
      }
      // Navigate immediately — Bookings page opens skeleton modal on boot.
      window.location.assign(`/AdminBookings?booking=${item.id}`);
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'admin-notification-dismiss';
    dismissBtn.setAttribute('aria-label', 'Clear notification');
    dismissBtn.title = 'Clear notification';
    dismissBtn.innerHTML = '&times;';
    dismissBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissBtn.disabled = true;
      try {
        await apiFetch(`/api/admin/bookings/${item.id}/read`, { method: 'POST' });
        itemContainer.remove();
        if (notificationItems && !notificationItems.querySelector('.admin-notification-item')) {
          notificationItems.replaceChildren();
          const empty = document.createElement('p');
          empty.className = 'admin-notification-empty';
          empty.textContent = 'No new notifications.';
          notificationItems.append(empty);
          setBadge(0);
        } else {
          const remaining = notificationItems?.querySelectorAll('.admin-notification-item.is-unread').length
            ?? notificationItems?.querySelectorAll('.admin-notification-item').length
            ?? 0;
          setBadge(remaining);
        }
      } catch (error) {
        dismissBtn.disabled = false;
        console.error('Failed to clear notification:', error);
        window.alert(error instanceof Error ? error.message : 'Could not clear this notification.');
      }
    });

    itemContainer.append(contentBtn, dismissBtn);
    return itemContainer;
  }

  function renderNotificationsSkeleton(count = 4) {
    if (!notificationItems) return;
    notificationItems.replaceChildren();
    for (let i = 0; i < count; i += 1) {
      const item = document.createElement('div');
      item.className = 'admin-skel-notification';
      item.setAttribute('aria-hidden', 'true');
      item.innerHTML =
        '<span class="admin-skel admin-skel-line is-lg"></span>'
        + '<span class="admin-skel admin-skel-line is-meta"></span>'
        + '<span class="admin-skel admin-skel-line is-time is-sm"></span>';
      notificationItems.append(item);
    }
  }

  async function refreshNotifications() {
    if (notificationItems && !notificationItems.querySelector('.admin-notification-item')) {
      renderNotificationsSkeleton();
    }
    try {
      const payload = await apiFetch('/api/admin/bookings/notifications?limit=10');
      setBadge(payload.unread);
      if (!notificationItems) return;
      notificationItems.replaceChildren();
      if (!payload.items?.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-notification-empty';
        empty.textContent = 'No new notifications.';
        notificationItems.append(empty);
        return;
      }
      payload.items.forEach((item) => notificationItems.append(notificationNode(item)));
    } catch (error) {
      if (notificationItems) {
        notificationItems.textContent = error instanceof Error ? error.message : 'Unable to load notifications.';
      }
    }
  }

  function beginPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(() => {
      void refreshNotifications();
    }, 30000);
  }

  function stopPolling() {
    if (!pollTimer) return;
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }

  function wireRealtime() {
    const scheduleRefresh = () => {
      if (window.MoriAdminRealtime) {
        window.MoriAdminRealtime.scheduleRefresh('notifications', () => refreshNotifications());
      } else {
        void refreshNotifications();
      }
    };

    if (window.MoriAdminRealtime) {
      window.MoriAdminRealtime.onBooking((eventName, payload) => {
        if (eventName === 'OfferEndingSoon') {
          playChime();
          showOfferEndingSoonAlert(payload);
        } else if (eventName === 'BookingCreated') {
          playChime();
        } else if (eventName === 'BookingUpdated' && payload?.message) {
          playChime();
        }
        scheduleRefresh();
      });

      window.addEventListener('mori:admin-refresh', (event) => {
        const scopes = event.detail?.scopes || [];
        if (scopes.includes('all') || scopes.includes('notifications')) {
          scheduleRefresh();
        }
      });
    } else {
      beginPolling();
    }
  }

  document.addEventListener('pointerdown', unlockAudio, { once: true });
  document.addEventListener('keydown', unlockAudio, { once: true });
  setSoundLabel();

  soundButton?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('moriBookingSound', soundEnabled ? 'on' : 'off');
    setSoundLabel();
    if (soundEnabled) unlockAudio();
  });

  clearButton?.addEventListener('click', async () => {
    if (clearButton.disabled) return;
    clearButton.disabled = true;
    const previousLabel = clearButton.textContent;
    clearButton.textContent = 'Clearing…';
    try {
      await apiFetch('/api/admin/bookings/notifications/read-all', { method: 'POST' });
      setBadge(0);
      if (notificationItems) {
        notificationItems.replaceChildren();
        const empty = document.createElement('p');
        empty.className = 'admin-notification-empty';
        empty.textContent = 'No new notifications.';
        notificationItems.append(empty);
      }
    } catch (error) {
      console.error('Failed to clear notifications:', error);
      window.alert(error instanceof Error ? error.message : 'Could not clear notifications.');
      await refreshNotifications();
    } finally {
      clearButton.disabled = false;
      clearButton.textContent = previousLabel || 'Clear all';
    }
  });

  bell?.addEventListener('click', () => {
    const open = panel?.hidden ?? true;
    if (panel) panel.hidden = !open;
    bell.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.addEventListener('click', (event) => {
    if (!panel || panel.hidden || root.contains(event.target)) return;
    panel.hidden = true;
    bell?.setAttribute('aria-expanded', 'false');
  });

  window.addEventListener('beforeunload', () => {
    if (pollTimer) window.clearInterval(pollTimer);
  });

  void refreshNotifications();
  wireRealtime();
})();
