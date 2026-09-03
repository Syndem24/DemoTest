/**
 * Mori input filters — block wrong characters as the user types.
 * Mark fields with data-mori-filter="phone|email|person-name|username|login-id|decimal|integer|otp"
 * or rely on type / name / id / autocomplete heuristics.
 */
(function () {
  'use strict';

  var FILTERS = {
    phone: function (value) {
      var out = '';
      for (var i = 0; i < value.length; i++) {
        var ch = value.charAt(i);
        if (ch === '+' && out.length === 0) {
          out += ch;
          continue;
        }
        if (/[\d\s\-().]/.test(ch)) out += ch;
      }
      return out.slice(0, 40);
    },
    email: function (value) {
      return String(value || '')
        .replace(/\s+/g, '')
        .replace(/[^a-zA-Z0-9.@_+%-]/g, '')
        .slice(0, 254);
    },
    'person-name': function (value) {
      try {
        return String(value || '')
          .replace(/[^\p{L}\p{M}\s'.\-]/gu, '')
          .replace(/\s{2,}/g, ' ')
          .slice(0, 120);
      } catch (_) {
        return String(value || '')
          .replace(/[^a-zA-ZÀ-ÿ\s'.\-]/g, '')
          .replace(/\s{2,}/g, ' ')
          .slice(0, 120);
      }
    },
    username: function (value) {
      return String(value || '')
        .replace(/[^a-zA-Z0-9._\-]/g, '')
        .slice(0, 64);
    },
    'login-id': function (value) {
      return String(value || '')
        .replace(/\s+/g, '')
        .replace(/[^a-zA-Z0-9.@_+%-]/g, '')
        .slice(0, 254);
    },
    decimal: function (value) {
      var cleaned = String(value || '').replace(/[^\d.]/g, '');
      var firstDot = cleaned.indexOf('.');
      if (firstDot === -1) return cleaned.slice(0, 16);
      return (
        cleaned.slice(0, firstDot + 1) +
        cleaned
          .slice(firstDot + 1)
          .replace(/\./g, '')
          .slice(0, 4)
      ).slice(0, 16);
    },
    integer: function (value) {
      return String(value || '').replace(/\D/g, '').slice(0, 12);
    },
    otp: function (value) {
      return String(value || '').replace(/\D/g, '').slice(0, 1);
    },
    'room-code': function (value) {
      return String(value || '')
        .replace(/[^a-zA-Z0-9\-]/g, '')
        .slice(0, 20);
    },
  };

  function inferKind(el) {
    var explicit = (el.getAttribute('data-mori-filter') || '').trim().toLowerCase();
    if (explicit && FILTERS[explicit]) return explicit;

    var type = (el.getAttribute('type') || '').toLowerCase();
    var name = String(el.name || el.id || '').toLowerCase();
    var auto = (el.getAttribute('autocomplete') || '').toLowerCase();
    var mode = (el.getAttribute('inputmode') || '').toLowerCase();

    if (type === 'tel' || auto === 'tel' || /phone|mobile|tel/.test(name)) return 'phone';
    if (type === 'email' || auto === 'email' || /email|gmail/.test(name)) return 'email';
    if (auto === 'username' && /usernameoremail|login|user/.test(name)) return 'login-id';
    if (auto === 'username' || /username/.test(name)) return 'username';
    if (auto === 'name' || /fullname.?name|guestname|displayname/.test(name) || name === 'guestname')
      return 'person-name';
    if (/amount|price|tendered|discount|percent|ocr-amount|cash-tendered/.test(name) || (mode === 'decimal' && !/minnights|quantity|count/.test(name)))
      return 'decimal';
    if (/otp|digit|codebox/.test(name) || (el.getAttribute('maxlength') === '1' && mode === 'numeric'))
      return 'otp';
    if (/roomnumber|assignedroom/.test(name)) return 'room-code';
    if (mode === 'numeric' || (type === 'number' && mode !== 'decimal')) return 'integer';
    return null;
  }

  function applyFilter(el, emit) {
    var kind = inferKind(el);
    if (!kind) return;
    var filter = FILTERS[kind];
    if (!filter) return;

    var start = el.selectionStart;
    var end = el.selectionEnd;
    var before = el.value;
    var after = filter(before);
    if (before === after) return;

    el.value = after;
    if (typeof start === 'number' && typeof end === 'number' && el === document.activeElement) {
      var delta = before.length - after.length;
      var nextStart = Math.max(0, start - delta);
      var nextEnd = Math.max(0, end - delta);
      try {
        el.setSelectionRange(nextStart, nextEnd);
      } catch (_) {
        /* type=number may not support selection */
      }
    }
    if (emit) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function onInput(event) {
    var el = event.target;
    if (!el || el.tagName !== 'INPUT') return;
    if (el.readOnly || el.disabled) return;
    if (el.type === 'password' || el.type === 'hidden' || el.type === 'file' || el.type === 'checkbox' || el.type === 'radio' || el.type === 'date' || el.type === 'time' || el.type === 'datetime-local' || el.type === 'search')
      return;
    applyFilter(el, false);
  }

  function onPaste(event) {
    var el = event.target;
    if (!el || el.tagName !== 'INPUT') return;
    var kind = inferKind(el);
    if (!kind) return;
    event.preventDefault();
    var text = (event.clipboardData || window.clipboardData).getData('text') || '';
    var start = el.selectionStart || 0;
    var end = el.selectionEnd || 0;
    var next = el.value.slice(0, start) + text + el.value.slice(end);
    el.value = FILTERS[kind](next);
    try {
      var caret = el.value.length;
      el.setSelectionRange(caret, caret);
    } catch (_) {}
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function bindRoot(root) {
    root.addEventListener('input', onInput, true);
    root.addEventListener('paste', onPaste, true);
  }

  window.MoriInputFilters = {
    filter: function (kind, value) {
      return FILTERS[kind] ? FILTERS[kind](value) : value;
    },
    kinds: Object.keys(FILTERS),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bindRoot(document);
    });
  } else {
    bindRoot(document);
  }
})();
