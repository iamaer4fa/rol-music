import type { ReactNode } from 'react'

type Props = {
  tone: 'success' | 'warning' | 'error'
  children: ReactNode
}

export default function StatusMessage({ tone, children }: Props) {
  return (
    <p className={`status-message status-message-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}
