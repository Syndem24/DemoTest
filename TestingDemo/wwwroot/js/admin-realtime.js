/**
 * Shared SignalR layer for admin staff pages.
 * Pushes live updates without full page reloads; pages subscribe via custom events or callbacks.
 */
(function () {
  'use strict';

  if (window.MoriAdminRealtime) return;

  const BOOKING_EVENTS = new Set([
    'BookingCreated',
    'BookingUpdated',
    'BookingArchived',
    'PaymentChanged',
    'OfferEndingSoon',
  ]);

  const scopesByBookingEvent = {
    BookingCreated: ['bookings', 'dashboard', 'audit', 'notifications'],
    BookingUpdated: ['bookings', 'dashboard', 'payments', 'audit', 'notifications'],
    BookingArchived: ['bookings', 'dashboard', 'audit', 'notifications'],
    PaymentChanged: ['bookings', 'payments', 'dashboard', 'audit', 'notifications'],
    OfferEndingSoon: ['notifications', 'offers'],
  };

  const scopesByCatalogReason = {
    rooms: ['rooms', 'dashboard'],
    offers: ['offers', 'dashboard'],
    updated: ['rooms', 'offers', 'dashboard'],
  };

  const bookingHandlers = [];
  const catalogHandlers = [];
  const refreshTimers = new Map();

  let bookingConnection = null;
  let catalogConnection = null;
  let pollTimer = 0;
  let reconnectTimer = 0;
  let started = false;

  function dispatchRefresh(scopes, source, payload) {
    const unique = Array.from(new Set(scopes));
    window.dispatchEvent(
      new CustomEvent('mori:admin-refresh', {
        detail: { scopes: unique, source, payload },
      }),
    );
  }

  function scheduleRefresh(scope, fn, delayMs) {
    const wait = delayMs ?? 350;
    if (refreshTimers.has(scope)) {
      window.clearTimeout(refreshTimers.get(scope));
    }
    const timer = window.setTimeout(() => {
      refreshTimers.delete(scope);
      void fn();
    }, wait);
    refreshTimers.set(scope, timer);
  }

  function beginPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(() => {
      dispatchRefresh(['all'], 'poll');
    }, 45000);
  }

  function stopPolling() {
    if (!pollTimer) return;
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }

  async function connectBookingHub() {
    if (!window.signalR) {
      beginPolling();
      return null;
    }

    const connection = new window.signalR.HubConnectionBuilder()
      .withUrl('/hubs/bookings')
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(window.signalR.LogLevel.Warning)
      .build();

    connection.on('BookingCreated', (payload) => {
      dispatchRefresh(scopesByBookingEvent.BookingCreated, 'BookingCreated', payload);
      bookingHandlers.forEach((fn) => {
        try {
          fn('BookingCreated', payload);
        } catch (err) {
          console.error('MoriAdminRealtime booking handler failed:', err);
        }
      });
    });
    connection.on('BookingUpdated', (payload) => {
      dispatchRefresh(scopesByBookingEvent.BookingUpdated, 'BookingUpdated', payload);
      bookingHandlers.forEach((fn) => {
        try {
          fn('BookingUpdated', payload);
        } catch (err) {
          console.error('MoriAdminRealtime booking handler failed:', err);
        }
      });
    });
    connection.on('BookingArchived', (payload) => {
      dispatchRefresh(scopesByBookingEvent.BookingArchived, 'BookingArchived', payload);
      bookingHandlers.forEach((fn) => {
        try {
          fn('BookingArchived', payload);
        } catch (err) {
          console.error('MoriAdminRealtime booking handler failed:', err);
        }
      });
    });
    connection.on('PaymentChanged', (payload) => {
      dispatchRefresh(scopesByBookingEvent.PaymentChanged, 'PaymentChanged', payload);
      bookingHandlers.forEach((fn) => {
        try {
          fn('PaymentChanged', payload);
        } catch (err) {
          console.error('MoriAdminRealtime booking handler failed:', err);
        }
      });
    });
    connection.on('OfferEndingSoon', (payload) => {
      dispatchRefresh(scopesByBookingEvent.OfferEndingSoon, 'OfferEndingSoon', payload);
      bookingHandlers.forEach((fn) => {
        try {
          fn('OfferEndingSoon', payload);
        } catch (err) {
          console.error('MoriAdminRealtime booking handler failed:', err);
        }
      });
    });
    connection.on('AuditLogChanged', () => {
      dispatchRefresh(['audit'], 'AuditLogChanged');
      bookingHandlers.forEach((fn) => {
        try {
          fn('AuditLogChanged', null);
        } catch (err) {
          console.error('MoriAdminRealtime booking handler failed:', err);
        }
      });
    });

    connection.onreconnecting(beginPolling);
    connection.onreconnected(() => {
      stopPolling();
      dispatchRefresh(['all'], 'reconnected');
    });
    connection.onclose(() => {
      beginPolling();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(() => {
        void connectBookingHub();
      }, 10000);
    });

    try {
      await connection.start();
      stopPolling();
      bookingConnection = connection;
      return connection;
    } catch {
      beginPolling();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(() => {
        void connectBookingHub();
      }, 10000);
      return null;
    }
  }

  async function connectCatalogHub() {
    if (!window.signalR) return null;

    const connection = new window.signalR.HubConnectionBuilder()
      .withUrl('/hubs/guest-catalog')
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(window.signalR.LogLevel.Warning)
      .build();

    connection.on('GuestCatalogChanged', (reason) => {
      const key = String(reason || 'updated').toLowerCase();
      const scopes = scopesByCatalogReason[key] || scopesByCatalogReason.updated;
      dispatchRefresh(scopes, 'GuestCatalogChanged', reason);
      catalogHandlers.forEach((fn) => {
        try {
          fn(reason);
        } catch (err) {
          console.error('MoriAdminRealtime catalog handler failed:', err);
        }
      });
    });

    try {
      await connection.start();
      catalogConnection = connection;
      return connection;
    } catch {
      return null;
    }
  }

  async function start() {
    if (started) return;
    started = true;
    await connectBookingHub();
    await connectCatalogHub();
  }

  window.MoriAdminRealtime = {
    start,
    onBooking(handler) {
      if (typeof handler === 'function') bookingHandlers.push(handler);
    },
    onCatalog(handler) {
      if (typeof handler === 'function') catalogHandlers.push(handler);
    },
    scheduleRefresh,
    dispatchRefresh,
    getBookingConnection() {
      return bookingConnection;
    },
    getCatalogConnection() {
      return catalogConnection;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void start());
  } else {
    void start();
  }
})();
