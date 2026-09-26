import { useEffect, useMemo, useState } from 'react'
import { setRoomTypeOpen } from '../api'
import { formatMoney } from '../format'
import { compareValues, useDebouncedValue, usePagination, useSortState } from '../hooks'
import { notifyMori } from '../moriNotice'
import type { RoomTypeSummary, TypeSortKey } from '../types'
import { DeleteIconLink, EditIconLink } from './ActionIcons'
import { ZoomableImage } from './PhotoZoom'
import { Pagination } from './Pagination'
import { SkeletonRows } from './Skeleton'
import { Toolbar } from './Toolbar'

type Props = {
  data: RoomTypeSummary[]
  loading: boolean
  error: string | null
  canManage?: boolean
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

export function RoomTypesPanel({ data, loading, error, canManage = true }: Props) {
  const [search, setSearch] = useState('')
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const debouncedSearch = useDebouncedValue(search)
  const { sortKey, sortDir, toggleSort } = useSortState<TypeSortKey>('name')

  const toggleType = async (item: RoomTypeSummary) => {
    const opening = item.availableCount === 0
    setTogglingId(item.roomTypeId)
    try {
      const result = await setRoomTypeOpen(item.roomTypeId, opening)
      notifyMori(
        opening
          ? `${result.typeName} is open — ${result.changedCount} room(s) bookable again.`
          : `${result.typeName} is closed — no longer bookable online.`,
        'success',
      )
      window.dispatchEvent(
        new CustomEvent('mori:admin-refresh', { detail: { scopes: ['rooms'] } }),
      )
    } catch (err) {
      notifyMori(err instanceof Error ? err.message : 'Could not update the room type.', 'error')
    } finally {
      setTogglingId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const base = !q
      ? data
      : data.filter((item) => {
          const haystack = [
            item.name,
            item.description ?? '',
            item.inclusions.join(' '),
            String(item.pricePerNight),
          ]
            .join(' ')
            .toLowerCase()
          return haystack.includes(q)
        })

    return [...base].sort((a, b) => compareValues(a[sortKey], b[sortKey], sortDir))
  }, [data, debouncedSearch, sortKey, sortDir])

  const { page, setPage, totalPages, pageItems, total } = usePagination(filtered, 8)

  useEffect(() => {
    if (error) notifyMori(error, 'error')
  }, [error])

  if (loading) {
    return <SkeletonRows rows={6} />
  }

  if (error) {
    return <div className="rm-empty">Room types could not be loaded. Try refreshing the page.</div>
  }

  return (
    <div className="rm-panel">
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search by type, inclusion, description…"
        resultCount={filtered.length}
        totalCount={data.length}
      />

      {filtered.length === 0 ? (
        <div className="rm-empty">No room types match your search.</div>
      ) : (
        <>
          <div className="rm-table-wrap">
            <table className="rm-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>
                    <SortButton
                      label="Room Type"
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
                  <th>
                    <SortButton
                      label="Rooms"
                      active={sortKey === 'roomCount'}
                      dir={sortDir}
                      onClick={() => toggleSort('roomCount')}
                    />
                  </th>
                  <th>
                    <SortButton
                      label="Available"
                      active={sortKey === 'availableCount'}
                      dir={sortDir}
                      onClick={() => toggleSort('availableCount')}
                    />
                  </th>
                  <th>Inclusions</th>
                  {canManage ? <th>Booking</th> : null}
                  {canManage ? <th className="rm-col-actions">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => (
                  <tr key={item.roomTypeId} className="rm-row">
                    <td>
                      {item.images[0] ? (
                        <ZoomableImage
                          src={item.images[0]}
                          alt={item.name}
                          images={item.images}
                          className="rm-thumb-zoom"
                        />
                      ) : (
                        <div className="rm-thumb rm-thumb-empty">No photo</div>
                      )}
                    </td>
                    <td>
                      <div className="rm-title">{item.name}</div>
                      {item.description ? (
                        <div className="rm-muted rm-clamp">{item.description}</div>
                      ) : null}
                    </td>
                    <td>{formatMoney(item.pricePerNight)}</td>
                    <td>
                      {item.maxOccupancy} guests / {item.bedCount} bed(s)
                    </td>
                    <td>{item.roomCount}</td>
                    <td>
                      <span className="rm-pill">
                        {item.availableCount} / {item.roomCount} open
                      </span>
                    </td>
                    <td>
                      <div className="rm-clamp">
                        {item.inclusions.length ? item.inclusions.join(', ') : '—'}
                      </div>
                    </td>
                    {canManage ? (
                    <td>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={item.availableCount > 0}
                        aria-label={`${item.name} — guest booking availability`}
                        className={`rm-switch ${item.availableCount > 0 ? 'is-on' : ''}`}
                        disabled={
                          togglingId === item.roomTypeId ||
                          (item.availableCount > 0 && item.occupiedCount > 0)
                        }
                        title={
                          item.availableCount > 0 && item.occupiedCount > 0
                            ? `Cannot close — ${item.occupiedCount} room(s) still have guests inside. Check them out first.`
                            : item.availableCount > 0
                              ? 'Stop new bookings for this room type'
                              : 'Reopen this room type for bookings'
                        }
                        onClick={() => void toggleType(item)}
                      >
                        <span className="rm-switch-track" aria-hidden="true">
                          <span className="rm-switch-thumb" />
                        </span>
                        <span className="rm-switch-label">
                          {item.availableCount > 0 ? 'Open' : 'Closed'}
                        </span>
                      </button>
                    </td>
                    ) : null}
                    {canManage ? (
                    <td className="rm-col-actions">
                      <div className="rm-actions">
                        <EditIconLink href={`/Rooms/EditType/${item.roomTypeId}`} />
                        <DeleteIconLink href={`/Rooms/DeleteType/${item.roomTypeId}`} />
                      </div>
                    </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          <div className="rm-sr-only">{total} results</div>
        </>
      )}
    </div>
  )
}
