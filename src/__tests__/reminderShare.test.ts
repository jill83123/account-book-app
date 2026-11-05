import { beforeEach, describe, expect, it, vi } from 'vitest'

const writes: string[] = []
vi.mock('@/lib/google/sheets', () => ({
  batchUpdate: vi.fn(),
  clearValues: vi.fn(),
  createFolder: vi.fn(),
  createSpreadsheet: vi.fn(),
  findFolder: vi.fn(),
  findSpreadsheet: vi.fn(),
  getInfo: vi.fn(),
  getParents: vi.fn(),
  getRootId: vi.fn(),
  moveToFolder: vi.fn(),
  readValues: vi.fn(),
  SheetsAuthError: class extends Error {},
  SheetsNotFoundError: class extends Error {},
  writeRange: vi.fn(async (_t: string, _i: string, _r: string, v: string[][]) => {
    writes.push(String(v[0]![0]))
  }),
  writeValues: vi.fn(),
}))
vi.mock('@/lib/google/imageSync', () => ({ syncImages: vi.fn() }))

import { shareReminder } from '@/lib/google/syncEngine'

const me = { deviceId: 'phone', time: '21:00', timeAt: 0, on: false }

describe('shareReminder', () => {
  beforeEach(() => {
    writes.length = 0
  })

  it('learns that another device has the reminder on', async () => {
    const raw = JSON.stringify({ time: '21:00', timeAt: 0, devices: { laptop: { on: true } } })
    const r = await shareReminder('t', 'id', raw, me)
    expect(r.onElsewhere).toBe(true)
    // this device registered itself as off
    expect(JSON.parse(writes[0]!).devices.phone).toEqual({ on: false })
  })

  it('ignores its own entry when looking for other devices', async () => {
    const raw = JSON.stringify({ devices: { phone: { on: true } } })
    const r = await shareReminder('t', 'id', raw, { ...me, on: true })
    expect(r.onElsewhere).toBe(false)
    expect(writes).toHaveLength(0)
  })

  it('takes the newer time from the sheet', async () => {
    const raw = JSON.stringify({ time: '20:00', timeAt: 500, devices: {} })
    const r = await shareReminder('t', 'id', raw, { ...me, timeAt: 100 })
    expect(r).toMatchObject({ time: '20:00', timeAt: 500 })
  })

  it('writes this device\'s newer time to the sheet', async () => {
    const raw = JSON.stringify({ time: '20:00', timeAt: 100, devices: { phone: { on: false } } })
    const r = await shareReminder('t', 'id', raw, { ...me, time: '22:30', timeAt: 900 })
    expect(r).toMatchObject({ time: '22:30', timeAt: 900 })
    expect(JSON.parse(writes[0]!)).toMatchObject({ time: '22:30', timeAt: 900 })
  })

  it('copes with an empty or broken cell', async () => {
    expect((await shareReminder('t', 'id', '', me)).onElsewhere).toBe(false)
    expect((await shareReminder('t', 'id', '{oops', me)).onElsewhere).toBe(false)
  })
})
