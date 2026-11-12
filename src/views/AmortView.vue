<script setup lang="ts">
import MoneyText from '@/components/MoneyText.vue'
import { computed, ref } from 'vue'
import { Plus } from '@/lib/uiIcons'
import { save } from '@/db'
import type { Line, Rec } from '@/db/types'
import { addYm, ym } from '@/lib/date'
import { fmt } from '@/lib/money'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import BottomSheet from '@/components/BottomSheet.vue'
import CatIcon from '@/components/CatIcon.vue'
import PageHeader from '@/components/PageHeader.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'
import { lineName } from '@/lib/recurrence'

interface Item {
  rec: Rec
  line: Line
}

const data = useData()
const ui = useUi()
const { s } = useSettings()

const all = computed<Item[]>(() =>
  data.records
    .filter((r) => r.type === 'expense')
    .flatMap((rec) => rec.lines.map((line) => ({ rec, line })))
    .sort((a, b) => b.rec.date.localeCompare(a.rec.date) || b.rec.time.localeCompare(a.rec.time)),
)
const running = computed(() => all.value.filter((i) => (i.line.amortMonths ?? 1) > 1))

const title = (i: Item) => lineName(i.line) || data.catName(i.line.categoryId)
const shop = (i: Item) => (i.rec.merchantId ? (data.merchantMap.get(i.rec.merchantId)?.name ?? '') : '')
const perMonth = (amount: number, months: number) => Math.round(amount / months)
const lastMonth = (i: Item, months: number) => addYm(ym(i.rec.date), months - 1)

// pick an expense to spread
const pickOpen = ref(false)
const query = ref('')
const candidates = computed(() => {
  const q = query.value.trim().toLowerCase()
  return all.value
    .filter((i) => (i.line.amortMonths ?? 1) <= 1)
    .filter((i) => !q || `${title(i)} ${shop(i)}`.toLowerCase().includes(q))
    .slice(0, 60)
})

// choose the number of months
const MONTHS = [3, 6, 12, 24, 36]
const target = ref<Item | null>(null)
const months = ref(12)
const monthsOpen = computed({
  get: () => target.value !== null,
  set: (v: boolean) => {
    if (!v) target.value = null
  },
})

function choose(i: Item) {
  pickOpen.value = false
  months.value = i.line.amortMonths && i.line.amortMonths > 1 ? i.line.amortMonths : 12
  target.value = i
}

async function customMonths() {
  const v = await ui.prompt('攤提月數', { value: String(MONTHS.includes(months.value) ? '' : months.value), placeholder: '例如 18' })
  const n = Number(v)
  if (v && Number.isInteger(n) && n >= 2 && n <= 120) months.value = n
  else if (v) ui.toast('請輸入 2 到 120 的整數', 'error')
}

async function apply(n: number) {
  const t = target.value
  if (!t) return
  const lines = t.rec.lines.map((l) => {
    if (l.id !== t.line.id) return l
    const next = { ...l }
    if (n > 1) next.amortMonths = n
    else delete next.amortMonths
    return next
  })
  await save('records', { ...t.rec, lines })
  target.value = null
  ui.toast(n > 1 ? `已分 ${n} 個月攤提` : '已取消攤提', 'success')
}
</script>

<template>
  <div>
    <PageHeader title="攤提">
      <template #right>
        <button class="circle-btn" aria-label="新增攤提" @click="pickOpen = true"><Plus :size="22" /></button>
      </template>
    </PageHeader>

    <p class="mb-3 px-1 text-sm text-muted">
      把一筆大額支出（例如年繳的保險、年繳的串流訂閱、買家電）平均分到之後每個月的報表。現金還是在付款那天扣，只有統計會分月計算。
    </p>
    <div class="card mb-4 flex items-center justify-between gap-3 px-4 py-3.5">
      <span class="font-semibold">報表分月計算</span>
      <ToggleSwitch v-model="s.amortize" label="攤提" />
    </div>

    <div v-if="running.length" class="card divide-y divide-line p-0">
      <button v-for="i in running" :key="`${i.rec.id}-${i.line.id}`" class="flex w-full items-center gap-3 px-4 py-3.5 text-left" @click="choose(i)">
        <CatIcon :icon="data.catMap.get(i.line.categoryId)?.icon" :color="data.catMap.get(i.line.categoryId)?.color" :size="40" />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium">{{ title(i) }}</span>
          <span class="block truncate text-xs text-muted">
            每月 <MoneyText :n="perMonth(i.line.amount, i.line.amortMonths!)" />，到 {{ lastMonth(i, i.line.amortMonths!) }}
          </span>
        </span>
        <span class="text-right">
          <span class="block font-semibold"><MoneyText :n="i.line.amount" /></span>
          <span class="block text-xs text-muted">分 {{ i.line.amortMonths }} 個月</span>
        </span>
      </button>
    </div>
    <div v-else class="card py-12 text-center">
      <p class="text-sm text-muted">還沒有攤提中的支出</p>
      <button class="btn btn-soft mt-4" @click="pickOpen = true"><Plus :size="16" />選一筆支出來攤提</button>
    </div>

    <BottomSheet v-model="pickOpen" title="選擇要攤提的支出">
      <input v-model="query" class="input mb-3" placeholder="搜尋品項或商家" />
      <p v-if="!candidates.length" class="py-8 text-center text-sm text-muted">找不到支出</p>
      <ul v-else class="card divide-y divide-line p-0">
        <li v-for="i in candidates" :key="`${i.rec.id}-${i.line.id}`">
          <button class="flex w-full items-center gap-3 px-4 py-3 text-left" @click="choose(i)">
            <CatIcon :icon="data.catMap.get(i.line.categoryId)?.icon" :color="data.catMap.get(i.line.categoryId)?.color" :size="36" />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ title(i) }}</span>
              <span class="block truncate text-xs text-muted">{{ i.rec.date }}{{ shop(i) ? `　${shop(i)}` : '' }}</span>
            </span>
            <span class="font-semibold"><MoneyText :n="i.line.amount" /></span>
          </button>
        </li>
      </ul>
    </BottomSheet>

    <BottomSheet v-model="monthsOpen" :title="target ? title(target) : ''">
      <div v-if="target" class="space-y-4">
        <div class="card text-center">
          <p class="text-xs text-muted">{{ target.rec.date }} 付款</p>
          <p class="text-3xl font-bold"><MoneyText :n="target.line.amount" /></p>
          <p class="mt-2 text-sm">
            分 {{ months }} 個月，每月 <b><MoneyText :n="perMonth(target.line.amount, months)" /></b>
          </p>
          <p class="text-xs text-muted">{{ ym(target.rec.date) }} 到 {{ lastMonth(target, months) }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button v-for="n in MONTHS" :key="n" class="chip" :class="months === n && 'chip-on'" @click="months = n">{{ n }} 個月</button>
          <button class="chip" :class="!MONTHS.includes(months) && 'chip-on'" @click="customMonths">
            {{ MONTHS.includes(months) ? '自訂' : `${months} 個月` }}
          </button>
        </div>
        <div class="flex gap-2">
          <button v-if="(target.line.amortMonths ?? 1) > 1" class="btn btn-ghost text-danger" @click="apply(1)">取消攤提</button>
          <button class="btn btn-primary flex-1" @click="apply(months)">儲存</button>
        </div>
      </div>
    </BottomSheet>
  </div>
</template>
