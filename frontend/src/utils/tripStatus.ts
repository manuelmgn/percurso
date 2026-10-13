// Trip lifecycle status, derived from its calendar dates (the API has no
// explicit status field): planned (start in the future), in progress, or
// completed (end in the past).
export type TripStatus = 'planeada' | 'em_curso' | 'concluida'

function localDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function getTripStatus(startDate: string, endDate: string, today = new Date()): TripStatus {
  const todayStr = localDateString(today)
  if (endDate < todayStr) return 'concluida'
  if (startDate > todayStr) return 'planeada'
  return 'em_curso'
}
