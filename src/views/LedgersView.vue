<script setup lang="ts">
import { defaultBudget } from '@/lib/budget'
import { today, ym } from '@/lib/date'
import { computed, ref, watch } from 'vue'
import { currencyOf } from '@/lib/calc'
import { Plus } from '@/lib/uiIcons'
import { remove, save } from '@/db'
import type { Ledger } from '@/db/types'
import { baseCurrency } from '@/lib/currency'
import { useCurrencyItems, currencyName } from '@/lib/customCurrency'
import { COLORS } from '@/lib/icons'
import { uid } from '@/lib/id'
import { fmt } from '@/lib/money'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import BottomSheet from '@/components/BottomSheet.vue'
import CatIcon from '@/components/CatIcon.vue'
import PageHeader from '@/components/PageHeader.vue'
import SelectField from '@/components/SelectField.vue'

const data = useData()
const currencyItems = useCurrencyItems(() => currency.value)
const ui = useUi()

const open = ref(false)
const editing = ref<Ledger | null>(null)
const name = ref('')
const color = ref(COLORS[0]!)
const budget = ref('')
const currency = ref(baseCurrency.value)
/** empty: no preset, a new record starts with the account used last */
const accountId = ref('')
const accountItems = computed(() => [
  { value: '', label: '不指定' },
  ...data.sortedAccounts
    // a record keeps to its ledger's currency, so only an account in that currency can be the preset
    .filter((a) => (!a.archived || a.id === accountId.value) && currencyOf(a) === currency.value)
    .map((a) => ({ value: a.id, label: a.name })),
])
watch(currency, () => {
  if (accountId.value && currencyOf(data.accMap.get(accountId.value)) !== currency.value) accountId.value = ''
})
const foreign = computed(() => currency.value !== baseCurrency.value)

function edit(l?: Ledger) {
  editing.value = l ?? null
  name.value = l?.name ?? ''
  color.value = l?.color ?? COLORS[data.ledgers.length % COLORS.length]!
  budget.value = l?.budget ? String(l.budget) : ''
  currency.value = l?.currency ?? baseCurrency.value
  accountId.value = l?.accountId && data.accMap.has(l.accountId) ? l.accountId : ''
  open.value = true
}

async function submit() {
  if (!name.value.trim()) return ui.toast('請輸入帳本名稱', 'error')
  const old = editing.value
  // records already in the ledger are in its currency, so it cannot change under them
  if (old && (old.currency ?? baseCurrency.value) !== currency.value && data.records.some((r) => r.ledgerId === old.id)) {
    return ui.toast('這個帳本已經有記錄，不能改幣別', 'error')
  }
  await save('ledgers', {
    ...editing.value,
    currency: foreign.value ? currency.value : undefined,
    accountId: accountId.value || undefined,
    id: editing.value?.id ?? uid(),
    name: name.value.trim(),
    color: color.value,
    order: editing.value?.order ?? data.ledgers.length,
    ...defaultBudget(editing.value ?? undefined, Math.round(Number(budget.value)) || 0, ym(today())),
  })
  open.value = false
}

async function destroy() {
  const l = editing.value
  if (!l) return
  if (data.ledgers.length < 2) return ui.toast('至少要保留一個帳本', 'error')
  const n = data.records.filter((r) => r.ledgerId === l.id).length
  if (n) return ui.toast(`這個帳本還有 ${n} 筆記錄，請先移走或刪除`, 'error')
  if (!(await ui.confirm(`刪除帳本${l.name}？`, { danger: true, confirmText: '刪除' }))) return
  await remove('ledgers', l.id)
  open.value = false
}

const count = (id: string) => data.records.filter((r) => r.ledgerId === id).length

</script>

<template>
  <div>
    <PageHeader title="帳本">
      <template #right>
        <button class="circle-btn" aria-label="新增帳本" @click="edit()"><Plus :size="22" /></button>
      </template>
    </PageHeader>
    <p class="mb-3 px-1 text-sm text-muted">
      帳本把記錄分開管理，例如日常、旅行、家用。帳戶餘額仍然是所有帳本合計。
    </p>
    <div class="card divide-y divide-line p-0">
      <button v-for="l in data.sortedLedgers" :key="l.id" class="flex w-full items-center gap-3 px-4 py-3.5 text-left" @click="edit(l)">
        <CatIcon icon="book" :color="l.color" :size="40" />
        <span class="min-w-0 flex-1">
          <span class="block font-medium">{{ l.name }}</span>
          <span class="block text-xs text-muted">{{ currencyName(l.currency ?? baseCurrency) }}・{{ count(l.id) }} 筆{{ l.budget ? `，預設每月預算 $${fmt(l.budget)}` : '' }}</span>
        </span>
      </button>
    </div>

    <BottomSheet v-model="open" :title="editing ? '編輯帳本' : '新增帳本'">
      <div class="space-y-4">
        <div>
          <label class="label">名稱</label>
          <input v-model="name" class="input" maxlength="20" placeholder="例如：旅行" />
        </div>
        <div>
          <label class="label">幣別</label>
          <SelectField v-model="currency" title="選擇幣別" :items="currencyItems" inline />
          <p v-if="foreign" class="mt-1.5 px-1 text-xs text-muted">金額不會換算，只會影響同幣別的帳戶。</p>
        </div>
        <div>
          <label class="label">預設帳戶（選填）</label>
          <SelectField v-model="accountId" title="選擇預設帳戶" :items="accountItems" inline />
        </div>
        <div>
          <label class="label">預設每月預算（選填）</label>
          <input v-model="budget" class="input" inputmode="numeric" placeholder="0" />
        </div>
        <div>
          <label class="label">顏色</label>
          <div class="flex flex-wrap gap-2.5">
            <button
              v-for="c in COLORS"
              :key="c"
              class="size-9 rounded-full ring-offset-2 ring-offset-bg"
              :class="color === c && 'ring-[3px] ring-primary'"
              :style="{ background: c }"
              :aria-label="c"
              @click="color = c"
            />
          </div>
        </div>
        <div class="flex gap-2">
          <button v-if="editing" class="btn btn-ghost text-danger" @click="destroy">刪除</button>
          <button class="btn btn-primary flex-1" @click="submit">儲存</button>
        </div>
      </div>
    </BottomSheet>
  </div>
</template>
