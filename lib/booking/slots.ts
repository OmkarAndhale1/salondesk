export interface WorkingHours {
  [day: string]: { open: string; close: string } | null | undefined
}

export interface BusyInterval {
  starts_at: string
  ends_at: string
}

export interface SlotOptions {
  date: string
  timezone: string
  durationMinutes: number
  workingHours: WorkingHours
  bookings: BusyInterval[]
  now?: Date
  intervalMinutes?: number
}

const weekdayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function partsAt(date: Date, timezone: string) {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(values.map((part) => [part.type, part.value]))
}

export function localDateTimeToUtc(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const target = Date.UTC(year, month - 1, day, hour, minute)
  let result = target
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = partsAt(new Date(result), timezone)
    const observed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
    result += target - observed
  }
  return new Date(result)
}

export function isWithinWorkingHours(
  startsAt: Date,
  endsAt: Date,
  timezone: string,
  workingHours: WorkingHours,
) {
  if (endsAt <= startsAt) return false
  const localParts = partsAt(startsAt, timezone)
  const date = `${localParts.year}-${localParts.month}-${localParts.day}`
  const hours = workingHours[weekday(date)]
  if (!hours || !/^\d{2}:\d{2}$/.test(hours.open) || !/^\d{2}:\d{2}$/.test(hours.close)) return false
  const open = localDateTimeToUtc(date, hours.open, timezone).getTime()
  const close = localDateTimeToUtc(date, hours.close, timezone).getTime()
  return startsAt.getTime() >= open && endsAt.getTime() <= close
}

function weekday(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return weekdayKeys[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
}

export function generateSlots(options: SlotOptions): string[] {
  const { date, timezone, durationMinutes, workingHours, bookings } = options
  const intervalMinutes = options.intervalMinutes ?? 15
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(durationMinutes) || durationMinutes < 1 || intervalMinutes < 1) return []

  const hours = workingHours[weekday(date)]
  if (!hours || !/^\d{2}:\d{2}$/.test(hours.open) || !/^\d{2}:\d{2}$/.test(hours.close)) return []
  const open = localDateTimeToUtc(date, hours.open, timezone).getTime()
  const close = localDateTimeToUtc(date, hours.close, timezone).getTime()
  const durationMs = durationMinutes * 60_000
  const stepMs = intervalMinutes * 60_000
  const now = options.now?.getTime() ?? Date.now()

  return Array.from({ length: Math.max(0, Math.ceil((close - open) / stepMs)) }, (_, index) => open + index * stepMs)
    .filter((start) => start >= now && start + durationMs <= close)
    .filter((start) => bookings.every((booking) => {
      const busyStart = new Date(booking.starts_at).getTime()
      const busyEnd = new Date(booking.ends_at).getTime()
      return start + durationMs <= busyStart || start >= busyEnd
    }))
    .map((start) => new Date(start).toISOString())
}