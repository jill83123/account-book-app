<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from '@/lib/uiIcons'
import { addDays, addYm, monthGrid, monthLabel, today, weekday, WEEKDAYS, ym } from '@/lib/date'
import BottomSheet from './BottomSheet.vue'

defineProps<{ title?: string; clearable?: boolean }>()
const open = defineModel<boolean>('open', { required: true })
/** YYYY-MM-DD, or '' when a clearable field has no date */
const model = defineModel<string>({ required: true })

const month = ref(ym(today()))
watch(open, (o) => {
  if (o) month.value = ym(model.value || today())
})

const cells = computed(() => monthGrid(month.value))

function pick(d: string) {
  model.value = d
  open.value = false
}

const shortcuts = computed(() => [
  { label: '前天', date: addDays(today(), -2) },
  { label: '昨天', date: addDays(today(), -1) },
  { label: '今天', date: today() },
  { label: '明天', date: addDays(today(), 1) },
])
</script>

<template>
  <BottomSheet v-model="open" :title="title ?? '選擇日期'">
    <div class="mb-2 flex items-center justify-between">
      <button class="icon-btn border-0 bg-transparent" aria-label="上個月" @click="month = addYm(month, -1)">
        <ChevronLeft :size="22" />
      </button>
      <span class="font-semibold">{{ monthLabel(month) }}</span>
      <button class="icon-btn border-0 bg-transparent" aria-label="下個月" @click="month = addYm(month, 1)">
        <ChevronRight :size="22" />
      </button>
    </div>

    <div class="grid grid-cols-7 text-center text-xs text-muted">
      <span v-for="(w, i) in WEEKDAYS" :key="w" class="py-1" :class="i === 0 && 'text-sun'">{{ w }}</span>
    </div>
    <div class="grid grid-cols-7 gap-y-1">
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

    <div class="mt-4 flex flex-wrap gap-2">
      <button v-for="s in shortcuts" :key="s.label" class="chip" :class="model === s.date && 'chip-on'" @click="pick(s.date)">
        {{ s.label }}
      </button>
      <button v-if="clearable" class="chip text-danger" @click="pick('')">清除</button>
    </div>
  </BottomSheet>
</template>
