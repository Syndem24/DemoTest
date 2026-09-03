import { useEffect, useMemo, useState } from 'react'
import {
  deleteAdminUser,
  disableAdminUser,
  enableAdminUser,
  fetchAdminGuests,
} from '../adminUsersApi'
import type { AdminGuestsListResponse, AdminUserStatusFilter } from '../adminUsersTypes'
import { notifyMori } from '../moriNotice'

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

export function AdminGuestUsersApp() {
  const root = document.getElementById('admin-guest-users-root')
  const guestsUrl = root?.dataset.guestsUrl || '/api/admin/users/guests'
  const actionBaseUrl = root?.dataset.actionBaseUrl || '/api/admin/users'
  const staffUrl = root?.dataset.staffUrl || '/AdminUsers'

  const [guestQuery, setGuestQuery] = useState('')
  const [guestStatus, setGuestStatus] = useState<AdminUserStatusFilter>('all')
  const [guestPage, setGuestPage] = useState(1)
  const [guestLoading, setGuestLoading] = useState(true)
  const [guestResult, setGuestResult] = useState<AdminGuestsListResponse | null>(null)
  const [guestSearchDraft, setGuestSearchDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null)

  const loadGuests = async (
    nextPage = guestPage,
    nextQuery = guestQuery,
    nextStatus = guestStatus,
    silent = false,
  ) => {
    if (!silent) setGuestLoading(true)
    try {
      const data = await fetchAdminGuests(guestsUrl, {
        q: nextQuery,
        status: nextStatus,
        page: nextPage,
      })
      setGuestResult(data)
      setGuestPage(data.page)
    } catch (err) {
      notifyMori(err instanceof Error ? err.message : 'Unable to load guest accounts.', 'error')
    } finally {
      if (!silent) setGuestLoading(false)
    }
  }

  useEffect(() => {
    const flash = consumeAdminUsersFlash()
    if (flash) notifyMori(flash, 'success')
  }, [])

  useEffect(() => {
    void loadGuests(1, guestQuery, guestStatus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestQuery, guestStatus])

  useEffect(() => {
    const handler = (event: Event) => {
      const scopes = (event as CustomEvent<{ scopes?: string[] }>).detail?.scopes || []
      if (scopes.includes('all') || scopes.includes('audit') || scopes.includes('users')) {
        void loadGuests(guestPage, guestQuery, guestStatus, true)
      }
    }
    window.addEventListener('mori:admin-refresh', handler)
    return () => window.removeEventListener('mori:admin-refresh', handler)
  }, [guestPage, guestQuery, guestStatus])

  const onAction = async (work: () => Promise<string>) => {
    setSaving(true)
    try {
      const text = await work()
      notifyMori(text, 'success')
      await loadGuests(guestPage)
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

  const guestRange = useMemo(() => {
    if (!guestResult || guestResult.totalCount === 0) return { start: 0, end: 0 }
    const start = (guestResult.page - 1) * guestResult.pageSize + 1
    const end = Math.min(guestResult.totalCount, guestResult.page * guestResult.pageSize)
    return { start, end }
  }, [guestResult])

  const guests = guestResult?.items ?? []

  return (
    <div className="au-app">
      <header className="au-header">
        <div className="au-header-text">
          <p className="au-eyebrow">Guest portal</p>
          <h1>Guest Google accounts</h1>
          <p className="au-subtitle">
            Guests who signed in with Google. Disable, edit, or delete the same way as staff.
          </p>
        </div>
        <div className="au-header-actions">
          <a className="au-btn au-btn-primary" href={staffUrl}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
            <span>Back to staff</span>
          </a>
        </div>
      </header>

      <section className="au-kpis" aria-label="Guest overview">
        <article className="au-kpi">
          <div className="au-kpi-icon is-guest">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.28 2.01.2 5.97 1.29 6 3.28-1.29 1.94-3.5 3.22-6 3.22z" />
            </svg>
          </div>
          <div>
            <span>Guest accounts</span>
            <strong>{guestResult?.summary.total ?? 0}</strong>
          </div>
        </article>
        <article className="au-kpi">
          <div className="au-kpi-icon is-guest">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.28 2.01.2 5.97 1.29 6 3.28-1.29 1.94-3.5 3.22-6 3.22z" />
            </svg>
          </div>
          <div>
            <span>Google linked</span>
            <strong>{guestResult?.summary.googleLinked ?? 0}</strong>
          </div>
        </article>
      </section>

      <section className="au-filter-wrap">
        <div className="au-search-wrap">
          <label htmlFor="auGuestSearch">Search guests</label>
          <div className="au-input-icon-group">
            <svg className="au-search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
            <input
              id="auGuestSearch"
              type="search"
              value={guestSearchDraft}
              onChange={(e) => setGuestSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  setGuestQuery(guestSearchDraft.trim())
                  setGuestPage(1)
                }
              }}
              placeholder="Filter by name, email, username..."
              autoComplete="off"
            />
            {guestSearchDraft ? (
              <button
                type="button"
                className="au-clear-btn"
                title="Clear search"
                onClick={() => {
                  setGuestSearchDraft('')
                  setGuestQuery('')
                  setGuestPage(1)
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="au-btn au-btn-ghost"
            style={{ marginTop: '0.5rem' }}
            onClick={() => {
              setGuestQuery(guestSearchDraft.trim())
              setGuestPage(1)
            }}
          >
            Search guests
          </button>
        </div>

        <div className="au-status-wrap">
          <label htmlFor="auGuestStatus">Guest status</label>
          <select
            id="auGuestStatus"
            value={guestStatus}
            onChange={(e) => {
              setGuestStatus(e.target.value as AdminUserStatusFilter)
              setGuestPage(1)
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
          Showing <strong>
            {guestRange.start}–{guestRange.end}
          </strong>{' '}
          of <strong>{guestResult?.totalCount ?? 0}</strong> guest accounts
          {' · '}
          <strong>{guestResult?.summary.googleLinked ?? 0}</strong> linked with Google
        </p>
      </div>

      <section className="au-table-panel" aria-label="Guest Google accounts">
        <table className="au-table">
          <thead>
            <tr>
              <th>GUEST</th>
              <th>USERNAME</th>
              <th>EMAIL</th>
              <th>GOOGLE</th>
              <th>STATUS</th>
              <th className="au-th-actions">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {guestLoading ? (
              <tr>
                <td colSpan={6} className="au-empty">
                  <div className="au-loading-inline">
                    <span className="au-spinner" aria-hidden="true"></span>
                    <span>Loading guest accounts...</span>
                  </div>
                </td>
              </tr>
            ) : guests.length === 0 ? (
              <tr>
                <td colSpan={6} className="au-empty">
                  No guest Google accounts found.
                </td>
              </tr>
            ) : (
              guests.map((user) => (
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
                  <td>
                    {user.hasGoogleLogin ? (
                      <span className="au-role is-guest">Google linked</span>
                    ) : (
                      <span className="au-role is-other">Not linked</span>
                    )}
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
                  <td>
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
                          onClick={() =>
                            void onAction(() => disableAdminUser(actionBaseUrl, user.id, root))
                          }
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
                            title={
                              user.canDeleteNow
                                ? 'Delete account'
                                : 'Disable this account first before deleting it.'
                            }
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

      <nav className="au-pagination" aria-label="Guest pages">
        <button
          type="button"
          className="au-btn au-btn-ghost"
          disabled={guestLoading || !guestResult || guestResult.page <= 1}
          onClick={() => {
            const next = Math.max(1, (guestResult?.page || 1) - 1)
            setGuestPage(next)
            void loadGuests(next)
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
          <span>Previous</span>
        </button>
        <span className="au-page-indicator">
          Page <strong>{guestResult?.page || 1}</strong> of <strong>{guestResult?.totalPages || 1}</strong>
        </span>
        <button
          type="button"
          className="au-btn au-btn-ghost"
          disabled={guestLoading || !guestResult || guestResult.page >= guestResult.totalPages}
          onClick={() => {
            const next = Math.min(guestResult?.totalPages || 1, (guestResult?.page || 1) + 1)
            setGuestPage(next)
            void loadGuests(next)
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
            aria-labelledby="auGuestDeleteModalTitle"
            aria-describedby="auGuestDeleteModalBody"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="auGuestDeleteModalTitle">Delete account?</h2>
            <p id="auGuestDeleteModalBody">
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
