const weekdayNumbers: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

export function getDateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value
  const year = part('year')
  const month = part('month')
  const day = part('day')
  if (!year || !month || !day) {
    throw new Error('Could not determine the current date in the team timezone.')
  }
  return `${year}-${month}-${day}`
}

export function getUpcomingServiceDate(
  now: Date,
  timeZone: string,
  serviceDay: number,
  cutoffTime: string,
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value
  const year = Number(part('year'))
  const month = Number(part('month'))
  const day = Number(part('day'))
  const hour = Number(part('hour'))
  const minute = Number(part('minute'))
  const currentDay = weekdayNumbers[part('weekday') ?? '']
  const cutoffParts = cutoffTime.split(':').map(Number)
  const cutoffHour = cutoffParts[0] ?? Number.NaN
  const cutoffMinute = cutoffParts[1] ?? Number.NaN
  if (!year || !month || !day || !currentDay) {
    throw new Error('Could not determine the current date in the team timezone.')
  }
  if (
    !Number.isInteger(serviceDay) ||
    serviceDay < 1 ||
    serviceDay > 7 ||
    !Number.isInteger(cutoffHour) ||
    cutoffHour < 0 ||
    cutoffHour > 23 ||
    !Number.isInteger(cutoffMinute) ||
    cutoffMinute < 0 ||
    cutoffMinute > 59
  ) {
    throw new Error('Team service settings contain an invalid day or cutoff time.')
  }
  let daysAhead = (serviceDay - currentDay + 7) % 7
  if (
    daysAhead === 0 &&
    hour * 60 + minute >= cutoffHour * 60 + cutoffMinute
  ) {
    daysAhead = 7
  }
  const serviceDate = new Date(Date.UTC(year, month - 1, day + daysAhead))
  return [
    serviceDate.getUTCFullYear(),
    String(serviceDate.getUTCMonth() + 1).padStart(2, '0'),
    String(serviceDate.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

export function hasDuplicateSong(songIds: string[], candidateId: string): boolean {
  return songIds.includes(candidateId)
}
