<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from '@/lib/uiIcons'
import { addDays, addMonths, addYm, daysInMonth, monthGrid, today, weekday, WEEKDAYS, ym } from '@/lib/date'
import BottomSheet from './BottomSheet.vue'

const props = defineProps<{ title?: string; clearable?: boolean; range?: 'start' | 'end' }>()
const open = defineModel<boolean>('open', { required: true })
/** YYYY-MM-DD, or '' when a clearable field has no date */
const model = defineModel<string>({ required: true })

const month = ref(ym(today()))
watch(open, (o) => {
  if (o) month.value = ym(model.value || today())
})

const cells = computed(() => monthGrid(month.value))

/** tapping the year or the month swaps the days for a quick list of years or months */
const quick = ref<'' | 'year' | 'month'>('')
const viewYear = computed(() => Number(month.value.slice(0, 4)))
/** the first year of the 12 shown in the year list */
const yearStart = ref(0)
watch(open, (o) => {
  if (o) quick.value = ''
})
function openQuick(kind: 'year' | 'month') {
  if (quick.value === kind) {
    quick.value = ''
    return
  }
  quick.value = kind
  if (kind === 'year') yearStart.value = viewYear.value - 4
}
function pickYear(y: number) {
  month.value = `${y}-${month.value.slice(5)}`
  quick.value = ''
}
function pickMonth(m: number) {
  month.value = `${viewYear.value}-${String(m).padStart(2, '0')}`
  quick.value = ''
}
function step(n: number) {
  if (quick.value === 'year') yearStart.value += n * 12
  else if (quick.value === 'month') month.value = addYm(month.value, n * 12)
  else month.value = addYm(month.value, n)
}

function pick(d: string) {
  model.value = d
  open.value = false
}

const shortcuts = computed(() => {
  const t = today()
  const y = Number(t.slice(0, 4))
  const first = (m: string) => `${m}-01`
  const last = (m: string) => `${m}-${String(daysInMonth(Number(m.slice(0, 4)), Number(m.slice(5)) - 1)).padStart(2, '0')}`
  const thisMonth = ym(t)
  const lastMonth = addYm(thisMonth, -1)
  // a range start wants the beginning of a stretch, a range end wants the end of one
  if (props.range === 'start')
    return [
      { label: '本月初', date: first(thisMonth) },
      { label: '上月初', date: first(lastMonth) },
      { label: '三個月前', date: addMonths(t, -3) },
      { label: '半年前', date: addMonths(t, -6) },
      { label: '今年初', date: `${y}-01-01` },
      { label: '去年初', date: `${y - 1}-01-01` },
    ]
  if (props.range === 'end')
    return [
      { label: '今天', date: t },
      { label: '本月底', date: last(thisMonth) },
      { label: '上月底', date: last(lastMonth) },
      { label: '去年底', date: `${y - 1}-12-31` },
    ]
  return [
    { label: '前天', date: addDays(t, -2) },
    { label: '昨天', date: addDays(t, -1) },
    { label: '今天', date: t },
    { label: '明天', date: addDays(t, 1) },
  ]
})
</script>

<template>
  <BottomSheet v-model="open" :title="title ?? '選擇日期'">
    <div class="mb-2 flex items-center justify-between">
      <button class="icon-btn border-0 bg-transparent" aria-label="上一頁" @click="step(-1)">
        <ChevronLeft :size="22" />
      </button>
      <span class="flex items-center font-semibold">
        <button class="rounded-lg px-1 py-1 transition active:scale-95" :class="quick === 'year' && 'text-primary'" @click="openQuick('year')">
          {{ viewYear }} 年
        </button>
        <button class="rounded-lg px-1 py-1 transition active:scale-95" :class="quick === 'month' && 'text-primary'" @click="openQuick('month')">
          {{ Number(month.slice(5)) }} 月
        </button>
      </span>
      <button class="icon-btn border-0 bg-transparent" aria-label="下一頁" @click="step(1)">
        <ChevronRight :size="22" />
      </button>
    </div>

    <div v-if="quick" class="grid grid-cols-3 grid-rows-4 gap-2"
      :style="{ height: `${1.25 + (cells.length / 7) * 2.75}rem` }">
      <template v-if="quick === 'year'">
        <button
          v-for="y in 12"
          :key="y"
          class="rounded-2xl text-[15px] transition active:scale-95"
          :class="yearStart + y - 1 === viewYear ? 'bg-primary font-semibold text-white' : 'bg-surface-2'"
          @click="pickYear(yearStart + y - 1)"
        >
          {{ yearStart + y - 1 }}
        </button>
      </template>
      <template v-else>
        <button
          v-for="m in 12"
          :key="m"
          class="rounded-2xl text-[15px] transition active:scale-95"
          :class="m === Number(month.slice(5)) ? 'bg-primary font-semibold text-white' : 'bg-surface-2'"
          @click="pickMonth(m)"
        >
          {{ m }} 月
        </button>
      </template>
    </div>

    <div v-if="!quick" class="grid grid-cols-7 text-center text-xs text-muted">
      <span v-for="(w, i) in WEEKDAYS" :key="w" class="py-1" :class="i === 0 && 'text-sun'">{{ w }}</span>
    </div>
    <div v-if="!quick" class="grid grid-cols-7 gap-y-1">
      <button
        v-for="d in cells"
        :key="d"
        class="mx-auto grid size-10 place-items-center rounded-full text-[15px] transition active:scale-90"
        :class="[
          d === model ? 'bg-primary font-semibold text-white' : '',
          d !== model && d === today() ? 'border border-primary font-semibold text-primary' : '',
          d !== model && ym(d) !== month ? 'text-muted/40' : '',
          d !== model && ym(d) === month && d !== today() ? (weekday(d) === 0 ? 'text-sun' : '') : '',
        ]"
        :aria-label="d"
        @click="pick(d)"
      >
        {{ Number(d.slice(8)) }}
      </button>
    </div>

    <p class="mt-4 mb-2 text-xs text-muted">快速選擇</p>
    <div class="flex flex-wrap gap-2">
      <button v-for="s in shortcuts" :key="s.label" class="chip" :class="model === s.date && 'chip-on'" @click="pick(s.date)">
        {{ s.label }}
      </button>
      <button v-if="clearable" class="chip text-danger" @click="pick('')">清除</button>
    </div>
  </BottomSheet>
</template>
