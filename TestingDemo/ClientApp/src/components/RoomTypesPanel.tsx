import { useMemo, useState } from 'react'
import { formatMoney } from '../format'
import { compareValues, useDebouncedValue, usePagination, useSortState } from '../hooks'
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

export function RoomTypesPanel({ data, loading, error }: Props) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const { sortKey, sortDir, toggleSort } = useSortState<TypeSortKey>('name')

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

  if (loading) {
    return <SkeletonRows rows={6} />
  }

  if (error) {
    return <div className="rm-alert">{error}</div>
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
                  <th className="rm-col-actions">Actions</th>
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
                      {item.sizeSqm != null ? (
                        <div className="rm-muted">{item.sizeSqm} sqm</div>
                      ) : null}
                    </td>
                    <td>{item.roomCount}</td>
                    <td>
                      <span className="rm-pill">{item.availableCount} available</span>
                    </td>
                    <td>
                      <div className="rm-clamp">
                        {item.inclusions.length ? item.inclusions.join(', ') : '—'}
                      </div>
                    </td>
                    <td className="rm-col-actions">
                      <div className="rm-actions">
                        <EditIconLink href={`/Rooms/EditType/${item.roomTypeId}`} />
                        <DeleteIconLink href={`/Rooms/DeleteType/${item.roomTypeId}`} />
                      </div>
                    </td>
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
