(function () {
  'use strict';

  var LIFE_MS = 5500;
  var WARN_AFTER_MS = 3500;
  var stack = null;

  function ensureStack() {
    if (stack && document.body.contains(stack)) return stack;
    stack = document.getElementById('moriNoticeStack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'moriNoticeStack';
      stack.className = 'mori-notice-stack';
      stack.setAttribute('aria-live', 'polite');
      stack.setAttribute('aria-relevant', 'additions');
      document.body.appendChild(stack);
    }
    return stack;
  }

  function iconSvg(kind) {
    if (kind === 'error') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';
    }
    if (kind === 'info') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
  }

  function clearTimers(node) {
    if (node._moriTimer) {
      window.clearTimeout(node._moriTimer);
      node._moriTimer = null;
    }
    if (node._moriWarnTimer) {
      window.clearTimeout(node._moriWarnTimer);
      node._moriWarnTimer = null;
    }
  }

  function dismiss(node) {
    if (!node || node.classList.contains('is-leaving')) return;
    clearTimers(node);
    node.classList.add('is-leaving');
    window.setTimeout(function () {
      node.remove();
    }, 300);
  }

  function armTimer(item, ms) {
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    var remaining = ms;
    var started = Date.now();
    var paused = false;
    var warnElapsed = 0;
    var warnStarted = Date.now();
    var timerEl = item.querySelector('.mori-notice-timer');

    function clearWarn() {
      if (item._moriWarnTimer) {
        window.clearTimeout(item._moriWarnTimer);
        item._moriWarnTimer = null;
      }
    }

    function armWarn() {
      if (item.classList.contains('is-expiring')) return;
      clearWarn();
      var wait = Math.max(0, WARN_AFTER_MS - warnElapsed);
      item._moriWarnTimer = window.setTimeout(function () {
        item.classList.add('is-expiring');
        item._moriWarnTimer = null;
      }, wait);
      warnStarted = Date.now();
    }

    function schedule() {
      item._moriTimer = window.setTimeout(function () {
        dismiss(item);
      }, remaining);
      if (timerEl) {
        timerEl.style.animation = 'none';
        void timerEl.offsetWidth;
        timerEl.style.animation = '';
        timerEl.style.animationDuration = remaining + 'ms';
      }
      armWarn();
    }

    function pause() {
      if (paused || !item._moriTimer) return;
      paused = true;
      window.clearTimeout(item._moriTimer);
      item._moriTimer = null;
      remaining = Math.max(800, remaining - (Date.now() - started));
      if (!item.classList.contains('is-expiring')) {
        warnElapsed = Math.min(WARN_AFTER_MS, warnElapsed + (Date.now() - warnStarted));
      }
      clearWarn();
      if (timerEl) timerEl.style.animationPlayState = 'paused';
    }

    function resume() {
      if (!paused) return;
      paused = false;
      started = Date.now();
      if (timerEl) timerEl.style.animationPlayState = 'running';
      schedule();
    }

    item.addEventListener('mouseenter', pause);
    item.addEventListener('mouseleave', resume);
    item.addEventListener('focusin', pause);
    item.addEventListener('focusout', function (e) {
      if (!item.contains(e.relatedTarget)) resume();
    });

    schedule();
  }

  /**
   * @param {string} message
   * @param {'success'|'error'|'info'} [kind]
   */
  window.showMoriNotice = function (message, kind) {
    var text = String(message || '').replace(/\s+/g, ' ').trim();
    if (!text) return;

    var type = kind === 'error' || kind === 'info' ? kind : 'success';
    var host = ensureStack();

    while (host.children.length >= 3) {
      host.firstElementChild && dismiss(host.firstElementChild);
    }

    var item = document.createElement('div');
    item.className = 'mori-notice is-' + type;
    item.setAttribute('role', type === 'error' ? 'alert' : 'status');
    item.innerHTML =
      '<span class="mori-notice-icon">' + iconSvg(type) + '</span>' +
      '<p class="mori-notice-text"></p>' +
      '<button type="button" class="mori-notice-close" aria-label="Dismiss notification">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>' +
      '</button>' +
      (type === 'error' ? '' : '<span class="mori-notice-timer" aria-hidden="true"></span>');

    item.querySelector('.mori-notice-text').textContent = text;
    item.querySelector('.mori-notice-close').addEventListener('click', function () {
      dismiss(item);
    });

    host.appendChild(item);

    if (type !== 'error') {
      armTimer(item, LIFE_MS);
    }
  };

  function bootFlash() {
    ensureStack();
    var boot = document.getElementById('moriFlashBoot');
    if (!boot) return;
    var success = boot.getAttribute('data-mori-success');
    var error = boot.getAttribute('data-mori-error');
    var info = boot.getAttribute('data-mori-info');
    if (success) window.showMoriNotice(success, 'success');
    if (error) window.showMoriNotice(error, 'error');
    if (info) window.showMoriNotice(info, 'info');
    boot.remove();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootFlash);
  } else {
    bootFlash();
  }
})();
