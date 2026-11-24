type Props = {
  rows?: number
  label?: string
}

export default function LoadingSkeleton({ rows = 3, label = 'Loading content' }: Props) {
  return (
    <div className="loading-skeleton" role="status" aria-label={label} aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <span className="loading-skeleton-row" key={index} />
      ))}
    </div>
  )
}
