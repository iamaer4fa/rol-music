import type { ReactNode } from 'react'

type Props = {
  title: string
  children?: ReactNode
}

export default function EmptyState({ title, children }: Props) {
  return (
    <div className="empty-state" role="status">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  )
}
