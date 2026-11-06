<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { evalExpr, fmtFx, fmtRate } from '@/lib/money'
import { foreignTotal, pendingOf, settlePending } from '@/lib/fx'
import { currencyName } from '@/lib/customCurrency'
import { save } from '@/db'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import BottomSheet from './BottomSheet.vue'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ ledgerId: string; currency: string }>()
const data = useData()
const ui = useUi()

const list = computed(() => pendingOf(data.records, props.ledgerId, props.currency))
const foreign = computed(() => list.value.reduce((n, r) => n + foreignTotal(r), 0))
const text = ref('')
const twd = computed(() => evalExpr(text.value) ?? 0)
const rate = computed(() => (foreign.value > 0 && twd.value > 0 ? twd.value / foreign.value : 0))

watch(open, (o) => o && (text.value = ''), { immediate: true })

async function done() {
  if (twd.value <= 0) return ui.toast('請輸入花了多少台幣', 'error')
  const n = await settlePending(list.value, Math.round(twd.value))
  // the next record of this ledger uses the same rate
  const l = data.ledgerMap.get(props.ledgerId)
  if (l && rate.value > 0) await save('ledgers', { ...l, rate: Math.round(rate.value * 1e6) / 1e6 })
  ui.toast(`已換算 ${n} 筆`, 'success')
  open.value = false
}
</script>

<template>
  <BottomSheet v-model="open" :title="`換算${currencyName(currency)}`">
    <div class="space-y-4">
      <p class="text-sm text-muted">這 {{ list.length }} 筆都是用{{ currencyName(currency) }}記的，還沒換成台幣。填一個總共花了多少台幣，會依每筆的比例換算。</p>
      <div class="card flex items-baseline justify-between">
        <span class="text-sm text-muted">{{ currency }} 合計</span>
        <span class="text-xl font-bold tabular-nums">{{ currency }} {{ fmtFx(foreign) }}</span>
      </div>
      <div>
        <label class="label" for="fx-twd">總共花了多少台幣</label>
        <div class="field justify-start gap-2">
          <span class="text-muted">$</span>
          <input id="fx-twd" v-model="text" class="min-w-0 flex-1 bg-transparent text-lg outline-none" inputmode="decimal" placeholder="0" />
        </div>
        <p v-if="rate > 0" class="mt-1.5 px-1 text-xs text-muted">相當於 1 {{ currency }} = {{ fmtRate(rate) }} TWD</p>
      </div>
      <button class="btn btn-primary w-full" :disabled="twd <= 0" @click="done">換算</button>
    </div>
  </BottomSheet>
</template>
