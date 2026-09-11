/**
 * Shared stay/date/money helpers for guest booking UI, accommodations wizard, and walk-in.
 * Load before booking-ui.js / accommodation-wizard.js / walk-in.js.
 */
(() => {
  const EXTRA_PERSON_FEE_PER_NIGHT = 200;
  const INCLUDED_GUESTS_PER_ROOM = 2;
  const MS_PER_DAY = 86400000;

  function parseYmdToUtc(ymd) {
    if (!ymd) return null;
    const [y, m, d] = String(ymd).split('-').map(Number);
    if (!y || !m || !d) return null;
    return Date.UTC(y, m - 1, d);
  }

  function nightsBetween(checkInYmd, checkOutYmd) {
    const start = parseYmdToUtc(checkInYmd);
    const end = parseYmdToUtc(checkOutYmd);
    if (start == null || end == null) return 0;
    return Math.max(0, Math.round((end - start) / MS_PER_DAY));
  }

  /** Local noon parse — matches prior booking-ui nightCount behavior. */
  function nightCount(checkIn, checkOut) {
    if (!checkIn || !checkOut) return 0;
    const start = new Date(`${checkIn}T12:00:00`);
    const end = new Date(`${checkOut}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY));
  }

  function formatSoldOutDateLabel(isoDate) {
    if (!isoDate) return '';
    const parts = String(isoDate).split('-').map(Number);
    if (parts.length < 3) return isoDate;
    const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function formatMoneyPhp(amount) {
    return `₱${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  }

  function extraPersonCount(guests, included = INCLUDED_GUESTS_PER_ROOM) {
    return Math.max(0, Number(guests || 0) - Number(included || 0));
  }

  function extraPersonFee(guests, nights, feePerNight = EXTRA_PERSON_FEE_PER_NIGHT, included = INCLUDED_GUESTS_PER_ROOM) {
    return extraPersonCount(guests, included) * Number(feePerNight || 0) * Math.max(0, Number(nights || 0));
  }

  window.MoriStayMath = {
    EXTRA_PERSON_FEE_PER_NIGHT,
    INCLUDED_GUESTS_PER_ROOM,
    parseYmdToUtc,
    nightsBetween,
    nightCount,
    formatSoldOutDateLabel,
    formatMoneyPhp,
    extraPersonCount,
    extraPersonFee,
  };
})();
