export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rm-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rm-skeleton-row" />
      ))}
    </div>
  )
}
