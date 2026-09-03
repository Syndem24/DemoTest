import { useEffect, useMemo, useState } from 'react'
import {
  deleteAdminUser,
  disableAdminUser,
  enableAdminUser,
  fetchAdminUsers,
} from '../adminUsersApi'
import type { AdminUserStatusFilter, AdminUsersListResponse } from '../adminUsersTypes'
import { notifyMori } from '../moriNotice'

type Suggestion = { value: string; label: string }

const ADMIN_USERS_FLASH_KEY = 'mori.adminUsers.flash'

function consumeAdminUsersFlash(): string | null {
  try {
    const value = sessionStorage.getItem(ADMIN_USERS_FLASH_KEY)
    if (value) sessionStorage.removeItem(ADMIN_USERS_FLASH_KEY)
    return value
  } catch {
    return null
  }
}

async function fetchSuggestions(url: string, term: string): Promise<Suggestion[]> {
  const requestUrl = new URL(url, window.location.origin)
  requestUrl.searchParams.set('q', term)
  const response = await fetch(requestUrl.toString(), {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  const data = (await response.json().catch(() => [])) as Suggestion[]
  return Array.isArray(data) ? data : []
}

function roleClass(role: string): string {
  if (role === 'AdminManager') return 'is-admin-manager'
  if (role === 'Receptionist') return 'is-receptionist'
  return 'is-other'
}

function getInitials(fullName: string | null, userName: string): string {
  const name = (fullName || userName).trim()
  if (!name) return 'U'
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

type DeleteModalState = {
  id: string
  userName: string
  displayName: string
}

export function AdminUsersApp() {
  const root = document.getElementById('admin-users-root')
  const listUrl = root?.dataset.listUrl || '/api/admin/users/list'
  const suggestUrl = root?.dataset.suggestUrl || '/api/admin/users/suggestions'
  const actionBaseUrl = root?.dataset.actionBaseUrl || '/api/admin/users'
  const createUrl = root?.dataset.createUrl || '/AdminUsers/Create'
  const guestsPageUrl = root?.dataset.guestsPageUrl || '/AdminUsers/Guests'

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<AdminUserStatusFilter>('all')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<AdminUsersListResponse | null>(null)
  const [searchDraft, setSearchDraft] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggestionOpen, setSuggestionOpen] = useState(false)
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null)

  const submitSearch = (rawValue: string) => {
    const term = rawValue.trim()
    setQuery(term)
    setPage(1)
    setSuggestionOpen(false)
  }

  const load = async (nextPage = page, nextQuery = query, nextStatus = status, silent = false) => {
    if (!silent) {
      setLoading(true)
    }
    try {
      const data = await fetchAdminUsers(listUrl, { q: nextQuery, status: nextStatus, page: nextPage })
      setResult(data)
      setPage(data.page)
    } catch (err) {
      notifyMori(err instanceof Error ? err.message : 'Unable to load users.', 'error')
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    const flash = consumeAdminUsersFlash()
    if (flash) notifyMori(flash, 'success')
  }, [])

  useEffect(() => {
    void load(1, query, status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status])

  useEffect(() => {
    const handler = (event: Event) => {
      const scopes = (event as CustomEvent<{ scopes?: string[] }>).detail?.scopes || []
      if (scopes.includes('all') || scopes.includes('audit') || scopes.includes('users')) {
        void load(page, query, status, true)
      }
    }
    window.addEventListener('mori:admin-refresh', handler)
    return () => window.removeEventListener('mori:admin-refresh', handler)
  }, [page, query, status])

  useEffect(() => {
    const term = searchDraft.trim()
    if (!term) {
      setSuggestions([])
      setSuggestionOpen(false)
      setSuggestionLoading(false)
      return
    }
    setSuggestionLoading(true)
    const handle = window.setTimeout(async () => {
      try {
        const list = await fetchSuggestions(suggestUrl, term)
        setSuggestions(list)
        setSuggestionOpen(list.length > 0)
      } catch {
        setSuggestions([])
        setSuggestionOpen(false)
      } finally {
        setSuggestionLoading(false)
      }
    }, 1500)
    return () => window.clearTimeout(handle)
  }, [searchDraft, suggestUrl])

  const onAction = async (work: () => Promise<string>) => {
    setSaving(true)
    try {
      const text = await work()
      notifyMori(text, 'success')
      await load(page)
    } catch (err) {
      notifyMori(err instanceof Error ? err.message : 'Action failed.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const requestDelete = (user: { id: string; userName: string; fullName: string | null }) => {
    setDeleteModal({
      id: user.id,
      userName: user.userName,
      displayName: user.fullName || user.userName,
    })
  }

  const confirmDelete = async () => {
    if (!deleteModal) return
    const targetId = deleteModal.id
    setDeleteModal(null)
    await onAction(() => deleteAdminUser(actionBaseUrl, targetId, root))
  }

  const range = useMemo(() => {
    if (!result || result.totalCount === 0) return { start: 0, end: 0 }
    const start = (result.page - 1) * result.pageSize + 1
    const end = Math.min(result.totalCount, result.page * result.pageSize)
    return { start, end }
  }, [result])

  const users = result?.items ?? []

  return (
    <div className="au-app">
      <header className="au-header">
        <div className="au-header-text">
          <p className="au-eyebrow">Admin Management</p>
          <h1>Staff accounts</h1>
          <p className="au-subtitle">
            Manage staff authorization, account statuses, and system access rights.
          </p>
        </div>
        <div className="au-header-actions">
          <a className="au-btn au-btn-primary" href={guestsPageUrl}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.28 2.01.2 5.97 1.29 6 3.28-1.29 1.94-3.5 3.22-6 3.22z" />
            </svg>
            <span>Guest Google accounts</span>
          </a>
          <a className="au-btn au-btn-primary" href={createUrl}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 5a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H6a1 1 0 1 1 0-2h5V6a1 1 0 0 1 1-1z" />
            </svg>
            <span>Create staff user</span>
          </a>
        </div>
      </header>

      <section className="au-kpis" aria-label="Users overview">
        <article className="au-kpi">
          <div className="au-kpi-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
          </div>
          <div>
            <span>Total accounts</span>
            <strong>{result?.summary.total ?? 0}</strong>
          </div>
        </article>

        <article className="au-kpi">
          <div className="au-kpi-icon is-admin">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-5.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8s0 0 0 0z" />
            </svg>
          </div>
          <div>
            <span>Admin managers</span>
            <strong>{result?.summary.adminManagers ?? 0}</strong>
          </div>
        </article>

        <article className="au-kpi">
          <div className="au-kpi-icon is-receptionist">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.78c0-2.33 4.67-3.5 7-3.5s7 1.17 7 3.5v.78z" />
            </svg>
          </div>
          <div>
            <span>Receptionists</span>
            <strong>{result?.summary.receptionists ?? 0}</strong>
          </div>
        </article>
      </section>

      <section className="au-filter-wrap">
        <div className="au-search-wrap">
          <label htmlFor="auSearch">Search staff</label>
          <div className="au-input-icon-group">
            <svg className="au-search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
            <input
              id="auSearch"
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Filter by name, email, username, phone..."
              autoComplete="off"
            />
            {suggestionLoading ? (
              <span className="au-search-loading" aria-live="polite">
                <span className="au-search-loading-spinner" aria-hidden="true"></span>
                <span>Loading...</span>
              </span>
            ) : null}
            {searchDraft && !suggestionLoading ? (
              <button
                type="button"
                className="au-clear-btn"
                title="Clear search"
                onClick={() => {
                  setSearchDraft('')
                  submitSearch('')
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            ) : null}
          </div>
          {suggestionOpen ? (
            <div className="au-suggestions" role="listbox">
              {suggestions.map((s) => (
                <button
                  type="button"
                  key={`${s.value}-${s.label}`}
                  className="au-suggestion"
                  onClick={() => {
                    setSearchDraft(s.value)
                    submitSearch(s.value)
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="au-status-wrap">
          <label htmlFor="auStatus">Account status</label>
          <select
            id="auStatus"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AdminUserStatusFilter)
              setPage(1)
            }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </section>

      <div className="au-range-bar">
        <p className="au-range">
          Showing <strong>{range.start}â€“{range.end}</strong> of{' '}
          <strong>{result?.totalCount ?? 0}</strong> staff accounts
        </p>
      </div>

      {/* Desktop Table View */}
      <section className="au-table-panel" aria-label="Staff directory desktop view">
        <table className="au-table">
          <thead>
            <tr>
              <th>STAFF MEMBER</th>
              <th>USERNAME</th>
              <th>EMAIL</th>
              <th>PHONE</th>
              <th>ROLE</th>
              <th>STATUS</th>
              <th>BIRTH DATE</th>
              <th>ADDRESS</th>
              <th className="au-th-actions">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="au-empty">
                  <div className="au-loading-inline">
                    <span className="au-spinner" aria-hidden="true"></span>
                    <span>Loading staff directory...</span>
                  </div>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={9} className="au-empty">
                  No staff accounts found matching your query.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="au-user-cell">
                      <div className="au-avatar" aria-hidden="true">
                        {getInitials(user.fullName, user.userName)}
                      </div>
                      <div className="au-user-info">
                        <strong className="au-user-name">{user.fullName || user.userName}</strong>
                        {user.fullName ? <span className="au-user-sub">{user.userName}</span> : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    <code className="au-code">{user.userName}</code>
                  </td>
                  <td>{user.email}</td>
                  <td>{user.phoneNumber || 'â€”'}</td>
                  <td>
                    <span className={`au-role ${roleClass(user.role)}`}>{user.role}</span>
                  </td>
                  <td>
                    {user.isDisabled ? (
                      <span className="au-role is-disabled">
                        <span className="au-dot is-disabled" aria-hidden="true"></span>
                        Disabled
                      </span>
                    ) : (
                      <span className="au-role is-active">
                        <span className="au-dot is-active" aria-hidden="true"></span>
                        Active
                      </span>
                    )}
                  </td>
                  <td>{user.birthDate || 'â€”'}</td>
                  <td className="au-cell-address">{user.address || 'â€”'}</td>
                  <td>
                    <div className="au-actions">
                      <a className="au-btn au-btn-ghost" href={`/AdminUsers/Edit/${encodeURIComponent(user.id)}`}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M3 17.25V21h4.75L17.81 9.94l-4.75-4.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 4.75 4.75 1.83-1.83z" />
                        </svg>
                        <span>Edit</span>
                      </a>
                      {!user.isDisabled ? (
                        <>
                          <button
                            type="button"
                            className="au-btn au-btn-ghost"
                            disabled={saving}
                            onClick={() =>
                              void onAction(() => disableAdminUser(actionBaseUrl, user.id, root))
                            }
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                            </svg>
                            <span>Disable</span>
                          </button>
                          <span className="au-btn-space" aria-hidden="true"></span>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="au-btn au-btn-ghost"
                            disabled={saving}
                            onClick={() => void onAction(() => enableAdminUser(actionBaseUrl, user.id, root))}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z" />
                            </svg>
                            <span>Enable</span>
                          </button>
                          <button
                            type="button"
                            className="au-btn au-btn-danger"
                            disabled={saving || !user.canDeleteNow}
                            title={user.canDeleteNow ? 'Delete account' : 'Disable this account first before deleting it.'}
                            onClick={() => {
                              if (!user.canDeleteNow) return
                              requestDelete(user)
                            }}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                            </svg>
                            <span>Delete</span>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* Mobile Card List View (visible on mobile / narrow viewports) */}
      <section className="au-mobile-list" aria-label="Staff directory mobile cards">
        {loading ? (
          <div className="au-card-empty">Loading staff directory...</div>
        ) : users.length === 0 ? (
          <div className="au-card-empty">No staff accounts found.</div>
        ) : (
          users.map((user) => (
            <article key={user.id} className="au-card">
              <div className="au-card-header">
                <div className="au-user-cell">
                  <div className="au-avatar" aria-hidden="true">
                    {getInitials(user.fullName, user.userName)}
                  </div>
                  <div className="au-user-info">
                    <strong className="au-user-name">{user.fullName || user.userName}</strong>
                    <span className="au-user-sub">@{user.userName}</span>
                  </div>
                </div>
                <div className="au-card-badges">
                  <span className={`au-role ${roleClass(user.role)}`}>{user.role}</span>
                  {user.isDisabled ? (
                    <span className="au-role is-disabled">
                      <span className="au-dot is-disabled" aria-hidden="true"></span>
                      Disabled
                    </span>
                  ) : (
                    <span className="au-role is-active">
                      <span className="au-dot is-active" aria-hidden="true"></span>
                      Active
                    </span>
                  )}
                </div>
              </div>

              <div className="au-card-body">
                <div className="au-card-field">
                  <span>Email:</span>
                  <strong>{user.email}</strong>
                </div>
                <div className="au-card-field">
                  <span>Phone:</span>
                  <strong>{user.phoneNumber || 'â€”'}</strong>
                </div>
                {user.birthDate ? (
                  <div className="au-card-field">
                    <span>Birth date:</span>
                    <strong>{user.birthDate}</strong>
                  </div>
                ) : null}
                {user.address ? (
                  <div className="au-card-field">
                    <span>Address:</span>
                    <strong>{user.address}</strong>
                  </div>
                ) : null}
              </div>

              <div className="au-card-footer">
                <div className="au-actions">
                  <a className="au-btn au-btn-ghost" href={`/AdminUsers/Edit/${encodeURIComponent(user.id)}`}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 17.25V21h4.75L17.81 9.94l-4.75-4.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 4.75 4.75 1.83-1.83z" />
                    </svg>
                    <span>Edit</span>
                  </a>
                  {!user.isDisabled ? (
                    <button
                      type="button"
                      className="au-btn au-btn-ghost"
                      disabled={saving}
                      onClick={() => void onAction(() => disableAdminUser(actionBaseUrl, user.id, root))}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                      </svg>
                      <span>Disable</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="au-btn au-btn-ghost"
                        disabled={saving}
                        onClick={() => void onAction(() => enableAdminUser(actionBaseUrl, user.id, root))}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z" />
                        </svg>
                        <span>Enable</span>
                      </button>
                      <button
                        type="button"
                        className="au-btn au-btn-danger"
                        disabled={saving || !user.canDeleteNow}
                        title={user.canDeleteNow ? 'Delete account' : 'Disable this account first before deleting it.'}
                        onClick={() => {
                          if (!user.canDeleteNow) return
                          requestDelete(user)
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                        </svg>
                        <span>Delete</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      <nav className="au-pagination" aria-label="Users pages">
        <button
          type="button"
          className="au-btn au-btn-ghost"
          disabled={loading || !result || result.page <= 1}
          onClick={() => {
            const next = Math.max(1, (result?.page || 1) - 1)
            setPage(next)
            void load(next)
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
          <span>Previous</span>
        </button>
        <span className="au-page-indicator">
          Page <strong>{result?.page || 1}</strong> of <strong>{result?.totalPages || 1}</strong>
        </span>
        <button
          type="button"
          className="au-btn au-btn-ghost"
          disabled={loading || !result || result.page >= result.totalPages}
          onClick={() => {
            const next = Math.min(result?.totalPages || 1, (result?.page || 1) + 1)
            setPage(next)
            void load(next)
          }}
        >
          <span>Next</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
          </svg>
        </button>
      </nav>


      {deleteModal ? (
        <div className="au-delete-modal-backdrop" role="presentation" onClick={() => setDeleteModal(null)}>
          <div
            className="au-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auDeleteModalTitle"
            aria-describedby="auDeleteModalBody"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="auDeleteModalTitle">Delete account?</h2>
            <p id="auDeleteModalBody">
              You are about to permanently remove <strong>{deleteModal.displayName}</strong> (
              <code>@{deleteModal.userName}</code>). This cannot be undone.
            </p>
            <div className="au-delete-modal-actions">
              <button type="button" className="au-btn au-btn-ghost" onClick={() => setDeleteModal(null)}>
                Cancel
              </button>
              <button type="button" className="au-btn au-btn-danger" onClick={() => void confirmDelete()}>
                Yes, delete user
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
