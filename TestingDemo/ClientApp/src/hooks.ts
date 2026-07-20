import { useEffect, useMemo, useState } from 'react'
import type { SortDir } from './types'

export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

export function useSortState<TKey extends string>(defaultKey: TKey, defaultDir: SortDir = 'asc') {
  const [sortKey, setSortKey] = useState<TKey>(defaultKey)
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir)

  const toggleSort = (key: TKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  return { sortKey, sortDir, toggleSort }
}

export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))

  useEffect(() => {
    setPage(1)
  }, [items.length, pageSize])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, page, pageSize])

  return {
    page,
    setPage,
    totalPages,
    pageItems,
    total: items.length,
    pageSize,
  }
}

export function compareValues(a: string | number | boolean | null | undefined, b: string | number | boolean | null | undefined, dir: SortDir) {
  const av = a ?? ''
  const bv = b ?? ''
  let result = 0

  if (typeof av === 'number' && typeof bv === 'number') {
    result = av - bv
  } else if (typeof av === 'boolean' && typeof bv === 'boolean') {
    result = Number(av) - Number(bv)
  } else {
    result = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
  }

  return dir === 'asc' ? result : -result
}
