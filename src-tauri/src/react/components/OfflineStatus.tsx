import { useEffect, useState } from 'react'

export default function OfflineStatus() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const markOnline = () => setOnline(true)
    const markOffline = () => setOnline(false)
    window.addEventListener('online', markOnline)
    window.addEventListener('offline', markOffline)
    return () => {
      window.removeEventListener('online', markOnline)
      window.removeEventListener('offline', markOffline)
    }
  }, [])

  if (online) return null
  return (
    <div className="offline-status" role="status">
      Offline · Showing cached data when available
    </div>
  )
}
