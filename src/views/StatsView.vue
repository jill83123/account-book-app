<script lang="ts">
/**
 * What the page was showing, kept while the app is open: going into a category or another page and coming back
 * lands on the same sub-page, period and income/expense side instead of starting over.
 */
const remembered = {
  tab: 'stats' as 'stats' | 'budget' | 'items',
  mode: 'month' as 'month' | 'year' | 'range',
  flow: 'expense' as 'expense' | 'income',
  month: '',
  year: '',
  rangeFrom: '',
  rangeTo: '',
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { byCategory, toEntries, type CatTotal, type Entry } from '@/lib/calc'
import { addYm, daysBetween, today, ym } from '@/lib/date'
import { fmt } from '@/lib/money'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { ChevronDown, Inbox } from '@/lib/uiIcons'
import BudgetSheet from '@/components/BudgetSheet.vue'
import CatIcon from '@/components/CatIcon.vue'
import DateField from '@/components/DateField.vue'
import DonutChart from '@/components/DonutChart.vue'
import MonthNav from '@/components/MonthNav.vue'
import LedgerPickSheet from '@/components/LedgerPickSheet.vue'
import PickSheet from '@/components/PickSheet.vue'
import PillTabs from '@/components/PillTabs.vue'
import RecordList from '@/components/RecordList.vue'
import { budgetIn, monthsOfYear, type Budgeted } from '@/lib/budget'

const router = useRouter()
const data = useData()
const { s } = useSettings()
const ui = useUi()

const tab = ref(remembered.tab)
type Mode = 'month' | 'year' | 'range'
const mode = ref<Mode>(remembered.mode)
const modeSheet = ref(false)
const modeItems: { value: Mode; label: string }[] = [
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
  { value: 'range', label: '自訂' },
]
// the custom range: from the first of this month to today until changed
const rangeFrom = ref(remembered.rangeFrom || `${ym(today())}-01`)
const rangeTo = ref(remembered.rangeTo || today())
/** both ends, whichever order they were picked in */
const range = computed(() =>
  rangeFrom.value <= rangeTo.value ? [rangeFrom.value, rangeTo.value] : [rangeTo.value, rangeFrom.value],
)
const flow = ref(remembered.flow)
const month = ref(remembered.month || ym(today()))
const year = ref(remembered.year || today().slice(0, 4))
watch([tab, mode, flow, month, year, rangeFrom, rangeTo], () =>
  Object.assign(remembered, {
    tab: tab.value,
    mode: mode.value,
    flow: flow.value,
    month: month.value,
    year: year.value,
    rangeFrom: rangeFrom.value,
    rangeTo: rangeTo.value,
  }),
)
const expandedId = ref('')
/** the category whose record list is open in full; the others show the first few */
const allShown = ref('')
/** the item (in the 內容 list) whose records are open */
const openItem = ref('')
const ledgerSheet = ref(false)
const modeLabel = computed(() => modeItems.find((m) => m.value === mode.value)?.label ?? '')
const sortBy = ref<'amount' | 'count'>('amount')

const period = computed({
  get: () => (mode.value === 'year' ? year.value : month.value),
  set: (v: string) => (mode.value === 'year' ? (year.value = v) : (month.value = v)),
})

const allEntries = computed(() => {
  const recs = data.ledgerId ? data.records.filter((r) => r.ledgerId === data.ledgerId) : data.records
  return toEntries(recs, s.amortize)
})
const entries = computed(() => {
  const all = allEntries.value
  if (mode.value === 'range') return all.filter((e) => e.date >= range.value[0]! && e.date <= range.value[1]!)
  const p = period.value
  return all.filter((e) => e.ym.startsWith(p))
})

const incomeTotal = computed(() => entries.value.filter((e) => e.type === 'income').reduce((n, e) => n + e.amount, 0))
const expenseTotal = computed(() => entries.value.filter((e) => e.type === 'expense').reduce((n, e) => n + e.amount, 0))
const shown = computed(() => entries.value.filter((e) => e.type === flow.value))
const shownTotal = computed(() => (flow.value === 'income' ? incomeTotal.value : expenseTotal.value))

const tops = computed(() => byCategory(shown.value, data.catMap, 'parent'))
const subsOf = (id: string): CatTotal[] =>
  byCategory(
    baseEntries.value.filter((e) => (data.catMap.get(e.categoryId)?.parentId ?? e.categoryId) === id),
    data.catMap,
    'child',
  )

/** which part of the opened category is looked at: one sub-category, one month of the chart */
const subId = ref('')
const pickMonth = ref('')
/** what the opened category is read from: the month picked in its chart, else the whole period */
const baseEntries = computed(() => (pickMonth.value ? allEntries.value.filter((e) => e.type === flow.value && e.ym === pickMonth.value) : shown.value))
/** the label of that part: which month, or the period */
const pickLabel = computed(() => {
  if (pickMonth.value) return `${Number(pickMonth.value.slice(5))} 月`
  if (mode.value === 'year') return '1-12 月'
  if (mode.value === 'month') return `${Number(month.value.slice(5))} 月`
  return '這段期間'
})
const subSum = (id: string) => subsOf(id).reduce((n, x) => n + x.total, 0)
const inCat = (e: { categoryId: string }, id: string) =>
  (data.catMap.get(e.categoryId)?.parentId ?? e.categoryId) === id && (!subId.value || e.categoryId === subId.value)
/** the records behind a category: the picked month if any, else the whole period; newest first */
function recordsOf(id: string) {
  const ids = new Set(baseEntries.value.filter((e) => inCat(e, id)).map((e) => e.recordId))
  return data.records.filter((r) => ids.has(r.id)).sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
}
/** tap a sub-category: its records show below; tap it again to see them all */
function pickSub(id: string) {
  subId.value = subId.value === id ? '' : id
  allShown.value = ''
}
function openCat(id: string) {
  expandedId.value = expandedId.value === id ? '' : id
  subId.value = ''
  pickMonth.value = ''
  trendShift.value = 0
  allShown.value = ''
}
watch(tops, (l) => {
  if (expandedId.value && !l.some((t) => t.id === expandedId.value)) expandedId.value = ''
})
watch([mode, month, year, rangeFrom, rangeTo, flow], () => {
  trendShift.value = 0
  openItem.value = ''
  subId.value = ''
  pickMonth.value = ''
})

// the ring always shows the top-level split; an opened category lists its sub-categories as bars in its own colour
// every slice is labelled; tapping one also shows its name, amount and share in the middle
const pickedId = ref('')
const picked = computed(() => tops.value.find((t) => t.id === pickedId.value))
const slices = computed(() => tops.value.map((t) => ({ id: t.id, value: t.total, color: t.color, label: t.name })))
const pickSlice = (id: string) => (pickedId.value = pickedId.value === id ? '' : id)

// the trend of one category: its total in each month of the year being looked at; a custom range shows the months it covers
const trendShift = ref(0)
const trendMonths = computed(() => {
  if (mode.value !== 'range') {
    const y = String(Number(mode.value === 'year' ? year.value : month.value.slice(0, 4)) + trendShift.value)
    return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)
  }
  const out: string[] = []
  for (let m = ym(range.value[0]!); m <= ym(range.value[1]!) && out.length < 36; m = addYm(m, 1)) out.push(m)
  return out
})
function shiftYear(n: number) {
  trendShift.value += n
  pickMonth.value = ''
}
// swiping the chart sideways does the same as the arrows: left for the next year, right for the one before
let swipeX: number | null = null
let swiped = false
function swipeDown(e: PointerEvent) {
  swipeX = e.clientX
  swiped = false
}
function swipeUp(e: PointerEvent) {
  // only a touch that began on the chart counts
  if (swipeX == null) return
  const dx = e.clientX - swipeX
  swipeX = null
  if (mode.value === 'range' || Math.abs(dx) < 40) return
  shiftYear(dx < 0 ? 1 : -1)
  swiped = true
}
const focusMonth = computed(() => pickMonth.value || (mode.value === 'month' ? month.value : ''))
function trendOf(id: string) {
  const sums = new Map<string, number>()
  for (const e of allEntries.value) {
    if (e.type !== flow.value || !inCat(e, id)) continue
    sums.set(e.ym, (sums.get(e.ym) ?? 0) + e.amount)
  }
  const bars = trendMonths.value.map((m) => ({ ym: m, total: sums.get(m) ?? 0 }))
  const max = Math.max(1, ...bars.map((x) => x.total))
  const avg = Math.round(bars.reduce((n, x) => n + x.total, 0) / bars.length)
  return { bars, max, avg }
}

const pct = (n: number) => (shownTotal.value ? Math.round((n / shownTotal.value) * 100) : 0)

/** what the 內容 list is grouped by */
const groupBy = ref<'item' | 'merchant' | 'who'>('item')
const groupLabel = computed(() => ({ item: '品項', merchant: '商家', who: '同行' })[groupBy.value])
const recById = computed(() => new Map(data.records.map((r) => [r.id, r])))
/** the row(s) an entry belongs to */
function keysOf(e: Entry): string[] {
  if (groupBy.value === 'merchant') return [(e.merchantId && data.merchantMap.get(e.merchantId)?.name) || '沒有商家']
  if (groupBy.value === 'who') {
    const who = recById.value.get(e.recordId)?.companions ?? []
    return who.length ? who.map(data.memberName) : ['自己']
  }
  return [e.name || data.catName(e.categoryId)]
}
const itemRows = computed(() => {
  const map = new Map<string, { name: string; ids: Set<string>; total: number }>()
  for (const e of shown.value) {
    for (const key of keysOf(e)) {
      const cur = map.get(key) ?? { name: key, ids: new Set<string>(), total: 0 }
      cur.ids.add(e.recordId)
      cur.total += e.amount
      map.set(key, cur)
    }
  }
  const rows = [...map.values()].map((r) => ({ name: r.name, count: r.ids.size, total: r.total }))
  return rows.sort((a, b) => (sortBy.value === 'amount' ? b.total - a.total : b.count - a.count))
})
/** the records behind one row, newest first */
function recordsOfItem(key: string) {
  const ids = new Set(shown.value.filter((e) => keysOf(e).includes(key)).map((e) => e.recordId))
  return data.records.filter((r) => ids.has(r.id)).sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
}

/** how many months of budget the period holds */
const scale = computed(() =>
  mode.value === 'year' ? 12 : mode.value === 'range' ? Math.round(((daysBetween(range.value[0]!, range.value[1]!) + 1) / 30.44) * 100) / 100 : 1,
)
/** a budget over the period: month by month with their own amounts; a custom range just scales the default */
function periodBudget(b: Budgeted): number {
  if (mode.value === 'month') return budgetIn(b, month.value)
  if (mode.value === 'year') return monthsOfYear(year.value).reduce((n, m) => n + budgetIn(b, m), 0)
  return (b.budget ?? 0) * scale.value
}
const totalBudget = computed(() => data.sortedLedgers.filter((l) => l.id === data.ledgerId).reduce((n, l) => n + periodBudget(l), 0))

// a month's budget can be changed on the spot; the default lives under 分類 and 帳本
const budgetTarget = ref<{ table: 'categories' | 'ledgers'; id: string } | null>(null)
const budgetOpen = computed({
  get: () => budgetTarget.value !== null,
  set: (v: boolean) => {
    if (!v) budgetTarget.value = null
  },
})
function editBudget(table: 'categories' | 'ledgers', id: string) {
  if (mode.value !== 'month') return ui.toast('要改某個月的預算，請先切到月檢視', 'info')
  budgetTarget.value = { table, id }
}
const budgetRows = computed(() => {
  const spent = new Map(byCategory(entries.value.filter((e) => e.type === 'expense'), data.catMap, 'parent').map((c) => [c.id, c.total]))
  return data
    .childrenOf(null, 'expense', true)
    .map((c) => ({ c, spent: spent.get(c.id) ?? 0, budget: periodBudget(c) }))
    .filter((r) => !r.c.hidden || r.budget > 0 || r.spent > 0)
    .sort((a, b) => Number(b.budget > 0) - Number(a.budget > 0))
})
/** the categories with a budget, then (set apart) those without */
const budgetGroups = computed(() =>
  [
    { label: '', rows: budgetRows.value.filter((r) => r.budget > 0) },
    { label: '沒有設定預算', rows: budgetRows.value.filter((r) => !(r.budget > 0)) },
  ].filter((g) => g.rows.length),
)
const barTone = (spent: number, budget: number) =>
  spent > budget ? 'bg-danger' : spent > budget * 0.8 ? 'bg-warn' : 'bg-primary'

</script>

<template>
  <div>
    <!-- one slim header: the ledger being looked at as the title (same as home; tap to switch), then the views and the period on a line each -->
    <header class="sticky top-0 z-20 -mx-4 bg-bg/85 px-4 backdrop-blur mb-3 grid min-h-14 grid-cols-[1fr_auto_1fr] items-center py-2">
      <span />
      <button class="relative justify-self-center text-xl font-bold tracking-tight" aria-label="切換帳本" @click="ledgerSheet = true">
        <span class="block max-w-40 truncate">{{ data.ledgerMap.get(data.ledgerId)?.name ?? '' }}</span>
        <ChevronDown :size="16" class="absolute top-1/2 left-full ml-1.5 -translate-y-1/2 text-muted" />
      </button>
      <span />
    </header>

    <PillTabs
      v-model="tab"
      size="sm"
      class="mb-3"
      :options="[
        { value: 'stats', label: '統計' },
        { value: 'budget', label: '預算' },
        { value: 'items', label: '內容' },
      ]"
    />

    <!-- the period; the small button on the right picks month, year or a custom range -->
    <div class="mb-1 flex items-center gap-2">
      <div class="min-w-0 flex-1">
        <div v-if="mode === 'range'" class="my-2 flex items-center gap-2">
          <DateField v-model="rangeFrom" title="開始日期" compact class="min-w-0 flex-1 justify-center !min-h-0 !rounded-xl !px-2 !py-2 text-sm" />
          <span class="text-muted">～</span>
          <DateField v-model="rangeTo" title="結束日期" compact class="min-w-0 flex-1 justify-center !min-h-0 !rounded-xl !px-2 !py-2 text-sm" />
        </div>
        <MonthNav v-else v-model="period" :year="mode === 'year'" />
      </div>
      <button class="inline-flex shrink-0 items-center gap-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium" aria-label="選擇期間類型" @click="modeSheet = true">
        {{ modeLabel }}<ChevronDown :size="14" class="text-muted" />
      </button>
    </div>

    <div class="mb-4 grid grid-cols-2 border-b border-line text-center">
      <button
        class="-mb-px border-b-[3px] py-3 text-[15px] font-medium"
        :class="flow === 'income' ? 'border-income text-ink' : 'border-transparent text-muted'"
        @click="flow = 'income'"
      >
        收入 ${{ fmt(incomeTotal) }}
      </button>
      <button
        class="-mb-px border-b-[3px] py-3 text-[15px] font-medium"
        :class="flow === 'expense' ? 'border-expense text-ink' : 'border-transparent text-muted'"
        @click="flow = 'expense'"
      >
        支出 ${{ fmt(expenseTotal) }}
      </button>
    </div>

    <template v-if="tab === 'stats'">
      <div v-if="tops.length" class="mb-4">
      <section class="card px-7 py-7">
        <DonutChart :slices="slices" :active-id="picked?.id" :size="176" :thickness="28" @pick="pickSlice">
          <span class="max-w-full truncate text-[clamp(0.65rem,6cqw,0.8rem)] text-muted">{{ picked ? picked.name : flow === 'income' ? '總收入' : '總支出' }}</span>
          <span class="text-[clamp(1rem,10cqw,1.5rem)] leading-tight font-bold">${{ fmt(picked ? picked.total : shownTotal) }}</span>
          <span v-if="picked" class="text-[clamp(0.65rem,6cqw,0.8rem)] text-muted">占整體 {{ pct(picked.total) }}%</span>
        </DonutChart>
      </section>
      </div>
      <p v-else class="card py-12 text-center text-sm text-muted">這段期間沒有{{ flow === 'income' ? '收入' : '支出' }}</p>

      <div v-if="tops.length">
      <div class="card divide-y divide-line p-0">
        <div v-for="t in tops" :key="t.id">
          <button class="flex w-full items-center gap-3 px-4 py-3 text-left" @click="openCat(t.id)">
            <CatIcon :icon="t.icon" :color="t.color" :size="34" />
            <span class="min-w-0 flex-1 truncate font-medium">{{ t.name }}</span>
            <span class="w-10 text-right text-xs text-muted">{{ pct(t.total) }}%</span>
            <span class="font-semibold">${{ fmt(t.total) }}</span>
            <ChevronDown :size="16" class="shrink-0 text-muted transition-transform" :class="expandedId === t.id && 'rotate-180'" />
          </button>
          <ul v-if="expandedId === t.id" class="space-y-3 bg-surface-2/60 px-4 pt-3 pb-2">
            <!-- month by month; tap a bar to see just that month below -->
            <li class="pb-1">
              <div class="mb-2 flex items-baseline justify-between text-xs text-muted">
                <span>{{ mode === 'range' ? '這段期間' : `${trendMonths[0]!.slice(0, 4)} 年` }}</span>
                <span>平均每月 ${{ fmt(trendOf(t.id).avg) }}</span>
              </div>
              <div class="flex h-24 touch-pan-y items-end gap-1" @pointerdown="swipeDown" @pointerup="swipeUp" @pointercancel="swipeX = null">
                <button
                  v-for="b in trendOf(t.id).bars"
                  :key="b.ym"
                  class="flex h-full min-w-0 flex-1 flex-col justify-end pt-3"
                  :aria-label="`${b.ym} ${b.total}`"
                  @click="!swiped && (pickMonth = pickMonth === b.ym ? '' : b.ym)"
                >
                  <!-- the top is always kept free for the label, so picking a month never changes any bar's height -->
                  <div class="flex min-h-0 flex-1 items-end">
                    <div
                      class="relative w-full rounded-t-[3px]"
                      :style="{ height: `${b.total ? Math.max(3, (b.total / trendOf(t.id).max) * 100) : 2}%`, background: t.color, opacity: !focusMonth || b.ym === focusMonth ? 1 : 0.4 }"
                    >
                      <span v-if="b.ym === focusMonth && b.total" class="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 text-[10px] leading-none font-medium whitespace-nowrap tabular-nums text-ink">{{ fmt(b.total) }}</span>
                    </div>
                  </div>
                </button>
              </div>
              <div class="mt-1 flex gap-1 text-center text-[10px] text-muted tabular-nums">
                <span v-for="b in trendOf(t.id).bars" :key="b.ym" class="min-w-0 flex-1" :class="b.ym === focusMonth && 'font-semibold text-ink'">{{ Number(b.ym.slice(5)) }}</span>
              </div>
            </li>
            <!-- sub-categories: tap one to read the records of just that one below (tap again to see all); it stays on this list -->
            <li v-if="recordsOf(t.id).length" class="mb-1 flex items-baseline justify-between pt-2 text-xs text-muted">
              <span>{{ pickLabel }}的分類</span>
              <span class="tabular-nums">${{ fmt(subSum(t.id)) }}</span>
            </li>
            <li v-for="sub in subsOf(t.id)" :key="sub.id" class="text-sm">
              <button
                class="block w-full text-left transition-opacity"
                :class="subId && subId !== sub.id && 'opacity-45'"
                :aria-pressed="subId === sub.id"
                @click="pickSub(sub.id)"
              >
                <div class="flex items-baseline gap-2">
                  <span class="min-w-0 flex-1 truncate" :class="subId === sub.id && 'font-semibold'">{{ sub.id === t.id ? '未細分' : sub.name }}</span>
                  <span class="text-xs text-muted">{{ sub.count }} 項</span>
                  <span class="w-8 text-right text-xs text-muted tabular-nums">{{ Math.round((sub.total / (subSum(t.id) || 1)) * 100) }}%</span>
                  <span class="w-14 text-right text-[13px] tabular-nums">${{ fmt(sub.total) }}</span>
                </div>
                <div class="mt-1 h-1 overflow-hidden rounded-full bg-line">
                  <div class="h-full rounded-full" :style="{ width: `${Math.max(3, (sub.total / (subSum(t.id) || 1)) * 100)}%`, background: t.color }" />
                </div>
              </button>
            </li>
            <li v-if="!recordsOf(t.id).length" class="flex items-center justify-center gap-1.5 py-5 text-xs text-muted"><Inbox :size="15" />{{ pickLabel }}沒有紀錄</li>
            <li v-else class="pt-2">
              <p class="-mb-1 text-xs text-muted">{{ pickLabel }}{{ subId ? ` ｜ ${subId === t.id ? '未細分' : data.catName(subId)}` : '' }}的紀錄（{{ recordsOf(t.id).length }} 筆）</p>
              <RecordList :records="allShown === t.id ? recordsOf(t.id) : recordsOf(t.id).slice(0, 4)" show-date no-select flat />
              <button v-if="recordsOf(t.id).length > 4" class="flex w-full items-center justify-center gap-1 py-1 text-xs text-muted" @click="allShown = allShown === t.id ? '' : t.id">
                {{ allShown === t.id ? '收起' : `顯示全部 ${recordsOf(t.id).length} 筆` }}
                <ChevronDown :size="14" class="transition-transform" :class="allShown === t.id && 'rotate-180'" />
              </button>
            </li>
          </ul>
        </div>
      </div>
      </div>
    </template>

    <template v-else-if="tab === 'budget'">
      <section class="card mb-4">
        <div class="mb-2 flex items-baseline justify-between">
          <span class="text-sm font-medium text-ink/70">{{ mode === 'year' ? '年' : mode === 'range' ? '期間' : '月' }}預算</span>
          <button class="text-xs text-primary" @click="mode === 'month' && data.ledgerId ? editBudget('ledgers', data.ledgerId) : router.push('/more/ledgers')">
            {{ mode === 'month' ? '調整這個月' : '設定預算' }}
          </button>
        </div>
        <template v-if="totalBudget > 0">
          <p class="text-xs text-muted">剩餘</p>
          <p class="mb-2 text-3xl font-bold" :class="totalBudget - expenseTotal < 0 && 'text-expense'">
            ${{ fmt(totalBudget - expenseTotal) }}
          </p>
          <div class="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div class="h-full rounded-full" :class="barTone(expenseTotal, totalBudget)" :style="{ width: `${Math.min(100, (expenseTotal / totalBudget) * 100)}%` }" />
          </div>
          <div class="mt-1.5 flex justify-between text-xs text-muted">
            <span>已花 ${{ fmt(expenseTotal) }}</span><span>預算 ${{ fmt(totalBudget) }}</span>
          </div>
        </template>
        <div v-else class="space-y-1 py-3 text-sm text-muted">
          <p>還沒有設定總預算。</p>
          <p>到<b>帳本</b>頁設定每月預算，或到<b>分類</b>頁替各分類設定。</p>
        </div>
      </section>

      <template v-for="g in budgetGroups" :key="g.label">
      <p v-if="g.label" class="mt-5 mb-2 px-1 text-xs text-muted">{{ g.label }}</p>
      <div class="card divide-y divide-line p-0">
        <template v-for="r in g.rows" :key="r.c.id">
        <button class="flex w-full items-center gap-3 px-4 py-3 text-left" @click="editBudget('categories', r.c.id)">
          <CatIcon :icon="r.c.icon" :color="r.c.color" :size="34" class="shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-3 leading-5">
              <span class="flex-1 truncate font-medium">{{ r.c.name }}</span>
              <span class="font-semibold" :class="r.budget > 0 && r.spent > r.budget && 'text-expense'">${{ fmt(r.spent) }}</span>
              <span v-if="r.budget" class="text-xs text-muted">/ {{ fmt(r.budget) }}</span>
            </div>
            <div v-if="r.budget" class="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
              <div class="h-full rounded-full" :class="barTone(r.spent, r.budget)" :style="{ width: `${Math.min(100, (r.spent / r.budget) * 100)}%` }" />
            </div>
          </div>
        </button>
        </template>
      </div>
      </template>
      <button class="btn btn-soft mt-4 w-full" @click="router.push('/more/categories')">設定預設預算</button>
    </template>

    <template v-else>
      <PillTabs
        v-model="groupBy"
        size="sm"
        class="mb-3"
        :options="[
          { value: 'item', label: '品項' },
          { value: 'merchant', label: '商家' },
          { value: 'who', label: '同行' },
        ]"
      />
      <div v-if="itemRows.length" class="card overflow-hidden p-0">
        <!-- column titles double as the sort buttons: both carry an arrow, the sorted one is darker -->
        <div class="flex items-center border-b border-line px-4 py-2.5 text-sm text-muted">
          <span class="flex-1">{{ groupLabel }}</span>
          <button class="flex w-14 items-center justify-center gap-0.5" :class="sortBy === 'count' && 'font-semibold text-ink'" aria-label="依次數排序" @click="sortBy = 'count'">
            次數<ChevronDown :size="12" :class="sortBy !== 'count' && 'opacity-35'" />
          </button>
          <button class="flex w-24 items-center justify-end gap-0.5" :class="sortBy === 'amount' && 'font-semibold text-ink'" aria-label="依金額排序" @click="sortBy = 'amount'">
            金額<ChevronDown :size="12" :class="sortBy !== 'amount' && 'opacity-35'" />
          </button>
        </div>
        <ul class="divide-y divide-line">
          <li v-for="r in itemRows" :key="r.name" :class="openItem && openItem !== r.name && 'opacity-40'" class="transition-opacity">
            <button class="flex w-full items-center px-4 py-3.5 text-left" @click="openItem = openItem === r.name ? '' : r.name">
              <span class="min-w-0 flex-1 truncate">{{ r.name }}</span>
              <span class="w-14 text-center text-sm text-muted">{{ r.count }}</span>
              <span class="w-24 text-right font-medium">${{ fmt(r.total) }}</span>
            </button>
            <!-- the records behind this row; a fixed height, scroll for more -->
            <div v-if="openItem === r.name" class="border-t border-line px-4">
              <RecordList :records="allShown === r.name ? recordsOfItem(r.name) : recordsOfItem(r.name).slice(0, 5)" show-date no-select flat />
              <button v-if="recordsOfItem(r.name).length > 5" class="flex w-full items-center justify-center gap-1 border-t border-line py-3 text-xs text-muted" @click="allShown = allShown === r.name ? '' : r.name">
                {{ allShown === r.name ? '收起' : `顯示全部 ${recordsOfItem(r.name).length} 筆` }}
                <ChevronDown :size="14" class="transition-transform" :class="allShown === r.name && 'rotate-180'" />
              </button>
            </div>
          </li>
        </ul>
      </div>
      <p v-else class="card py-12 text-center text-sm text-muted">這段期間沒有記錄</p>
    </template>

    <BudgetSheet v-if="budgetTarget" v-model:open="budgetOpen" :table="budgetTarget.table" :id="budgetTarget.id" :month="month" />
    <PickSheet v-model:open="modeSheet" v-model="mode" title="統計範圍" :items="modeItems" />
    <LedgerPickSheet v-model:open="ledgerSheet" :model-value="data.ledgerId" @update:model-value="data.ledgerId = $event" />
  </div>
</template>
