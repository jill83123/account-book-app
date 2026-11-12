import { describe, expect, it } from 'vitest'
import { mergeReminder } from '@/lib/google/syncEngine'

const me = { deviceId: 'phone', time: '21:00', timeAt: 0, on: false }

describe('mergeReminder', () => {
  it('learns that another device has the reminder on', () => {
    const r = mergeReminder({ time: '21:00', timeAt: 0, devices: { laptop: { on: true } } }, me)
    expect(r.result.onElsewhere).toBe(true)
    // this device registered itself as off
    expect(r.changed).toBe(true)
    expect(r.share.devices?.phone).toEqual({ on: false })
  })

  it('ignores its own entry when looking for other devices', () => {
    const r = mergeReminder({ devices: { phone: { on: true } } }, { ...me, on: true })
    expect(r.result.onElsewhere).toBe(false)
    expect(r.changed).toBe(false)
  })

  it('takes the newer time from the cloud', () => {
    const r = mergeReminder({ time: '20:00', timeAt: 500, devices: {} }, { ...me, timeAt: 100 })
    expect(r.result).toMatchObject({ time: '20:00', timeAt: 500 })
  })

  it("writes this device's newer time to the cloud", () => {
    const r = mergeReminder({ time: '20:00', timeAt: 100, devices: { phone: { on: false } } }, { ...me, time: '22:30', timeAt: 900 })
    expect(r.result).toMatchObject({ time: '22:30', timeAt: 900 })
    expect(r.share).toMatchObject({ time: '22:30', timeAt: 900 })
    expect(r.changed).toBe(true)
  })

  it('copes with an empty share', () => {
    expect(mergeReminder({}, me).result.onElsewhere).toBe(false)
  })
})
