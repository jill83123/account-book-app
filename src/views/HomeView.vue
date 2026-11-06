<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, ChevronDown, Cloud, CloudCheck, CloudOff, ListChecks, Plus, RefreshCw, Search, X } from '@/lib/uiIcons'
import { markLocalChange } from '@/db'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import type { Rec } from '@/db/types'
import { myTotal } from '@/lib/split'
import { useUi } from '@/stores/ui'
import { addYm, monthGrid, parse, today, weekday, WEEKDAYS, ym } from '@/lib/date'
import { fmt } from '@/lib/money'
import { notify } from '@/lib/reminders'
import { useReminders } from '@/stores/reminders'
import { useSync } from '@/stores/sync'
import MonthNav from '@/components/MonthNav.vue'
import LedgerPickSheet from '@/components/LedgerPickSheet.vue'
import PillTabs from '@/components/PillTabs.vue'
import RecordList from '@/components/RecordList.vue'

const router = useRouter()
const data = useData()
const ui = useUi()
const { s } = useSettings()
const sync = useSync()

/** where the Google Sheets sync stands; hidden until sync has been set up.
 *  `go`: a tap opens the sync settings, `sync`: a tap syncs right away */
const syncState = computed(() => {
  if (!s.workerUrl) return null
  if (sync.syncing) return { icon: RefreshCw, tone: 'text-muted', spin: true, go: false, label: '同步中' }
  if (!sync.signedIn) return { icon: CloudOff, tone: 'text-danger', spin: false, go: true, label: '尚未登入 Google，無法同步' }
  if (sync.error) return { icon: CloudOff, tone: 'text-danger', spin: false, go: false, label: `同步失敗，點一下重試：${sync.error}` }
  if (sync.unsynced) return { icon: Cloud, tone: 'text-warn', spin: false, go: false, label: '有尚未同步的變更，點一下立即同步' }
  return { icon: CloudCheck, tone: 'text-muted', spin: false, go: false, label: '已同步，點一下再同步一次' }
})

/** another device has the daily reminder on and this one does not: offer to turn it on here too */
const remindHint = computed(() => s.remindOnElsewhere && !s.remindEnabled && !s.remindHintDismissed && sync.signedIn)

async function turnOnRemind() {
  s.remindEnabled = true
  s.remindHintDismissed = true
  markLocalChange()
  if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission().catch(() => {})
  ui.toast('已開啟每日提醒', 'success')
}

function tapSync() {
  if (syncState.value?.go) router.push('/more/data')
  else if (!sync.syncing) void sync.sync({ loud: true })
}

type Tab = 'cal' | 'list' | 'year'
const tab = ref<Tab>('list')
const month = ref(ym(ui.selectedDate || today()))
const selected = ref(ui.selectedDate || today())
// the + button adds to this day
watch(selected, (d) => (ui.selectedDate = d), { immediate: true })
const ledgerSheet = ref(false)

/** the navigator steps by month, or by year on the monthly report */
const period = computed({
  get: () => (tab.value === 'year' ? month.value.slice(0, 4) : month.value),
  set: (v: string) => (month.value = tab.value === 'year' ? `${v}-${month.value.slice(5)}` : v),
})

// moving to another month: keep a sensible day selected
watch(month, (m) => {
  if (ym(selected.value) !== m) selected.value = m === ym(today()) ? today() : `${m}-01`
})

// picking a day outside the month moves the month along with it
watch(selected, (d) => {
  if (ym(d) !== month.value) month.value = ym(d)
})

const recordsByDate = computed(() => {
  const map = new Map<string, typeof data.ledgerRecords>()
  for (const r of data.ledgerRecords) {
    const list = map.get(r.date)
    if (list) list.push(r)
    else map.set(r.date, [r])
  }
  return map
})

function totals(list: { type: string; total: number }[]) {
  let income = 0
  let expense = 0
  for (const r of list as Rec[]) {
    if (r.adjust) continue
    if (r.type === 'income') income += r.total
    else if (r.type === 'expense') expense += myTotal(r)
  }
  return { income, expense, balance: income - expense }
}

/** amounts inside a calendar cell are short: 12,500 stays, 125,000 becomes 12.5萬 */
const short = (n: number) => (n >= 100000 ? `${Math.round(n / 1000) / 10}萬` : fmt(n))

const summary = computed(() => {
  const prefix = tab.value === 'year' ? month.value.slice(0, 4) : month.value
  return totals(data.ledgerRecords.filter((r) => r.date.startsWith(prefix)))
})

// 日曆: every day of the month with what was spent and earned
const cells = computed(() => monthGrid(month.value).map((d) => ({ date: d, inMonth: ym(d) === month.value, ...totals(recordsByDate.value.get(d) ?? []) })))

// 月報: the twelve months of the year
const months = computed(() => {
  const year = month.value.slice(0, 4)
  const by = new Map<string, { income: number; expense: number }>()
  for (const r of data.ledgerRecords) {
    if (!r.date.startsWith(year)) continue
    if (r.adjust) continue
    const m = ym(r.date)
    const t = by.get(m) ?? { income: 0, expense: 0 }
    if (r.type === 'income') t.income += r.total
    else if (r.type === 'expense') t.expense += myTotal(r)
    by.set(m, t)
  }
  return Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(12 - i).padStart(2, '0')}`
    const t = by.get(m) ?? { income: 0, expense: 0 }
    return { month: m, label: `${12 - i}月`, ...t, balance: t.income - t.expense }
  })
})

function openMonth(m: string) {
  month.value = m
  tab.value = 'list'
}

// 帳單: the month's days, newest first
const monthDays = computed(() =>
  [...recordsByDate.value.keys()]
    .filter((d) => ym(d) === month.value)
    .sort()
    .reverse()
    .map((d) => ({ date: d, records: recordsByDate.value.get(d)!, ...totals(recordsByDate.value.get(d)!) })),
)

// the calendar shows the picked day's records right below it
const selectedRecords = computed(() => data.ledgerRecords.filter((r) => r.date === selected.value))
const daySum = computed(() => totals(selectedRecords.value))
const selectedTitle = computed(() => {
  const p = parse(selected.value)
  return `${p.getMonth() + 1}/${p.getDate()}（週${WEEKDAYS[p.getDay()]}）`
})


function pickDay(d: string, inMonth: boolean) {
  selected.value = d
  if (!inMonth) month.value = ym(d)
}

const dayLabel = (d: string) => `${Number(d.slice(8))}`
const weekLabel = (d: string) => `週${WEEKDAYS[weekday(d)]}`
const weekTone = (d: string) => (weekday(d) === 0 ? 'text-sun' : 'text-ink')

// a sideways swipe on the calendar changes the month
let startX = 0
function onDown(e: PointerEvent) {
  startX = e.clientX
}
function onUp(e: PointerEvent) {
  const dx = e.clientX - startX
  if (Math.abs(dx) < 60) return
  month.value = addYm(month.value, dx < 0 ? 1 : -1)
}

const reminderStore = useReminders()
const reminders = computed(() => reminderStore.list)

const ledgerName = computed(() => data.ledgerMap.get(data.ledgerId)?.name ?? '帳本')

onMounted(() => {
  const d = today()
  if (s.remindEnabled && s.lastRemindDay !== d && reminders.value.some((r) => r.kind === 'daily')) {
    s.lastRemindDay = d
    void notify('今天還沒有記帳', '花一分鐘把今天的消費記下來吧')
  }
})
</script>

<template>
  <div>
    <!-- the title sits in the middle column, so it is centred whatever the buttons on either side are -->
    <header class="sticky top-0 z-20 -mx-4 bg-bg/85 px-4 backdrop-blur mb-3 grid grid-cols-[1fr_auto_1fr] min-h-14 items-center gap-1 py-2 sm:gap-2">
      <div class="flex items-center gap-0.5 sm:gap-2">
        <button v-if="syncState" class="circle-btn size-9 sm:size-10" :class="syncState.tone" :aria-label="syncState.label" :title="syncState.label" @click="tapSync">
          <component :is="syncState.icon" :size="20" :class="syncState.spin && 'animate-spin'" />
        </button>
        <button class="circle-btn size-9 sm:size-10" aria-label="提醒" @click="router.push('/reminders')">
          <Bell :size="20" />
          <span
            v-if="reminders.length"
            class="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] leading-5 font-bold text-white"
          >
            {{ reminders.length }}
          </span>
        </button>
      </div>
      <!-- the title is the ledger being looked at; tap to switch -->
      <button class="relative justify-self-center text-xl font-bold tracking-tight" aria-label="切換帳本" @click="ledgerSheet = true">
        <span class="block max-w-40 truncate">{{ ledgerName }}</span>
        <ChevronDown :size="16" class="absolute top-1/2 left-full ml-1.5 -translate-y-1/2 text-muted" />
      </button>
      <div class="flex items-center justify-end gap-0.5 sm:gap-2">
        <button class="circle-btn size-9 sm:size-10" aria-label="批次編輯" @click="ui.selecting ? ui.stopSelect() : ui.startSelect()"><ListChecks :size="20" /></button>
        <button class="circle-btn size-9 sm:size-10" aria-label="搜尋" @click="router.push('/search')"><Search :size="20" /></button>
      </div>
    </header>

    <!-- the reminder is on for another device but not this one -->
    <div v-if="remindHint" class="card mb-3 flex items-center gap-3 p-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-strong"><Bell :size="20" /></span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold">這台裝置也要收到每日提醒嗎？</p>
        <p class="text-xs text-muted">你在其他裝置開啟了每日提醒。</p>
      </div>
      <button class="btn btn-primary btn-sm shrink-0" @click="turnOnRemind">開啟</button>
      <button class="circle-btn size-8 shrink-0 text-muted" aria-label="關閉" @click="s.remindHintDismissed = true"><X :size="18" /></button>
    </div>

    <MonthNav v-model="period" :year="tab === 'year'" />

    <PillTabs
      v-model="tab"
      size="sm"
      class="mt-1 mb-4"
      :options="[
        { value: 'list', label: '帳單' },
        { value: 'cal', label: '月曆' },
        { value: 'year', label: '月報' },
      ]"
    />

    <!-- 月曆: the month at a glance; tap a day to open it -->
    <template v-if="tab === 'cal'">
    <section class="card mb-4">
      <div class="grid grid-cols-3 text-center">
        <div>
          <p class="text-xs text-muted">收入</p>
          <p class="font-semibold text-income">{{ fmt(summary.income) }}</p>
        </div>
        <div>
          <p class="text-xs text-muted">支出</p>
          <p class="font-semibold text-expense">{{ fmt(summary.expense) }}</p>
        </div>
        <div>
          <p class="text-xs text-muted">合計</p>
          <p class="font-semibold">{{ fmt(summary.balance) }}</p>
        </div>
      </div>
    </section>
    <section class="card p-0">
      <div class="select-none px-2 py-3" @pointerdown="onDown" @pointerup="onUp">
        <div class="grid grid-cols-7 pb-2 text-center text-xs text-muted">
          <span v-for="(w, i) in WEEKDAYS" :key="w" :class="i === 0 && 'text-sun'">{{ w }}</span>
        </div>
        <div class="grid grid-cols-7">
          <button
            v-for="c in cells"
            :key="c.date"
            class="flex h-[60px] flex-col items-center rounded-xl pt-1.5 transition-colors"
            :class="selected === c.date && 'bg-primary-soft'"
            :aria-label="c.date"
            @click="pickDay(c.date, c.inMonth)"
          >
            <span
              class="grid size-[22px] place-items-center rounded-full text-[13px] font-medium"
              :class="[c.inMonth ? weekTone(c.date) : 'text-muted/40', c.date === today() && 'bg-primary font-semibold !text-white']"
            >
              {{ dayLabel(c.date) }}
            </span>
            <span v-if="c.inMonth" class="mt-0.5 flex w-full flex-col items-end px-1 text-[10px] leading-[12px] font-medium tabular-nums">
              <span v-if="c.income" class="text-income">{{ short(c.income) }}</span>
              <span v-if="c.expense" class="text-expense">{{ short(c.expense) }}</span>
            </span>
          </button>
        </div>
      </div>
    </section>

    <!-- the picked day's records, right under the calendar -->
    <section class="mt-4">
      <div class="mb-2 flex items-center gap-3 px-1">
        <h2 class="font-semibold">{{ selectedTitle }}</h2>
        <span v-if="daySum.income" class="text-sm text-muted">收入 <b class="text-income">${{ fmt(daySum.income) }}</b></span>
        <span v-if="daySum.expense" class="text-sm text-muted">支出 <b class="text-expense">${{ fmt(daySum.expense) }}</b></span>
        <button class="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary" @click="router.push({ path: '/record/new', query: { date: selected } })">
          <Plus :size="14" />新增
        </button>
      </div>
      <RecordList v-if="selectedRecords.length" :records="selectedRecords" reorder />
      <p v-else class="card py-8 text-center text-sm text-muted">這天還沒有記錄</p>
    </section>
    </template>

    <!-- 帳單: the whole month, a heading for every day -->
    <template v-else-if="tab === 'list'">
      <section class="card mb-4">
        <div class="grid grid-cols-3 text-center">
          <div>
            <p class="text-xs text-muted">收入</p>
            <p class="font-semibold text-income">{{ fmt(summary.income) }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">支出</p>
            <p class="font-semibold text-expense">{{ fmt(summary.expense) }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">合計</p>
            <p class="font-semibold">{{ fmt(summary.balance) }}</p>
          </div>
        </div>
      </section>
      <div v-if="!monthDays.length" class="card flex items-center justify-center gap-2 py-10 text-sm text-muted">
        <span>這個月還沒有記錄，點下方的</span>
        <span class="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-white"><Plus :size="14" :stroke-width="2.6" /></span>
        <span>開始記帳</span>
      </div>
      <div v-for="day in monthDays" :key="day.date" class="mb-4">
        <div class="mb-2 flex items-center gap-2 px-4">
          <!-- today is marked in the theme colour -->
          <span class="text-2xl leading-none font-bold tabular-nums" :class="day.date === today() && 'text-primary'">{{ dayLabel(day.date) }}</span>
          <span
            class="rounded-md border bg-surface px-1.5 py-0.5 text-xs font-medium"
            :class="weekday(day.date) === 0 ? 'border-sun text-sun' : 'border-line text-ink/70'"
          >
            {{ weekLabel(day.date) }}
          </span>
          <span class="flex-1" />
          <span v-if="day.income" class="text-sm font-medium text-income">${{ fmt(day.income) }}</span>
          <span class="min-w-14 text-right text-sm font-medium text-expense">${{ fmt(day.expense) }}</span>
        </div>
        <RecordList :records="day.records" reorder />
      </div>
    </template>

    <!-- 月報: the year, month by month -->
    <template v-else>
      <section class="card mb-4">
        <div class="grid grid-cols-3 text-center">
          <div>
            <p class="text-xs text-muted">收入</p>
            <p class="font-semibold text-income">{{ fmt(summary.income) }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">支出</p>
            <p class="font-semibold text-expense">{{ fmt(summary.expense) }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">合計</p>
            <p class="font-semibold">{{ fmt(summary.balance) }}</p>
          </div>
        </div>
      </section>
      <div class="card divide-y divide-line p-0">
        <button
          v-for="m in months"
          :key="m.month"
          class="flex w-full items-center gap-3 px-4 py-3 text-left"
          :class="m.month === ym(today()) && 'bg-primary-soft/60'"
          @click="openMonth(m.month)"
        >
          <span class="w-12 shrink-0">
            <span class="block text-base font-semibold">{{ m.label }}</span>
          </span>
          <span class="flex-1 text-right text-sm font-medium" :class="m.income ? 'text-income' : 'text-muted/60'">{{ fmt(m.income) }}</span>
          <span class="flex-1 text-right text-sm font-medium" :class="m.expense ? 'text-expense' : 'text-muted/60'">{{ fmt(m.expense) }}</span>
          <span class="flex-1 text-right text-sm font-semibold">{{ fmt(m.balance) }}</span>
        </button>
      </div>
    </template>

    <LedgerPickSheet v-model:open="ledgerSheet" :model-value="data.ledgerId" @update:model-value="data.ledgerId = $event" />
  </div>
</template>
