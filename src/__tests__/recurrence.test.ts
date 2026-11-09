import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import type { Recurring } from '@/db/types'
import {
  autoPostDue,
  buildRecord,
  isFinished,
  lineName,
  nextDue,
  occurrenceDate,
  pendingOccurrences,
  repeatLabel,
  resolveOccurrence,
  splitInstallmentPeriods,
} from '@/lib/recurrence'
import { addDays, today } from '@/lib/date'
import { line } from './helpers'

const rule = (extra: Partial<Recurring> = {}): Recurring => ({
  id: 'rule1',
  name: 'rent',
  kind: 'recurring',
  template: { type: 'expense', accountId: 'a1', ledgerId: 'L1', lines: [line(100)] },
  freq: 'monthly',
  interval: 1,
  startDate: '2026-01-31',
  generated: 0,
  autoPost: true,
  active: true,
  updatedAt: 1,
  ...extra,
})

describe('occurrenceDate', () => {
  it('monthly counts from the start date, no drift after short months', () => {
    expect(occurrenceDate(rule(), 0)).toBe('2026-01-31')
    expect(occurrenceDate(rule(), 1)).toBe('2026-02-28')
    expect(occurrenceDate(rule(), 2)).toBe('2026-03-31')
  })
  it('daily / weekly / yearly with interval', () => {
    expect(occurrenceDate(rule({ freq: 'daily', interval: 3, startDate: '2026-01-01' }), 2)).toBe('2026-01-07')
    expect(occurrenceDate(rule({ freq: 'weekly', startDate: '2026-01-01' }), 2)).toBe('2026-01-15')
    expect(occurrenceDate(rule({ freq: 'yearly', startDate: '2024-02-29' }), 1)).toBe('2025-02-28')
  })
})

describe('nextDue / isFinished / repeatLabel', () => {
  it('paused, count reached, past endDate', () => {
    expect(nextDue(rule({ active: false }))).toBeNull()
    expect(nextDue(rule({ count: 2, generated: 2 }))).toBeNull()
    expect(isFinished(rule({ count: 2, generated: 2 }))).toBe(true)
    expect(nextDue(rule({ endDate: '2026-01-15' }))).toBeNull()
    expect(nextDue(rule())).toBe('2026-01-31')
  })
  it('labels', () => {
    expect(repeatLabel({ freq: 'monthly', interval: 1 })).toBe('每月')
    expect(repeatLabel({ freq: 'weekly', interval: 2 })).toBe('每 2 週')
  })
})

describe('buildRecord', () => {
  it('has a deterministic id so two devices never duplicate', () => {
    const r = buildRecord(rule(), 2)
    expect(r.id).toBe('rc-rule1-2')
    expect(r.date).toBe('2026-03-31')
    expect(r.total).toBe(100)
    expect(r.recurringId).toBe('rule1')
  })
  it('installments split the total and add the fee line', () => {
    const r = rule({ kind: 'installment', installment: { total: 1000, periods: 3, fee: 15 } })
    const last = buildRecord(r, 2)
    expect(last.lines[0]!.amount).toBe(334)
    expect(last.lines[0]!.name).toBe('rent')
    expect(last.lines[0]!.period).toEqual({ n: 3, of: 3 })
    expect(lineName(last.lines[0]!)).toBe('rent (3/3)')
    expect(last.lines[1]!.amount).toBe(15)
    expect(last.total).toBe(349)
    const sum = [0, 1, 2].reduce((s, n) => s + buildRecord(r, n).lines[0]!.amount, 0)
    expect(sum).toBe(1000)
  })
  it('transfer has no lines and takes the template amount', () => {
    const r = buildRecord(
      rule({ template: { type: 'transfer', accountId: 'a1', toAccountId: 'a2', ledgerId: 'L1', lines: [line(500)] } }),
      0,
    )
    expect(r.lines).toEqual([])
    expect(r.total).toBe(500)
  })
})

describe('pendingOccurrences', () => {
  it('lists due confirm-first occurrences in date order, skipping auto-post and paused', () => {
    const p = pendingOccurrences(
      [
        rule({ autoPost: false }),
        rule({ id: 'auto', autoPost: true }),
        rule({ id: 'off', autoPost: false, active: false }),
      ],
      '2026-03-31',
    )
    expect(p.map((x) => x.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
    expect(p.every((x) => x.rule.id === 'rule1')).toBe(true)
  })
})

describe('db-backed posting', () => {
  beforeEach(async () => {
    await db.records.clear()
    await db.recurrings.clear()
  })

  it('autoPostDue posts everything due once, and is idempotent', async () => {
    await db.recurrings.put(rule({ freq: 'daily', startDate: addDays(today(), -2) }))
    expect(await autoPostDue()).toBe(3)
    expect(await db.records.count()).toBe(3)
    expect((await db.recurrings.get('rule1'))!.generated).toBe(3)
    expect(await autoPostDue()).toBe(0)
    expect(await db.records.count()).toBe(3)
  })

  it('does not resurrect a record that was deleted', async () => {
    const r = rule({ freq: 'daily', startDate: addDays(today(), -1) })
    await db.recurrings.put(r)
    await db.records.put({ ...buildRecord(r, 0), deleted: true })
    expect(await autoPostDue()).toBe(1) // only today's; yesterday's tombstone stays
    expect((await db.records.get('rc-rule1-0'))!.deleted).toBe(true)
  })

  it('resolveOccurrence: post moves on with a record, skip moves on without', async () => {
    await db.recurrings.put(rule({ autoPost: false }))
    const [p0] = pendingOccurrences([(await db.recurrings.get('rule1'))!], '2026-12-31')
    await resolveOccurrence(p0!, true)
    expect(await db.records.count()).toBe(1)
    const [p1] = pendingOccurrences([(await db.recurrings.get('rule1'))!], '2026-12-31')
    expect(p1!.n).toBe(1)
    await resolveOccurrence(p1!, false)
    expect(await db.records.count()).toBe(1)
    expect((await db.recurrings.get('rule1'))!.generated).toBe(2)
    // a stale pending (already handled) is ignored
    await resolveOccurrence(p0!, true)
    expect((await db.recurrings.get('rule1'))!.generated).toBe(2)
  })
})

describe('splitInstallmentPeriods', () => {
  it('moves the period out of an old installment name, once', async () => {
    await Promise.all([db.recurrings.clear(), db.records.clear()])
    await db.recurrings.add(rule({ id: 'p1', name: '手機分期', kind: 'installment', installment: { total: 1200, periods: 12, fee: 0 } }))
    await db.records.add({ ...buildRecord(rule({ id: 'p1' }), 0), id: 'r1', recurringId: 'p1', lines: [{ ...line(100), name: '手機分期（3 / 12）' }] })
    await splitInstallmentPeriods()
    const once = (await db.records.get('r1'))!
    expect(once.lines[0]!.name).toBe('手機分期')
    expect(once.lines[0]!.period).toEqual({ n: 3, of: 12 })
    await splitInstallmentPeriods()
    expect((await db.records.get('r1'))!.updatedAt).toBe(once.updatedAt)
  })
})
