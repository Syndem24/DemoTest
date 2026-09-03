import { useCallback, useEffect, useState } from 'react'
import { fetchRooms, fetchRoomTypes } from './api'
import { RoomListPanel } from './components/RoomListPanel'
import { RoomTypesPanel } from './components/RoomTypesPanel'
import type { RoomItem, RoomTypeSummary, ViewMode } from './types'

function readInitialView(): ViewMode {
  const root = document.getElementById('room-management-root')
  const fromData = root?.dataset.view?.toLowerCase()
  if (fromData === 'types' || fromData === 'list') {
    return fromData
  }

  const params = new URLSearchParams(window.location.search)
  return params.get('view') === 'types' ? 'types' : 'list'
}

function setViewQuery(view: ViewMode) {
  const url = new URL(window.location.href)
  if (view === 'types') {
    url.searchParams.set('view', 'types')
  } else {
    url.searchParams.delete('view')
  }
  window.history.replaceState({}, '', url.toString())
}

function canManageRoomTypes(): boolean {
  return document.getElementById('room-management-root')?.dataset.canManageTypes === 'true'
}

export default function App() {
  const [view, setView] = useState<ViewMode>(readInitialView)
  const [types, setTypes] = useState<RoomTypeSummary[]>([])
  const [rooms, setRooms] = useState<RoomItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const manageTypes = canManageRoomTypes()

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
    }
    setError(null)
    try {
      const [typeData, roomData] = await Promise.all([fetchRoomTypes(), fetchRooms()])
      setTypes(typeData)
      setRooms(roomData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rooms.')
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handler = (event: Event) => {
      const scopes = (event as CustomEvent<{ scopes?: string[] }>).detail?.scopes || []
      if (scopes.includes('all') || scopes.includes('rooms')) {
        void load(true)
      }
    }
    window.addEventListener('mori:admin-refresh', handler)
    return () => window.removeEventListener('mori:admin-refresh', handler)
  }, [load])

  const changeView = (next: ViewMode) => {
    setView(next)
    setViewQuery(next)
  }

  return (
    <div className="rm-app">
      <header className="rm-header">
        <div>
          <p className="rm-eyebrow">Mori International Hotel · Admin</p>
          <h1>Room Management</h1>
          <p className="rm-subtitle">Browse room types and individual rooms with fast search and sorting.</p>
        </div>
        {manageTypes ? (
        <div className="rm-header-actions">
          <a className="rm-btn rm-btn-accent" href="/Rooms/Create">
            Create Room Type
          </a>
        </div>
        ) : null}
      </header>

      <div className="rm-tabs" role="tablist" aria-label="Room views">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'list'}
          className={`rm-tab ${view === 'list' ? 'is-active' : ''}`}
          onClick={() => changeView('list')}
        >
          Room List
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'types'}
          className={`rm-tab ${view === 'types' ? 'is-active' : ''}`}
          onClick={() => changeView('types')}
        >
          Room Types
        </button>
      </div>

      <div className="rm-content" key={view}>
        {view === 'types' ? (
          <RoomTypesPanel data={types} loading={loading} error={error} canManage={manageTypes} />
        ) : (
          <RoomListPanel data={rooms} loading={loading} error={error} canManage={manageTypes} />
        )}
      </div>
    </div>
  )
}
