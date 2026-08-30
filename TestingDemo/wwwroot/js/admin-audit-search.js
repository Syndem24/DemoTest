(() => {
  const root = document.querySelector('[data-audit-search]');
  const form = root?.closest('form');
  const input = root?.querySelector('[data-audit-search-input]');
  const list = root?.querySelector('[data-audit-search-list]');
  const clearBtn = root?.querySelector('[data-audit-search-clear]');
  const suggestUrl = root?.dataset.suggestUrl;
  if (!root || !form || !input || !list || !clearBtn || !suggestUrl) return;

  const DEBOUNCE_MS = 280;
  let debounceId = 0;
  let abort = null;
  let items = [];
  let activeIndex = -1;
  let open = false;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function domainParam() {
    const hidden = form.querySelector('input[name="domain"]');
    return hidden?.value || '';
  }

  function syncClear() {
    clearBtn.hidden = input.value.trim().length === 0;
  }

  function closeList() {
    open = false;
    activeIndex = -1;
    list.hidden = true;
    list.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function setActive(index) {
    const options = [...list.querySelectorAll('[role="option"]')];
    if (!options.length) {
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
      return;
    }
    activeIndex = (index + options.length) % options.length;
    options.forEach((option, i) => {
      const on = i === activeIndex;
      option.classList.toggle('is-active', on);
      option.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) {
        input.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function choose(value) {
    input.value = value;
    syncClear();
    closeList();
    const page = form.querySelector('input[name="page"]');
    if (page) page.remove();
    form.requestSubmit();
  }

  function render(suggestions, term) {
    const rows = [];
    const trimmed = term.trim();
    if (trimmed) {
      rows.push({
        value: trimmed,
        label: `Search for “${trimmed}”`,
        hint: 'All matching events',
        isQuery: true,
      });
    }
    suggestions.forEach((item) => {
      if (!item?.value) return;
      if (item.value.trim().toLowerCase() === trimmed.toLowerCase()) return;
      rows.push(item);
    });
    items = rows;
    if (!rows.length) {
      list.innerHTML = '<li class="admin-audit-suggestion-empty">No matching receipts, staff, or actions</li>';
      list.hidden = false;
      open = true;
      input.setAttribute('aria-expanded', 'true');
      return;
    }

    list.innerHTML = rows
      .map((item, index) => {
        const hint = item.hint ? `<small>${escapeHtml(item.hint)}</small>` : '';
        const extra = item.isQuery ? ' is-query' : '';
        return `<li>
          <button type="button" class="admin-audit-suggestion${extra}" role="option" id="auditSuggest-${index}" data-value="${escapeHtml(item.value)}" aria-selected="false">
            <span>${escapeHtml(item.label || item.value)}</span>
            ${hint}
          </button>
        </li>`;
      })
      .join('');
    list.hidden = false;
    open = true;
    input.setAttribute('aria-expanded', 'true');
    setActive(0);
  }

  async function fetchSuggestions(term) {
    abort?.abort();
    abort = new AbortController();
    const url = new URL(suggestUrl, window.location.origin);
    url.searchParams.set('q', term);
    const domain = domainParam();
    if (domain) url.searchParams.set('domain', domain);
    root.classList.add('is-loading');
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: abort.signal,
      });
      const data = await response.json().catch(() => []);
      if (input.value.trim() !== term) return;
      render(Array.isArray(data) ? data : [], term);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      closeList();
    } finally {
      root.classList.remove('is-loading');
    }
  }

  function scheduleSuggest() {
    syncClear();
    const term = input.value.trim();
    window.clearTimeout(debounceId);
    abort?.abort();
    if (term.length < 1) {
      closeList();
      return;
    }
    debounceId = window.setTimeout(() => fetchSuggestions(term), DEBOUNCE_MS);
  }

  input.addEventListener('input', scheduleSuggest);
  input.addEventListener('focus', () => {
    if (input.value.trim().length > 0 && !open) scheduleSuggest();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        closeList();
      }
      return;
    }
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(activeIndex - 1);
    } else if (event.key === 'Enter' && activeIndex >= 0 && items[activeIndex]) {
      event.preventDefault();
      choose(items[activeIndex].value);
    }
  });

  list.addEventListener('mousedown', (event) => {
    const button = event.target.closest('[data-value]');
    if (!button) return;
    event.preventDefault();
    choose(button.getAttribute('data-value') || '');
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    syncClear();
    closeList();
    input.focus();
    const url = new URL(window.location.href);
    if (!url.searchParams.has('q')) return;
    url.searchParams.delete('q');
    url.searchParams.delete('page');
    window.location.assign(`${url.pathname}${url.search}`);
  });

  document.addEventListener('click', (event) => {
    if (!root.contains(event.target)) closeList();
  });

  syncClear();
})();
