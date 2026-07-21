import { Fragment, useMemo, useState } from 'react'
import { formatMoney } from '../format'
import { compareValues, useDebouncedValue, usePagination, useSortState } from '../hooks'
import type { RoomItem, RoomSortKey } from '../types'
import { DeleteIconLink, DetailsIconLink, EditIconLink } from './ActionIcons'
import { ZoomableImage } from './PhotoZoom'
import { Pagination } from './Pagination'
import { SkeletonRows } from './Skeleton'
import { Toolbar } from './Toolbar'

type Props = {
  data: RoomItem[]
  loading: boolean
  error: string | null
}

type LayoutMode = 'grid' | 'list'

type RoomTypeGroup = {
  roomTypeId: number
  name: string
  pricePerNight: number
  rooms: RoomItem[]
}

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
}) {
  return (
    <button type="button" className={`rm-sort ${active ? 'is-active' : ''}`} onClick={onClick}>
      {label}
      <span className="rm-sort-indicator" aria-hidden="true">
        {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </button>
  )
}

function LayoutToggle({
  mode,
  onChange,
}: {
  mode: LayoutMode
  onChange: (mode: LayoutMode) => void
}) {
  return (
    <div className="rm-layout-toggle" role="group" aria-label="Room list layout">
      <button
        type="button"
        className={`rm-layout-btn ${mode === 'grid' ? 'is-active' : ''}`}
        onClick={() => onChange('grid')}
        title="Grid form"
        aria-pressed={mode === 'grid'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
        </svg>
        <span>Grid</span>
      </button>
      <button
        type="button"
        className={`rm-layout-btn ${mode === 'list' ? 'is-active' : ''}`}
        onClick={() => onChange('list')}
        title="List form"
        aria-pressed={mode === 'list'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
        </svg>
        <span>List</span>
      </button>
    </div>
  )
}

function RoomTypeSeparator({
  name,
  count,
  pricePerNight,
}: {
  name: string
  count: number
  pricePerNight: number
}) {
  return (
    <div className="rm-type-sep">
      <span className="rm-type-sep-name">{name}</span>
      <span className="rm-type-sep-meta">
        {count} room{count === 1 ? '' : 's'} · {formatMoney(pricePerNight)} / night
      </span>
    </div>
  )
}

function RoomCard({ room }: { room: RoomItem }) {
  return (
    <article className="rm-card">
      <div className="rm-card-media">
        {room.images[0] ? (
          <ZoomableImage
            src={room.images[0]}
            alt={`Room ${room.roomNumber} · ${room.name}`}
            images={room.images}
            className="rm-card-media-zoom"
          />
        ) : (
          <div className="rm-card-media-empty">No photo</div>
        )}
        <span className={`rm-pill rm-card-status ${room.status === 'Available' ? 'is-available' : 'is-unavailable'}`}>
          {room.status}
        </span>
      </div>

      <div className="rm-card-body">
        <div className="rm-card-top">
          <div>
            <a className="rm-title-link" href={`/Rooms/Details/${room.id}`}>
              <h3 className="rm-card-title">Room {room.roomNumber}</h3>
            </a>
            <p className="rm-card-type">{room.name}</p>
          </div>
          <div className="rm-card-price">
            <strong>{formatMoney(room.pricePerNight)}</strong>
          </div>
        </div>

        <div className="rm-card-actions">
          <DetailsIconLink href={`/Rooms/Details/${room.id}`} />
          <EditIconLink href={`/Rooms/Edit/${room.id}`} />
          <DeleteIconLink href={`/Rooms/Delete/${room.id}`} />
        </div>
      </div>
    </article>
  )
}

function groupByRoomType(rooms: RoomItem[]): RoomTypeGroup[] {
  const map = new Map<number, RoomTypeGroup>()

  rooms.forEach((room) => {
    const existing = map.get(room.roomTypeId)
    if (existing) {
      existing.rooms.push(room)
      return
    }

    map.set(room.roomTypeId, {
      roomTypeId: room.roomTypeId,
      name: room.name,
      pricePerNight: room.pricePerNight,
      rooms: [room],
    })
  })

  return Array.from(map.values())
}

export function RoomListPanel({ data, loading, error }: Props) {
  const [search, setSearch] = useState('')
  const [layout, setLayout] = useState<LayoutMode>('grid')
  const debouncedSearch = useDebouncedValue(search)
  const { sortKey, sortDir, toggleSort } = useSortState<RoomSortKey>('roomNumber')

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const base = !q
      ? data
      : data.filter((item) => {
          const haystack = [
            item.name,
            item.roomNumber,
            item.description ?? '',
            item.inclusions.join(' '),
            item.status,
          ]
            .join(' ')
            .toLowerCase()
          return haystack.includes(q)
        })

    return [...base].sort((a, b) => {
      const byType = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      if (byType !== 0) {
        return byType
      }
      return compareValues(a[sortKey], b[sortKey], sortDir)
    })
  }, [data, debouncedSearch, sortKey, sortDir])

  const { page, setPage, totalPages, pageItems } = usePagination(filtered, 12)
  const groups = useMemo(() => groupByRoomType(pageItems), [pageItems])

  if (loading) {
    return <SkeletonRows rows={6} />
  }

  if (error) {
    return <div className="rm-alert">{error}</div>
  }

  return (
    <div className="rm-panel">
      <div className="rm-toolbar-row">
        <Toolbar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search by room #, type, inclusion, status…"
          resultCount={filtered.length}
          totalCount={data.length}
        />
        <LayoutToggle mode={layout} onChange={setLayout} />
      </div>

      {filtered.length === 0 ? (
        <div className="rm-empty">No rooms match your search.</div>
      ) : layout === 'grid' ? (
        <>
          <div className="rm-grouped">
            {groups.map((group) => (
              <section key={group.roomTypeId} className="rm-type-group">
                <RoomTypeSeparator
                  name={group.name}
                  count={group.rooms.length}
                  pricePerNight={group.pricePerNight}
                />
                <div className="rm-grid">
                  {group.rooms.map((room) => (
                    <RoomCard key={room.id} room={room} />
                  ))}
                </div>
              </section>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      ) : (
        <>
          <div className="rm-table-wrap">
            <table className="rm-table">
              <thead>
                <tr>
                  <th>Photo</th>
                  <th>
                    <SortButton
                      label="Room"
                      active={sortKey === 'roomNumber'}
                      dir={sortDir}
                      onClick={() => toggleSort('roomNumber')}
                    />
                  </th>
                  <th>
                    <SortButton
                      label="Type"
                      active={sortKey === 'name'}
                      dir={sortDir}
                      onClick={() => toggleSort('name')}
                    />
                  </th>
                  <th>
                    <SortButton
                      label="Price / Night"
                      active={sortKey === 'pricePerNight'}
                      dir={sortDir}
                      onClick={() => toggleSort('pricePerNight')}
                    />
                  </th>
                  <th>
                    <SortButton
                      label="Occupancy"
                      active={sortKey === 'maxOccupancy'}
                      dir={sortDir}
                      onClick={() => toggleSort('maxOccupancy')}
                    />
                  </th>
                  <th>Inclusions</th>
                  <th>
                    <SortButton
                      label="Status"
                      active={sortKey === 'status'}
                      dir={sortDir}
                      onClick={() => toggleSort('status')}
                    />
                  </th>
                  <th className="rm-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.roomTypeId}>
                    <tr className="rm-type-sep-row">
                      <td colSpan={8}>
                        <RoomTypeSeparator
                          name={group.name}
                          count={group.rooms.length}
                          pricePerNight={group.pricePerNight}
                        />
                      </td>
                    </tr>
                    {group.rooms.map((room) => (
                      <tr key={room.id} className="rm-row">
                        <td>
                          {room.images[0] ? (
                            <ZoomableImage
                              src={room.images[0]}
                              alt={`Room ${room.roomNumber} · ${room.name}`}
                              images={room.images}
                              className="rm-thumb-zoom"
                            />
                          ) : (
                            <div className="rm-thumb rm-thumb-empty">No photo</div>
                          )}
                        </td>
                        <td>
                          <a className="rm-title-link" href={`/Rooms/Details/${room.id}`}>
                            <div className="rm-title">Room {room.roomNumber}</div>
                          </a>
                          {room.description ? (
                            <div className="rm-muted rm-clamp">{room.description}</div>
                          ) : (
                            <div className="rm-muted">Tap details for full info</div>
                          )}
                        </td>
                        <td>
                          <div className="rm-title">{room.name}</div>
                        </td>
                        <td>
                          <div className="rm-price">{formatMoney(room.pricePerNight)}</div>
                          <div className="rm-muted">per night</div>
                        </td>
                        <td>
                          <div>{room.maxOccupancy} guests</div>
                          <div className="rm-muted">{room.bedCount} bed(s)</div>
                        </td>
                        <td>
                          {room.inclusions.length ? (
                            <div className="rm-chip-row">
                              {room.inclusions.slice(0, 3).map((inclusion) => (
                                <span key={inclusion} className="rm-mini-chip">
                                  {inclusion}
                                </span>
                              ))}
                              {room.inclusions.length > 3 ? (
                                <span className="rm-muted">+{room.inclusions.length - 3}</span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="rm-muted">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`rm-pill ${room.status === 'Available' ? 'is-available' : 'is-unavailable'}`}>
                            {room.status}
                          </span>
                        </td>
                        <td className="rm-col-actions">
                          <div className="rm-actions">
                            <DetailsIconLink href={`/Rooms/Details/${room.id}`} />
                            <EditIconLink href={`/Rooms/Edit/${room.id}`} />
                            <DeleteIconLink href={`/Rooms/Delete/${room.id}`} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
