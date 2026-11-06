<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, RotateCcw } from '@/lib/uiIcons'
import { addYm, monthLabel, today, ym } from '@/lib/date'
import BottomSheet from './BottomSheet.vue'

const props = defineProps<{ year?: boolean }>()
const month = defineModel<string>({ required: true })

function step(n: number) {
  month.value = props.year
    ? String(Number(month.value.slice(0, 4)) + n)
    : addYm(month.value.slice(0, 7), n)
}

// tapping the label opens a picker: a year, or a month of a year
const open = ref(false)
/** month mode: the year shown in the picker; year mode: the first year of the 12 shown */
const view = ref(0)
const current = computed(() => Number(month.value.slice(0, 4)))
const thisYear = Number(today().slice(0, 4))
const thisMonth = ym(today())

watch(open, (o) => {
  if (o) view.value = props.year ? current.value - 4 : current.value
})

const years = computed(() => Array.from({ length: 12 }, (_, i) => view.value + i))

function pickMonth(m: number) {
  month.value = `${view.value}-${String(m).padStart(2, '0')}`
  open.value = false
}
function pickYear(y: number) {
  month.value = String(y)
  open.value = false
}
const away = computed(() => (props.year ? current.value !== thisYear : month.value.slice(0, 7) !== thisMonth))
function jumpNow() {
  month.value = props.year ? String(thisYear) : thisMonth
  open.value = false
}
</script>

<template>
  <div>
  <div class="flex items-center justify-between">
    <button class="icon-btn border-0 bg-transparent" aria-label="上一個" @click="step(-1)">
      <ChevronLeft :size="24" />
    </button>
    <span class="relative">
    <button class="flex items-center gap-1 rounded-xl px-3 py-1.5 text-base font-semibold" aria-label="選擇年月" @click="open = true">
      {{ year ? `${month} 年` : monthLabel(month) }}
    </button>
      <!-- away from today: a small quiet round button beside the date takes you back -->
      <button
        v-if="away"
        class="absolute top-1/2 left-full ml-1 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted"
        :aria-label="year ? '回到今年' : '回到本月'"
        @click="jumpNow"
      >
        <RotateCcw :size="14" />
      </button>
    </span>
    <button class="icon-btn border-0 bg-transparent" aria-label="下一個" @click="step(1)">
      <ChevronRight :size="24" />
    </button>
  </div>

  <BottomSheet v-model="open" :title="year ? '選擇年份' : '選擇月份'">
    <div class="mb-3 flex items-center justify-between">
      <button class="icon-btn" aria-label="往前" @click="view -= year ? 12 : 1"><ChevronLeft :size="20" /></button>
      <span class="font-semibold">{{ year ? `${view}～${view + 11}` : `${view} 年` }}</span>
      <button class="icon-btn" aria-label="往後" @click="view += year ? 12 : 1"><ChevronRight :size="20" /></button>
    </div>
    <div class="grid grid-cols-4 gap-2">
      <template v-if="year">
        <button
          v-for="y in years"
          :key="y"
          class="rounded-2xl py-3.5 font-medium transition"
          :class="y === current ? 'bg-primary text-white' : y === thisYear ? 'bg-primary-soft text-primary' : 'bg-surface'"
          @click="pickYear(y)"
        >
          {{ y }}
        </button>
      </template>
      <template v-else>
        <button
          v-for="m in 12"
          :key="m"
          class="rounded-2xl py-3.5 font-medium transition"
          :class="
            `${view}-${String(m).padStart(2, '0')}` === month
              ? 'bg-primary text-white'
              : `${view}-${String(m).padStart(2, '0')}` === thisMonth
                ? 'bg-primary-soft text-primary'
                : 'bg-surface'
          "
          @click="pickMonth(m)"
        >
          {{ m }} 月
        </button>
      </template>
    </div>
    <button class="btn btn-ghost mt-4 w-full" @click="jumpNow">{{ year ? '回到今年' : '回到這個月' }}</button>
  </BottomSheet>
  </div>
</template>
