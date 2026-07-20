type ToolbarProps = {
  search: string
  onSearchChange: (value: string) => void
  placeholder: string
  resultCount: number
  totalCount: number
}

export function Toolbar({
  search,
  onSearchChange,
  placeholder,
  resultCount,
  totalCount,
}: ToolbarProps) {
  return (
    <div className="rm-toolbar">
      <label className="rm-search">
        <span className="rm-search-label">Search</span>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          aria-label="Search rooms"
        />
      </label>
      <div className="rm-result-count" aria-live="polite">
        Showing <strong>{resultCount}</strong> of {totalCount}
      </div>
    </div>
  )
}
