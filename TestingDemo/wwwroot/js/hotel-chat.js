(function () {
  'use strict';

  var root = document.querySelector('[data-hotel-chat]');
  if (!root) return;
  root.hidden = false;

  var STORAGE_KEY = root.getAttribute('data-storage-key') || 'mori.chat.v1';
  var welcomeUrl = root.getAttribute('data-welcome-url') || '/api/chat/welcome';
  var messageUrl = root.getAttribute('data-message-url') || '/api/chat/message';
  var panel = root.querySelector('[data-hotel-chat-panel]');
  var toggle = root.querySelector('[data-hotel-chat-toggle]');
  var closeBtn = root.querySelector('[data-hotel-chat-close]');
  var expandBtn = root.querySelector('[data-hotel-chat-expand]');
  var messagesEl = root.querySelector('[data-hotel-chat-messages]');
  var chipsEl = root.querySelector('[data-hotel-chat-chips]');
  var form = root.querySelector('[data-hotel-chat-form]');
  var input = root.querySelector('[data-hotel-chat-input]');
  var titleEl = root.querySelector('[data-hotel-chat-title]');
  var sendBtn = root.querySelector('[data-hotel-chat-send]');

  var state = loadState();
  var busy = false;

  function t(key, fallback) {
    try {
      if (window.MoriI18n && typeof window.MoriI18n.t === 'function') {
        var v = window.MoriI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback;
  }

  function loadState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return { open: false, expanded: false, messages: [], assistantName: 'Mori Assistant', welcomed: false };
      var parsed = JSON.parse(raw);
      return {
        open: !!parsed.open,
        expanded: !!parsed.expanded,
        messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-24) : [],
        assistantName: parsed.assistantName || 'Mori Assistant',
        welcomed: !!parsed.welcomed
      };
    } catch (_) {
      return { open: false, expanded: false, messages: [], assistantName: 'Mori Assistant', welcomed: false };
    }
  }

  function saveState() {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          open: state.open,
          expanded: state.expanded,
          messages: state.messages.slice(-24),
          assistantName: state.assistantName,
          welcomed: state.welcomed
        })
      );
    } catch (_) {}
  }

  function syncExpandUi() {
    root.classList.toggle('is-expanded', !!state.expanded);
    if (!expandBtn) return;
    expandBtn.setAttribute('aria-pressed', state.expanded ? 'true' : 'false');
    expandBtn.setAttribute(
      'aria-label',
      state.expanded
        ? t('chat.collapse', 'Make chat smaller')
        : t('chat.expand', 'Make chat larger')
    );
    var expandIcon = expandBtn.querySelector('.hotel-chat-icon-expand');
    var collapseIcon = expandBtn.querySelector('.hotel-chat-icon-collapse');
    if (expandIcon) expandIcon.hidden = !!state.expanded;
    if (collapseIcon) collapseIcon.hidden = !state.expanded;
  }

  function setExpanded(expanded) {
    state.expanded = !!expanded;
    syncExpandUi();
    saveState();
  }

  function token() {
    return (
      document.querySelector('#hotelChatAntiForgery input[name="__RequestVerificationToken"]')?.value ||
      document.querySelector('input[name="__RequestVerificationToken"]')?.value ||
      ''
    );
  }

  function lang() {
    try {
      if (window.MoriI18n && typeof window.MoriI18n.getLang === 'function') return window.MoriI18n.getLang();
      return localStorage.getItem('moriGuestLang') || 'en';
    } catch (_) {
      return 'en';
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatReply(text) {
    var escaped = escapeHtml(text || '');
    return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }

  function autosizeInput() {
    if (!input) return;
    input.style.height = 'auto';
    var next = Math.min(input.scrollHeight, 104);
    input.style.height = Math.max(40, next) + 'px';
  }

  function renderMessages() {
    if (!messagesEl) return;
    messagesEl.innerHTML = '';
    state.messages.forEach(function (m) {
      var row = document.createElement('div');
      row.className = 'hotel-chat-bubble is-' + (m.role === 'user' ? 'user' : 'assistant');
      if (m.role === 'user') row.classList.add('notranslate');
      if (m.role === 'user') {
        row.textContent = m.content || '';
      } else {
        row.innerHTML = formatReply(m.content || '');
      }
      messagesEl.appendChild(row);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function createTypingIndicator() {
    var typing = document.createElement('div');
    typing.className = 'hotel-chat-bubble is-assistant is-typing';
    typing.setAttribute('role', 'status');
    typing.setAttribute('aria-live', 'polite');
    typing.setAttribute('aria-label', t('chat.typing', 'Thinking…'));

    var dots = document.createElement('span');
    dots.className = 'hotel-chat-typing-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = '<span></span><span></span><span></span>';

    var label = document.createElement('span');
    label.className = 'hotel-chat-typing-label';
    label.textContent = t('chat.typing', 'Thinking…');

    typing.appendChild(dots);
    typing.appendChild(label);
    return typing;
  }

  function setOpen(open) {
    state.open = !!open;
    if (panel) panel.hidden = !state.open;
    if (toggle) toggle.setAttribute('aria-expanded', state.open ? 'true' : 'false');
    root.classList.toggle('is-open', state.open);
    saveState();
    if (state.open && input) {
      setTimeout(function () {
        input.focus();
        autosizeInput();
      }, 50);
    }
  }

  function renderChips(list) {
    if (!chipsEl) return;
    chipsEl.innerHTML = '';
    if (!list || !list.length) {
      chipsEl.hidden = true;
      return;
    }
    chipsEl.hidden = false;
    list.forEach(function (label) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hotel-chat-chip';
      btn.textContent = label;
      btn.addEventListener('click', function () {
        if (busy) return;
        input.value = label;
        autosizeInput();
        form.requestSubmit();
      });
      chipsEl.appendChild(btn);
    });
  }

  async function ensureWelcome() {
    root.hidden = false;

    if (state.welcomed && state.messages.length) {
      renderMessages();
      return;
    }
    try {
      var res = await fetch(welcomeUrl, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('welcome');
      var data = await res.json();
      state.assistantName = data.assistantName || state.assistantName;
      if (titleEl) titleEl.textContent = state.assistantName;
      if (!state.messages.length && data.reply) {
        state.messages.push({ role: 'assistant', content: data.reply });
      }
      state.welcomed = true;
      renderChips(data.suggestions || []);
      saveState();
      renderMessages();
    } catch (_) {
      if (!state.messages.length) {
        state.messages.push({
          role: 'assistant',
          content: t(
            'chat.offlineWelcome',
            'Hello — I’m Mori Assistant. If AI is unavailable, call +63 960 441 7525 or (032) 238 8855.'
          )
        });
        state.welcomed = true;
        saveState();
      }
      renderMessages();
    }
  }

  async function sendMessage(text) {
    var message = (text || '').trim();
    if (!message || busy) return;
    if (message.length > 500) message = message.slice(0, 500);

    state.messages.push({ role: 'user', content: message });
    renderMessages();
    saveState();
    input.value = '';
    autosizeInput();
    busy = true;
    if (sendBtn) sendBtn.disabled = true;

    var typing = createTypingIndicator();
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    var history = state.messages
      .slice(0, -1)
      .filter(function (m) { return m.role === 'user' || m.role === 'assistant'; })
      .slice(-8)
      .map(function (m) { return { role: m.role, content: m.content }; });

    try {
      var res = await fetch(messageUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          RequestVerificationToken: token()
        },
        body: JSON.stringify({
          message: message,
          lang: lang(),
          history: history
        })
      });
      typing.remove();
      if (res.status === 429) {
        state.messages.push({
          role: 'assistant',
          content: t('chat.rateLimited', 'Please wait a moment, then try again — or call the front desk.')
        });
      } else if (!res.ok) {
        state.messages.push({
          role: 'assistant',
          content: t('chat.error', 'Something went wrong. Please call +63 960 441 7525 or (032) 238 8855.')
        });
      } else {
        var data = await res.json();
        state.messages.push({ role: 'assistant', content: data.reply || t('chat.error', 'Please call the front desk.') });
      }
    } catch (_) {
      typing.remove();
      state.messages.push({
        role: 'assistant',
        content: t('chat.error', 'Something went wrong. Please call +63 960 441 7525 or (032) 238 8855.')
      });
    }

    busy = false;
    if (sendBtn) sendBtn.disabled = false;
    saveState();
    renderMessages();
    if (input) input.focus();
  }

  if (toggle) toggle.addEventListener('click', function () { setOpen(!state.open); });
  if (closeBtn) closeBtn.addEventListener('click', function () { setOpen(false); });
  if (expandBtn) {
    expandBtn.addEventListener('click', function () {
      setExpanded(!state.expanded);
    });
  }
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      sendMessage(input.value);
    });
  }
  if (input) {
    input.addEventListener('input', autosizeInput);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    autosizeInput();
  }

  document.addEventListener('mori:langchange', function () {
    if (window.MoriI18n && typeof window.MoriI18n.apply === 'function') {
      window.MoriI18n.apply(root);
    }
    syncExpandUi();
  });

  syncExpandUi();

  ensureWelcome().then(function () {
    root.hidden = false;
    if (state.open) setOpen(true);
  });
})();
