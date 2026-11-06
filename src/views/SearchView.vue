<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { BookMarked, CalendarDays, Check, ChevronDown, Layers, ListChecks, Search, Store, Wallet } from '@/lib/uiIcons'
import { addDays, addYm, daysInMonth, today, ym } from '@/lib/date'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import PageHeader from '@/components/PageHeader.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import DateField from '@/components/DateField.vue'
import PillTabs from '@/components/PillTabs.vue'
import RecordList from '@/components/RecordList.vue'

const ui = useUi()
const data = useData()
const q = ref('')
const input = ref<HTMLInputElement>()
onMounted(() => input.value?.focus())

const selMerchants = ref<string[]>([])
const selCats = ref<string[]>([])
/** account ids; an empty id stands for records kept without an account */
const selAccounts = ref<string[]>([])
// searching from a ledger starts inside it, so its records are listed right away
const selLedgers = ref<string[]>(data.ledgers.length > 1 && data.ledgerId ? [data.ledgerId] : [])
const ledgerOn = computed(() => selLedgers.value.length > 0)
const from = ref('')
const to = ref('')
const hasDate = computed(() => !!from.value || !!to.value)
const hasFilter = computed(() => !!q.value.trim() || hasDate.value || selMerchants.value.length > 0 || selCats.value.length > 0 || selAccounts.value.length > 0 || ledgerOn.value)

/** ids a picked category stands for: itself, and its sub-categories when it is a top-level one */
const catIds = computed(() => {
  const ids = new Set<string>()
  for (const id of selCats.value) {
    ids.add(id)
    for (const c of data.categories) if (c.parentId === id) ids.add(c.id)
  }
  return ids
})

const results = computed(() => {
  const s = q.value.trim().toLowerCase()
  if (!hasFilter.value) return []
  return data.sortedRecords.filter((r) => {
    if (selLedgers.value.length && !selLedgers.value.includes(r.ledgerId)) return false
    if (from.value && r.date < from.value) return false
    if (to.value && r.date > to.value) return false
    if (selAccounts.value.length && !selAccounts.value.includes(r.accountId) && !(r.toAccountId && selAccounts.value.includes(r.toAccountId))) return false
    if (selMerchants.value.length && !(r.merchantId && selMerchants.value.includes(r.merchantId))) return false
    if (selCats.value.length && !r.lines.some((l) => catIds.value.has(l.categoryId))) return false
    if (!s) return true
    const hay = [
      r.note,
      ...(r.companions ?? []).map(data.memberName),
      r.merchantId ? data.merchantMap.get(r.merchantId)?.name : '',
      ...r.lines.flatMap((l) => [l.name, l.note, data.catPath(l.categoryId)]),
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(s)
  })
})

/** drawer pickers: pick a merchant or a category to fill the search box */
const picker = ref<'ledger' | 'account' | 'merchant' | 'cat' | 'date' | null>(null)
const pickerOpen = computed({ get: () => picker.value !== null, set: (v: boolean) => { if (!v) picker.value = null } })
/** top-level categories with their sub-categories */
const catTree = computed(() => {
  const all = data.sortedCategories
  return all.filter((c) => !c.parentId).map((t) => ({ top: t, subs: all.filter((c) => c.parentId === t.id) }))
})
const expanded = ref<string[]>([])
const catKind = ref<'expense' | 'income'>('expense')
/** what is typed in a drawer's own search box (cleared whenever a drawer opens or closes) */
const pq = ref('')
watch(picker, () => (pq.value = ''))
const has = (name: string) => name.toLowerCase().includes(pq.value.trim().toLowerCase())
const shownTree = computed(() =>
  catTree.value
    .filter((n) => n.top.kind === catKind.value)
    .flatMap((n) => {
      if (!pq.value.trim() || has(n.top.name)) return [n]
      const subs = n.subs.filter((c) => has(c.name))
      return subs.length ? [{ ...n, subs }] : []
    }),
)
const shownMerchants = computed(() => data.merchants.filter((m) => has(m.name)))
const shownLedgers = computed(() => data.sortedLedgers.filter((l) => has(l.name)))
/** the accounts, and a last choice for the records that were kept without one (only when there are some) */
const shownAccounts = computed(() => [
  ...data.sortedAccounts.filter((a) => has(a.name)).map((a) => ({ id: a.id, name: a.name })),
  ...(data.records.some((r) => !r.accountId) && has('不指定帳戶') ? [{ id: '', name: '不指定帳戶' }] : []),
])
const accountName = (id: string) => (id ? (data.accMap.get(id)?.name ?? '') : '不指定帳戶')
const isOpen = (id: string) => !!pq.value.trim() || expanded.value.includes(id)
/** a top-level category is picked as a whole, a sub-category on its own; picking a whole one ticks all its subs */
function toggleCat(id: string) {
  const node = catTree.value.find((n) => n.top.id === id)
  const on = !selCats.value.includes(id)
  const ids = node ? [id, ...node.subs.map((c) => c.id)] : [id]
  selCats.value = on ? [...new Set([...selCats.value, ...ids])] : selCats.value.filter((x) => !ids.includes(x))
  if (!node) {
    const parent = catTree.value.find((n) => n.subs.some((c) => c.id === id))
    if (parent) {
      const all = parent.subs.every((c) => selCats.value.includes(c.id))
      const rest = selCats.value.filter((x) => x !== parent.top.id)
      selCats.value = all ? [...rest, parent.top.id] : rest
    }
  }
}
const pickedSubs = (n: { subs: { id: string }[] }) => n.subs.filter((c) => selCats.value.includes(c.id)).length
/** names the category chip shows: a whole group by its name, otherwise the sub-categories picked */
const catLabels = computed(() =>
  catTree.value.flatMap((n) =>
    selCats.value.includes(n.top.id) ? [n.top.name] : n.subs.filter((c) => selCats.value.includes(c.id)).map((c) => c.name),
  ),
)
function toggle(list: string[], id: string) {
  const i = list.indexOf(id)
  if (i >= 0) list.splice(i, 1)
  else list.push(id)
}
const ledgerName = (id: string) => data.ledgerMap.get(id)?.name ?? ''
const merchantName = (id: string) => data.merchantMap.get(id)?.name ?? ''
const summary = (names: string[]) => (names.length > 1 ? `${names[0]} +${names.length - 1}` : (names[0] ?? ''))
const presetHit = computed(() => (hasDate.value ? presets.find((p) => p.range()[0] === from.value && p.range()[1] === to.value) : undefined))
/** the two date boxes are tucked away until 自訂 is tapped; a range that is not one of the quick ones keeps them open */
const custom = ref(false)
const showCustom = computed(() => custom.value || (hasDate.value && !presetHit.value))
const dateLabel = computed(() => {
  if (!hasDate.value) return ''
  const hit = presetHit.value
  if (hit) return hit.label
  return `${from.value ? from.value.slice(5) : '…'} – ${to.value ? to.value.slice(5) : '…'}`
})
const monthRange = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return [`${m}-01`, `${m}-${String(daysInMonth(y!, mo! - 1)).padStart(2, '0')}`] as const
}
const presets = [
  { label: '今天', range: () => [today(), today()] as const },
  { label: '近 7 天', range: () => [addDays(today(), -6), today()] as const },
  { label: '近 30 天', range: () => [addDays(today(), -29), today()] as const },
  { label: '本月', range: () => monthRange(ym(today())) },
  { label: '上月', range: () => monthRange(addYm(ym(today()), -1)) },
  { label: '今年', range: () => [`${today().slice(0, 4)}-01-01`, `${today().slice(0, 4)}-12-31`] as const },
  { label: '去年', range: () => [`${Number(today().slice(0, 4)) - 1}-01-01`, `${Number(today().slice(0, 4)) - 1}-12-31`] as const },
]
function setRange(r: readonly [string, string]) {
  custom.value = false
  from.value = r[0]
  to.value = r[1]
}
function clearFilters() {
  from.value = ''
  to.value = ''
  selMerchants.value = []
  selLedgers.value = []
  selCats.value = []
  selAccounts.value = []
}
</script>

<template>
  <div>
    <PageHeader title="搜尋">
      <template #right>
        <button :disabled="!(hasFilter && results.length)" class="circle-btn" :aria-label="ui.selecting ? '取消選取' : '選取'" @click="ui.selecting ? ui.stopSelect() : ui.startSelect()">
          <ListChecks :size="21" />
        </button>
      </template>
    </PageHeader>
    <div class="relative mb-4">
      <Search :size="18" class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
      <input ref="input" v-model="q" class="input pl-11" placeholder="品項、商家、分類或備註" />
    </div>
    <!-- one row of filters; each opens a drawer and shows what it holds once set -->
    <div class="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]">
      <button
        v-for="f in [
          ...(data.ledgers.length > 1 ? [{ key: 'ledger', label: '帳本', value: summary(selLedgers.map(ledgerName)) }] : []),
          { key: 'date', label: '日期', value: dateLabel },
          { key: 'merchant', label: '商家', value: summary(selMerchants.map(merchantName)) },
          { key: 'cat', label: '分類', value: summary(catLabels) },
          { key: 'account', label: '帳戶', value: summary(selAccounts.map(accountName)) },
        ]"
        :key="f.key"
        class="flex shrink-0 items-center gap-1 rounded-full px-3.5 py-2 text-sm ring-1"
        :class="f.value ? 'bg-primary-soft font-semibold text-primary-strong ring-primary/40' : 'bg-surface text-ink ring-line'"
        @click="picker = f.key as 'ledger' | 'account' | 'merchant' | 'cat' | 'date'"
      >
        <component :is="{ ledger: BookMarked, account: Wallet, date: CalendarDays, merchant: Store, cat: Layers }[f.key]" :size="15" />
        {{ f.value ? `${f.label}：${f.value}` : f.label }}
        <ChevronDown :size="14" class="opacity-60" />
      </button>
    </div>
    <template v-if="hasFilter">
      <div class="mb-2 flex items-center justify-between px-1">
        <p class="text-sm text-muted">
          {{ results.length }} 筆
        </p>
        <button v-if="selMerchants.length || selCats.length || selAccounts.length || ledgerOn || hasDate" class="text-sm text-muted" @click="clearFilters">清除篩選</button>
      </div>
      <RecordList v-if="results.length" :records="results.slice(0, 200)" show-date :show-ledger="selLedgers.length !== 1" />
    </template>

    <BottomSheet v-model="pickerOpen" :title="picker === 'cat' ? '選擇分類（可多選）' : picker === 'date' ? '選擇日期' : picker === 'ledger' ? '選擇帳本（可多選）' : picker === 'account' ? '選擇帳戶（可多選）' : '選擇商家（可多選）'">
      <template v-if="picker && picker !== 'date'" #search>
      <div class="relative">
        <Search :size="16" class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input v-model="pq" class="input pl-10" :placeholder="picker === 'cat' ? '搜尋分類' : picker === 'ledger' ? '搜尋帳本' : picker === 'account' ? '搜尋帳戶' : '搜尋商家'" />
      </div>
      <PillTabs v-if="picker === 'cat'" v-model="catKind" class="mt-3" :options="[{ value: 'expense', label: '支出' }, { value: 'income', label: '收入' }]" />
      </template>
      <div v-if="picker === 'date'" class="pt-1 pb-2">
        <p class="mb-2 px-0.5 text-xs text-muted">快速選擇</p>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="p in presets"
            :key="p.label"
            class="rounded-xl px-1 py-2.5 text-sm ring-1"
            :class="!showCustom && dateLabel === p.label ? 'bg-primary-soft font-semibold text-primary-strong ring-primary/40' : 'bg-surface ring-line'"
            @click="setRange(p.range())"
          >
            {{ p.label }}
          </button>
          <button
            class="rounded-xl px-1 py-2.5 text-sm ring-1"
            :class="showCustom ? 'bg-primary-soft font-semibold text-primary-strong ring-primary/40' : 'bg-surface ring-line'"
            @click="custom = true"
          >
            自訂
          </button>
        </div>
        <p v-if="showCustom" class="mt-5 mb-2 px-0.5 text-xs text-muted">自訂區間</p>
        <div v-if="showCustom" class="flex items-center gap-2">
          <DateField v-model="from" title="開始日期" placeholder="開始日期" clearable compact class="min-w-0 flex-1" />
          <span class="text-muted">–</span>
          <DateField v-model="to" title="結束日期" placeholder="結束日期" clearable compact class="min-w-0 flex-1" />
        </div>
      </div>
      <ul v-if="picker === 'ledger'" class="mb-2 divide-y divide-line">
        <li v-for="l in shownLedgers" :key="l.id">
          <button class="flex w-full items-center justify-between px-1 py-3.5 text-left" @click="toggle(selLedgers, l.id)">
            <span :class="selLedgers.includes(l.id) && 'font-semibold text-primary'">{{ l.name }}</span>
            <Check v-if="selLedgers.includes(l.id)" :size="18" class="text-primary" />
          </button>
        </li>
      </ul>
      <ul v-else-if="picker === 'account'" class="mb-2 divide-y divide-line">
        <li v-for="a in shownAccounts" :key="a.id">
          <button class="flex w-full items-center justify-between px-1 py-3.5 text-left" @click="toggle(selAccounts, a.id)">
            <span :class="selAccounts.includes(a.id) && 'font-semibold text-primary'">{{ a.name }}</span>
            <Check v-if="selAccounts.includes(a.id)" :size="18" class="text-primary" />
          </button>
        </li>
        <li v-if="!shownAccounts.length" class="py-6 text-center text-sm text-muted">找不到帳戶</li>
      </ul>
      <ul v-else-if="picker === 'merchant'" class="mb-2 divide-y divide-line">
        <li v-for="m in shownMerchants" :key="m.id">
          <button class="flex w-full items-center justify-between px-1 py-3.5 text-left" @click="toggle(selMerchants, m.id)">
            <span :class="selMerchants.includes(m.id) && 'font-semibold text-primary'">{{ m.name }}</span>
            <Check v-if="selMerchants.includes(m.id)" :size="18" class="text-primary" />
          </button>
        </li>
        <li v-if="!shownMerchants.length" class="py-6 text-center text-sm text-muted">{{ pq.trim() ? '找不到商家' : '還沒有商家' }}</li>
      </ul>
      <template v-else-if="picker === 'cat'">
      <ul class="mb-2 divide-y divide-line">
        <li v-for="n in shownTree" :key="n.top.id">
          <div class="flex items-center">
            <button
              v-if="n.subs.length"
              class="grid size-11 shrink-0 place-items-center text-muted"
              :aria-label="isOpen(n.top.id) ? '收合' : '展開'"
              @click="toggle(expanded, n.top.id)"
            >
              <ChevronDown :size="16" class="transition-transform" :class="!isOpen(n.top.id) && '-rotate-90'" />
            </button>
            <span v-else class="size-11 shrink-0" />
            <button class="flex min-w-0 flex-1 items-center justify-between py-3.5 pr-1 text-left font-medium" @click="toggleCat(n.top.id)">
              <span :class="selCats.includes(n.top.id) && 'font-semibold text-primary'">{{ n.top.name }}</span>
              <Check v-if="selCats.includes(n.top.id)" :size="18" class="text-primary" />
              <span v-else-if="pickedSubs(n)" class="text-xs font-normal text-primary">已選 {{ pickedSubs(n) }}</span>
            </button>
          </div>
          <template v-if="isOpen(n.top.id)">
            <button
              v-for="c in n.subs"
              :key="c.id"
              class="flex w-full items-center justify-between border-t border-line py-3 pr-1 pl-11 text-left text-sm"
              @click="toggleCat(c.id)"
            >
              <span :class="selCats.includes(c.id) && 'font-semibold text-primary'">{{ c.name }}</span>
              <Check v-if="selCats.includes(c.id)" :size="18" class="text-primary" />
            </button>
          </template>
        </li>
      </ul>
      </template>
      <template #footer>
        <div class="flex gap-2">
          <button v-if="picker === 'date' && hasDate" class="btn btn-ghost" @click="from = to = ''">清除</button>
          <button class="btn btn-primary flex-1" @click="picker = null">完成</button>
        </div>
      </template>
    </BottomSheet>
  </div>
</template>
