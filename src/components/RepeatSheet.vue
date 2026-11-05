<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Freq } from '@/db/types'
import { FREQ_LABEL, type Repeat } from '@/lib/recurrence'
import { Minus, Plus } from '@/lib/uiIcons'
import { fmt } from '@/lib/money'
import BottomSheet from './BottomSheet.vue'
import DateField from './DateField.vue'
import PillTabs from './PillTabs.vue'
import ToggleSwitch from './ToggleSwitch.vue'

const props = defineProps<{ total: number; canInstall: boolean }>()
const open = defineModel<boolean>('open', { required: true })
const model = defineModel<Repeat>({ required: true })

const kind = ref<Repeat['kind']>('once')
const freq = ref<Freq>('monthly')
const interval = ref(1)
const autoPost = ref(true)
const endDate = ref('')
const periods = ref(12)
const fee = ref(0)

watch(open, (o) => {
  if (!o) return
  const m = model.value
  kind.value = m.kind
  if (m.kind === 'recurring') {
    freq.value = m.freq
    interval.value = m.interval
    autoPost.value = m.autoPost
    endDate.value = m.endDate ?? ''
  } else if (m.kind === 'installment') {
    periods.value = m.periods
    fee.value = m.fee
  }
})

const kinds = computed(() => [
  { value: 'once' as const, label: '單次' },
  { value: 'recurring' as const, label: '週期' },
  ...(props.canInstall ? [{ value: 'installment' as const, label: '分期' }] : []),
])

const perPeriod = computed(() =>
  periods.value > 0 ? Math.round(props.total / periods.value) + (fee.value || 0) : 0,
)

function save() {
  if (kind.value === 'once') model.value = { kind: 'once' }
  else if (kind.value === 'recurring') {
    model.value = {
      kind: 'recurring',
      freq: freq.value,
      interval: Math.max(1, interval.value || 1),
      autoPost: autoPost.value,
      endDate: endDate.value || undefined,
    }
  } else {
    model.value = {
      kind: 'installment',
      periods: Math.max(2, periods.value || 2),
      fee: Math.max(0, fee.value || 0),
    }
  }
  open.value = false
}
</script>

<template>
  <BottomSheet v-model="open" title="重複與分期">
    <div class="space-y-4">
      <PillTabs v-model="kind" :options="kinds" />

      <p v-if="kind === 'once'" class="text-sm text-muted">這筆只記一次。</p>

      <template v-else-if="kind === 'recurring'">
        <p class="text-sm text-muted">
          房租、訂閱、薪資這類固定發生的交易。從這筆的日期開始，依週期自動產生。
        </p>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="(label, f) in FREQ_LABEL"
            :key="f"
            class="chip justify-center !py-2.5"
            :class="freq === f && 'chip-on'"
            @click="freq = f"
          >
            {{ label }}
          </button>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <p class="mb-1 px-1 text-xs text-muted">間隔（{{ { daily: '天', weekly: '週', monthly: '個月', yearly: '年' }[freq] }}）</p>
            <div class="flex items-center rounded-2xl border border-line bg-surface">
              <button class="icon-btn border-0 bg-transparent text-muted" aria-label="減少" :disabled="(interval || 1) <= 1" @click="interval = Math.max(1, (interval || 1) - 1)">
                <Minus :size="18" />
              </button>
              <input v-model.number="interval" type="number" min="1" class="min-w-0 flex-1 bg-transparent py-3 text-center text-base font-semibold outline-none" />
              <button class="icon-btn border-0 bg-transparent text-muted" aria-label="增加" @click="interval = (interval || 1) + 1">
                <Plus :size="18" />
              </button>
            </div>
          </div>
          <div>
            <p class="mb-1 px-1 text-xs text-muted">結束日期</p>
            <DateField v-model="endDate" title="結束日期" placeholder="不設定" clearable />
          </div>
        </div>
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium">自動入帳</p>
            <p class="text-xs text-muted">關閉時，到期會出現在提醒，由你確認後才入帳。</p>
          </div>
          <ToggleSwitch v-model="autoPost" label="自動入帳" />
        </div>
      </template>

      <template v-else>
        <p class="text-sm text-muted">
          把這筆金額拆成每月一期，每期自動在這個日期入帳（例如信用卡分期）。
        </p>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="n in [3, 6, 9, 12, 18, 24]"
            :key="n"
            class="chip justify-center !py-2.5"
            :class="periods === n && 'chip-on'"
            @click="periods = n"
          >
            {{ n }} 期
          </button>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <p class="mb-1 px-1 text-xs text-muted">期數</p>
            <div class="flex items-center rounded-2xl border border-line bg-surface">
              <button class="icon-btn border-0 bg-transparent text-muted" aria-label="減少一期" :disabled="(periods || 2) <= 2" @click="periods = Math.max(2, (periods || 2) - 1)">
                <Minus :size="18" />
              </button>
              <input v-model.number="periods" type="number" min="2" class="min-w-0 flex-1 bg-transparent py-3 text-center text-base font-semibold outline-none" />
              <button class="icon-btn border-0 bg-transparent text-muted" aria-label="增加一期" @click="periods = (periods || 2) + 1">
                <Plus :size="18" />
              </button>
            </div>
          </div>
          <div>
            <p class="mb-1 px-1 text-xs text-muted">每期手續費</p>
            <div class="flex items-center gap-1 rounded-2xl border border-line bg-surface px-4">
              <span class="text-muted">$</span>
              <input v-model.number="fee" type="number" min="0" inputmode="numeric" class="min-w-0 flex-1 bg-transparent py-3 text-right text-base font-semibold outline-none" />
            </div>
          </div>
        </div>
        <div class="rounded-2xl bg-primary-soft px-4 py-3 text-center">
          <p class="text-xs text-primary-strong">每期約</p>
          <p class="text-2xl font-bold text-primary-strong">${{ fmt(perPeriod) }}</p>
          <p class="mt-0.5 text-xs text-muted">總額 ${{ fmt(total) }} ÷ {{ periods || 0 }} 期 + 手續費 ${{ fmt(fee || 0) }}</p>
        </div>
      </template>

      <button class="btn btn-primary w-full" @click="save">完成</button>
    </div>
  </BottomSheet>
</template>
