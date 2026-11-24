const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function getWeekStartDate(anchorDate: string, weekStartsOn: number): string {
  const anchor = new Date(`${anchorDate}T00:00:00Z`)
  if (Number.isNaN(anchor.getTime())) return anchorDate
  const isoDay = anchor.getUTCDay() === 0 ? 7 : anchor.getUTCDay()
  const difference = ((isoDay - weekStartsOn + 7) % 7)
  anchor.setUTCDate(anchor.getUTCDate() - difference)
  return anchor.toISOString().slice(0, 10)
}

export function getWeekEndDate(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 7)
  return date.toISOString().slice(0, 10)
}

export function getWeekdayName(weekStartsOn: number): string {
  return weekdays[((weekStartsOn - 1 + 7) % 7)] ?? 'Monday'
}

export function escapeCsv(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
