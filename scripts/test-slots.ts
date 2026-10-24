import assert from 'node:assert/strict'
import { generateSlots, isWithinWorkingHours } from '../lib/booking/slots'

const hours = {
  mon: { open: '10:00', close: '11:00' },
  sun: null,
}
const now = new Date('2026-10-18T00:00:00.000Z')

const fitsUntilClosing = generateSlots({ date: '2026-10-19', timezone: 'Asia/Kolkata', durationMinutes: 30, workingHours: hours, bookings: [], now })
assert.equal(fitsUntilClosing.length, 3)
assert.equal(fitsUntilClosing.at(-1), '2026-10-19T05:00:00.000Z')
assert.equal(isWithinWorkingHours(new Date('2026-10-19T04:30:00.000Z'), new Date('2026-10-19T05:00:00.000Z'), 'Asia/Kolkata', hours), true)
assert.equal(isWithinWorkingHours(new Date('2026-10-19T05:15:00.000Z'), new Date('2026-10-19T05:45:00.000Z'), 'Asia/Kolkata', hours), false)

assert.deepEqual(generateSlots({ date: '2026-10-18', timezone: 'Asia/Kolkata', durationMinutes: 30, workingHours: hours, bookings: [], now }), [])
assert.equal(isWithinWorkingHours(new Date('2026-10-18T04:30:00.000Z'), new Date('2026-10-18T05:00:00.000Z'), 'Asia/Kolkata', hours), false)

const blocked = generateSlots({
  date: '2026-10-19', timezone: 'Asia/Kolkata', durationMinutes: 30, workingHours: hours, now,
  bookings: [{ starts_at: '2026-10-19T04:30:00.000Z', ends_at: '2026-10-19T05:00:00.000Z' }],
})
assert.ok(!blocked.includes('2026-10-19T04:15:00.000Z'))
assert.ok(blocked.includes('2026-10-19T05:00:00.000Z'))

const excludesPast = generateSlots({ date: '2026-10-19', timezone: 'Asia/Kolkata', durationMinutes: 30, workingHours: hours, bookings: [], now: new Date('2026-10-19T04:30:00.000Z') })
assert.ok(!excludesPast.includes('2026-10-19T04:15:00.000Z'))
console.log('Booking slot tests passed.')