<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { nowTime } from '@/lib/date'
import BottomSheet from './BottomSheet.vue'

defineProps<{ title?: string; clearable?: boolean }>()
const open = defineModel<boolean>('open', { required: true })
/** HH:mm, or '' when the time of day is left out */
const model = defineModel<string>({ required: true })

/** height of one wheel row in px */
const ROW = 48
const pad = (n: number) => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i))
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i))
// three copies so the wheel can loop: scrolling past the middle copy jumps back to it
const loop = (list: string[]) => [...list, ...list, ...list]
const hourRows = loop(HOURS)
const minuteRows = loop(MINUTES)

const hour = ref('00')
const minute = ref('00')
const hourCol = ref<HTMLElement>()
const minuteCol = ref<HTMLElement>()

/** scroll one wheel to `value`; `smooth` animates within the middle copy */
function scrollTo(el: HTMLElement | undefined, count: number, value: string, smooth: boolean) {
  if (!el) return
  const copy = smooth ? Math.min(2, Math.max(0, Math.floor(Math.round(el.scrollTop / ROW) / count))) : 1
  el.scrollTo({ top: (copy * count + Number(value)) * ROW, behavior: smooth ? 'smooth' : 'instant' })
}
function scrollBoth(smooth: boolean) {
  scrollTo(hourCol.value, 24, hour.value, smooth)
  scrollTo(minuteCol.value, 60, minute.value, smooth)
}

watch(open, async (o) => {
  if (!o) return
  const [h, m] = (model.value || nowTime()).split(':')
  hour.value = pad(Number(h) || 0)
  minute.value = pad(Number(m) || 0)
  await nextTick()
  requestAnimationFrame(() => scrollBoth(false))
})

// after a scroll settles, read the row in the middle and jump back into the middle copy if needed
const timers: Record<string, number> = {}
function settle(key: 'h' | 'm', e: Event, count: number) {
  window.clearTimeout(timers[key])
  const el = e.target as HTMLElement
  timers[key] = window.setTimeout(() => {
    const row = Math.min(3 * count - 1, Math.max(0, Math.round(el.scrollTop / ROW)))
    const value = pad(row % count)
    if (key === 'h') hour.value = value
    else minute.value = value
    if (row < count || row >= 2 * count) el.scrollTo({ top: (count + (row % count)) * ROW, behavior: 'instant' })
  }, 90)
}

function choose(key: 'h' | 'm', value: string) {
  if (key === 'h') hour.value = value
  else minute.value = value
  scrollBoth(true)
}

function clear() {
  model.value = ''
  open.value = false
}
function done() {
  model.value = `${hour.value}:${minute.value}`
  open.value = false
}
</script>

<template>
  <BottomSheet v-model="open" :title="title ?? '選擇時間'">
    <div class="relative flex items-center justify-center gap-2">
      <!-- the highlight behind the selected row -->
      <div class="pointer-events-none absolute inset-x-0 top-1/2 h-12 -translate-y-1/2 rounded-2xl bg-primary-soft" />
      <div
        ref="hourCol"
        class="scrollbar-none fade-y relative h-48 w-16 snap-y snap-mandatory overflow-y-auto py-18"
        aria-label="小時"
        @scroll="settle('h', $event, 24)"
      >
        <button
          v-for="(h, i) in hourRows"
          :key="i"
          class="grid h-12 w-full snap-center place-items-center text-xl tabular-nums transition-colors"
          :class="hour === h ? 'font-bold text-primary-strong' : 'text-muted'"
          @click="choose('h', h)"
        >
          {{ h }}
        </button>
      </div>
      <span class="relative grid h-12 w-3 place-items-center pb-[3px] text-xl leading-none font-bold">:</span>
      <div
        ref="minuteCol"
        class="scrollbar-none fade-y relative h-48 w-16 snap-y snap-mandatory overflow-y-auto py-18"
        aria-label="分鐘"
        @scroll="settle('m', $event, 60)"
      >
        <button
          v-for="(m, i) in minuteRows"
          :key="i"
          class="grid h-12 w-full snap-center place-items-center text-xl tabular-nums transition-colors"
          :class="minute === m ? 'font-bold text-primary-strong' : 'text-muted'"
          @click="choose('m', m)"
        >
          {{ m }}
        </button>
      </div>
    </div>

    <div class="mt-4 flex gap-2">
      <button v-if="clearable && model" class="btn btn-ghost" @click="clear">清空</button>
      <button class="btn btn-primary flex-1" @click="done">完成</button>
    </div>
  </BottomSheet>
</template>

<style scoped>
/* the wheel fades out toward its top and bottom edges */
.fade-y {
  -webkit-mask-image: linear-gradient(#0000001f, #000 34% 66%, #0000001f);
  mask-image: linear-gradient(#0000001f, #000 34% 66%, #0000001f);
}
</style>
