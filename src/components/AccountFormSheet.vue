<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { remove, save } from '@/db'
import type { Account, AccountKind } from '@/db/types'
import { currencyItems, BASE_CURRENCY } from '@/lib/currency'
import { COLORS } from '@/lib/icons'
import { uid } from '@/lib/id'
import { evalExpr } from '@/lib/money'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import BottomSheet from './BottomSheet.vue'
import PillTabs from './PillTabs.vue'
import SelectField from './SelectField.vue'
import ToggleSwitch from './ToggleSwitch.vue'

const props = defineProps<{ account?: Account }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ removed: [] }>()
const data = useData()
const ui = useUi()

const name = ref('')
const kind = ref<AccountKind>('bank')
const initial = ref('')
const color = ref(COLORS[0]!)
const statementDay = ref(1)
const dueDay = ref(15)
const archived = ref(false)
const excluded = ref(false)
const currency = ref(BASE_CURRENCY)
const rateText = ref('')
/** the switch reads as "included", the data stores the opposite so old accounts count by default */
const included = computed({ get: () => !excluded.value, set: (v: boolean) => (excluded.value = !v) })

watch(open, (o) => {
  if (!o) return
  const a = props.account
  name.value = a?.name ?? ''
  kind.value = a?.kind ?? 'bank'
  initial.value = a ? String(a.initial) : ''
  color.value = a?.color ?? COLORS[data.accounts.length % COLORS.length]!
  statementDay.value = a?.statementDay ?? 1
  dueDay.value = a?.dueDay ?? 15
  archived.value = a?.archived ?? false
  excluded.value = a?.excluded ?? false
  currency.value = a?.currency ?? BASE_CURRENCY
  rateText.value = a?.rate ? String(a.rate) : ''
})

async function submit() {
  if (!name.value.trim()) return ui.toast('請輸入帳戶名稱', 'error')
  const init = evalExpr(initial.value)
  if (init == null) return ui.toast('初始餘額格式不正確', 'error')
  const day = (n: number) => Math.min(28, Math.max(1, Math.round(n) || 1))
  await save('accounts', {
    id: props.account?.id ?? uid(),
    name: name.value.trim(),
    kind: kind.value,
    initial: init,
    order: props.account?.order ?? data.accounts.length,
    color: color.value,
    ...(archived.value ? { archived: true } : {}),
    ...(excluded.value ? { excluded: true } : {}),
    ...(kind.value !== 'card' && currency.value !== BASE_CURRENCY ? { currency: currency.value, rate: evalExpr(rateText.value) ?? 0 } : {}),
    ...(kind.value === 'card' ? { statementDay: day(statementDay.value), dueDay: day(dueDay.value) } : {}),
  })
  open.value = false
}

async function destroy() {
  const a = props.account
  if (!a) return
  const used = data.records.some((r) => r.accountId === a.id || r.toAccountId === a.id)
  if (used) {
    ui.toast('這個帳戶已有記錄，不能刪除，可以改成「封存」', 'error')
    return
  }
  if (!(await ui.confirm(`刪除「${a.name}」？`, { danger: true, confirmText: '刪除' }))) return
  await remove('accounts', a.id)
  open.value = false
  emit('removed')
}
</script>

<template>
  <BottomSheet v-model="open" :title="account ? '編輯帳戶' : '新增帳戶'">
    <div class="space-y-4">
      <div>
        <label class="label">名稱</label>
        <input v-model="name" class="input" placeholder="例如：玉山銀行" maxlength="20" />
      </div>
      <div>
        <label class="label">類型</label>
        <PillTabs
          v-model="kind"
          size="sm"
          :options="[
            { value: 'cash', label: '現金' },
            { value: 'bank', label: '銀行' },
            { value: 'wallet', label: '電子錢包' },
            { value: 'card', label: '信用卡' },
          ]"
        />
      </div>
      <div v-if="kind !== 'card'">
        <label class="label">幣別</label>
        <SelectField v-model="currency" title="選擇幣別" :items="currencyItems" />
      </div>
      <div v-if="kind !== 'card' && currency !== BASE_CURRENCY" class="grid grid-cols-2 gap-3">
        <div>
          <label class="label">匯率（1 {{ currency }} = ? TWD）</label>
          <input v-model="rateText" class="input" inputmode="decimal" placeholder="還不知道就留空" />
        </div>
      </div>
      <div>
        <label class="label">{{ kind === 'card' ? '目前已欠金額（填負數，沒有就留空）' : '目前餘額' }}</label>
        <input v-model="initial" class="input" inputmode="decimal" placeholder="0" />
      </div>
      <div v-if="kind === 'card'" class="grid grid-cols-2 gap-3">
        <div>
          <label class="label">結帳日（每月幾號）</label>
          <input v-model.number="statementDay" type="number" min="1" max="28" class="input" />
        </div>
        <div>
          <label class="label">繳款日（每月幾號）</label>
          <input v-model.number="dueDay" type="number" min="1" max="28" class="input" />
        </div>
      </div>
      <div>
        <label class="label">顏色</label>
        <div class="flex flex-wrap gap-2.5">
          <button
            v-for="c in COLORS"
            :key="c"
            class="size-9 rounded-full ring-offset-2 ring-offset-bg transition"
            :class="color === c && 'ring-[3px] ring-primary'"
            :style="{ background: c }"
            :aria-label="c"
            @click="color = c"
          />
        </div>
      </div>
      <div>
        <label class="label">統計與顯示</label>
        <div class="mt-2 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm">納入總資產統計</span>
            <ToggleSwitch v-model="included" label="納入總資產統計" />
          </div>
          <div v-if="account" class="flex items-center justify-between gap-3">
            <span class="text-sm">封存<span class="block text-xs text-muted">不再出現在選單，記錄保留</span></span>
            <ToggleSwitch v-model="archived" label="封存" />
          </div>
        </div>
      </div>
      <div class="flex gap-2">
        <button v-if="account" class="btn btn-ghost text-danger" @click="destroy">刪除</button>
        <button class="btn btn-primary flex-1" @click="submit">儲存</button>
      </div>
    </div>
  </BottomSheet>
</template>
