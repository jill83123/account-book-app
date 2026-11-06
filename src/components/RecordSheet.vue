<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeftRight, BookMarked, Clock, Copy, Pencil, Repeat, Scale, Store, Trash2, Users, Wallet } from '@/lib/uiIcons'
import { P } from '@/lib/colors'
import { remove, save } from '@/db'
import { forgetPhotos, loadPhotos, releasePhotos, type Photo } from '@/lib/images'
import { addedAt, weekday, WEEKDAYS } from '@/lib/date'
import { evalExpr, fmt, fmtFx, fmtRate } from '@/lib/money'
import { loanOutstanding } from '@/lib/calc'
import { baseCurrency } from '@/lib/currency'
import { baseName } from '@/lib/customCurrency'
import { myTotal } from '@/lib/split'
import { foreignTotal, isPending } from '@/lib/fx'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import BottomSheet from './BottomSheet.vue'
import ImageViewer from './ImageViewer.vue'
import CatIcon from './CatIcon.vue'
import CatPath from './CatPath.vue'
import DateField from './DateField.vue'

const router = useRouter()
const data = useData()
const ui = useUi()

const rec = computed(() => data.records.find((r) => r.id === ui.viewingId))

/** a one-item record says its category under the title; the date then goes with the other facts */
/** true: show the whole path; a string: just that; empty: nothing */
const catAbove = computed<boolean | string>(() => {
  const r = rec.value
  if (!r || !showCat.value) return false
  const c = data.catMap.get(r.lines[0]!.categoryId)
  if (!c) return false
  if (title.value !== c.name) return true
  return (c.parentId && data.catMap.get(c.parentId)?.name) || false
})
const showCat = computed(() => Boolean(rec.value && rec.value.type !== 'transfer' && !rec.value.adjust && rec.value.lines.length === 1))

/** what one person still owes on this shared bill, from the loan made for it */
const loanOf = (id: string) => data.loans.find((l) => l.recordId === rec.value?.id && l.personId === id)
const shareLeft = (id: string) => {
  const l = loanOf(id)
  return l ? Math.max(0, loanOutstanding(l)) : 0
}
const shareStatus = (id: string) => {
  const l = loanOf(id)
  if (!l) return ''
  const left = shareLeft(id)
  return left === 0 ? '已還' : left < l.principal ? `還欠 $${fmt(left)}` : l.direction === 'borrow' ? `欠${data.memberName(id)}` : '欠你'
}
const open = computed({
  get: () => Boolean(rec.value),
  set: (v: boolean) => !v && (ui.viewingId = ''),
})

const typeLabel = computed(() => (rec.value?.adjust ? '餘額調整' : ({ expense: '支出', income: '收入', transfer: '轉帳' })[rec.value?.type ?? 'expense']))
const tone = computed(() =>
  rec.value?.type === 'income' ? 'text-income' : rec.value?.type === 'expense' ? 'text-expense' : 'text-muted',
)
const merchant = computed(() => (rec.value?.merchantId ? (data.merchantMap.get(rec.value.merchantId)?.name ?? '') : ''))
const rule = computed(() => data.recurrings.find((r) => r.id === rec.value?.recurringId))
const account = (id?: string) => (id ? (data.accMap.get(id)?.name ?? '') : '')
/** items spread over different categories get the "many kinds" icon; all in one category show that category */
const mixed = computed(() => (rec.value?.lines ?? []).some((l) => l.categoryId !== rec.value!.lines[0]!.categoryId))
/** a one-item record has more to show only when it has parts, a note, a spread or a foreign price */
const oneItemExtras = computed(() => {
  const r = rec.value
  if (!r || r.type === 'transfer' || r.adjust || r.lines.length !== 1) return false
  const l = r.lines[0]!
  return Boolean(l.details?.length || l.note || (l.amortMonths ?? 1) > 1 || (l.original != null && r.currency))
})
const firstCat = computed(() => data.catMap.get(rec.value?.lines[0]?.categoryId ?? ''))

const title = computed(() => {
  const r = rec.value
  if (!r) return ''
  if (r.type === 'transfer') return '轉帳'
  if (r.adjust) return '餘額調整'
  if (r.lines.length > 1) return merchant.value || `${r.lines.length} 個品項`
  const l = r.lines[0]
  return l?.name || data.catName(l?.categoryId ?? '') || '未命名'
})

const when = computed(() => {
  const r = rec.value
  if (!r) return ''
  const [y, m, d] = r.date.split('-')
  return `${y}/${m}/${d}（週${WEEKDAYS[weekday(r.date)]}）${r.time ? ` ${r.time}` : ''}`
})

/** the small facts about the record, each with its own icon, two to a row */
const details = computed(() => {
  const r = rec.value
  if (!r) return []
  const out: { icon: Component; text: string; wide?: boolean; empty?: boolean }[] = [
    r.type === 'transfer'
      ? { icon: ArrowLeftRight, text: `${account(r.accountId)} → ${account(r.toAccountId)}`, wide: true }
      : { icon: Wallet, text: account(r.accountId) },
  ]
  if (r.type !== 'transfer') out.push({ icon: BookMarked, text: data.ledgerMap.get(r.ledgerId)?.name ?? '' })
  // merchant and companions are always listed for an income or expense; when empty only the greyed icon shows
  if (r.type !== 'transfer' && !r.adjust) {
    out.push({ icon: Store, text: merchant.value, empty: !merchant.value })
    out.push({ icon: Users, text: r.companions?.length ? `和${r.companions.map(data.memberName).join('、')}` : '', empty: !r.companions?.length })
  }
  if (r.recurringId) out.push({ icon: Repeat, text: rule.value?.name ?? '週期交易' })
  if (isPending(r)) out.push({ icon: ArrowLeftRight, text: `還沒換算成${baseName()}` })
  if (r.currency && r.rate) out.push({ icon: ArrowLeftRight, text: `1 ${r.currency} = ${fmtRate(r.rate)} ${baseCurrency.value}` })
  return out
})

// the photos attached to it
const photos = ref<Photo[]>([])
const big = ref('')
watch(
  () => rec.value?.id,
  async (id) => {
    releasePhotos(photos.value)
    photos.value = id ? await loadPhotos(id) : []
  },
  { immediate: true },
)

function edit() {
  const id = ui.viewingId
  ui.viewingId = ''
  void router.push(`/record/${id}`)
}

function copy() {
  const id = ui.viewingId
  ui.viewingId = ''
  void router.push({ path: '/record/new', query: { copy: id } })
}

// ---- changing a balance adjustment: its amount (a plus raises the balance, a minus lowers it) and its date
const adjOpen = ref(false)
const adjText = ref('')
const adjDate = ref('')
function editAdjust() {
  const r = rec.value
  if (!r) return
  adjText.value = String(r.type === 'income' ? r.total : -r.total)
  adjDate.value = r.date
  adjOpen.value = true
}
async function saveAdjust() {
  const r = rec.value
  const n = evalExpr(adjText.value)
  if (!r) return
  if (n == null || n === 0) return ui.toast('請輸入調整金額，不能是 0', 'error')
  await save('records', { ...r, type: n > 0 ? 'income' : 'expense', total: Math.abs(n), date: adjDate.value || r.date })
  adjOpen.value = false
}

async function destroy() {
  const id = ui.viewingId
  if (!(await ui.confirm('刪除這筆記錄？', { danger: true, confirmText: '刪除' }))) return
  await remove('records', id)
  await forgetPhotos(id)
  ui.viewingId = ''
  ui.toast('已刪除', 'info')
}
</script>

<template>
  <BottomSheet v-model="open" :title="typeLabel">
    <template v-if="rec" #actions>
      <button class="icon-btn border-0 bg-transparent text-danger" :aria-label="rec.adjust ? '刪除調整' : '刪除'" @click="destroy"><Trash2 :size="18" /></button>
    </template>
    <div v-if="rec" class="space-y-3">
      <!-- what and how much -->
      <div class="flex items-center gap-3 pb-1">
        <span v-if="rec.type === 'transfer' || rec.adjust" class="grid size-11 shrink-0 place-items-center rounded-[13px] bg-surface-2 text-muted">
          <Scale v-if="rec.adjust" :size="21" />
          <ArrowLeftRight v-else :size="21" />
        </span>
        <CatIcon v-else-if="!mixed" :icon="firstCat?.icon" :color="firstCat?.color" :size="44" />
        <CatIcon v-else icon="multi" :color="P.blue" :size="44" />
        <div class="min-w-0 flex-1">
          <!-- the category above the title; when the title is the category itself, only the group it belongs to -->
          <p v-if="catAbove === true" class="mb-0.5 flex min-w-0 items-center text-xs text-ink/70"><CatPath :id="rec.lines[0]!.categoryId" /></p>
          <p v-else-if="catAbove" class="mb-0.5 truncate text-xs text-ink/70">{{ catAbove }}</p>
          <p class="truncate text-lg leading-tight font-bold">{{ title }}</p>
        </div>
        <p class="text-2xl font-bold" :class="tone">{{ isPending(rec) ? `${rec.currency} ${fmtFx(foreignTotal(rec))}` : `$${fmt(myTotal(rec))}` }}</p>
      </div>

      <!-- the items -->
      <!-- one item: the header already says what it is and how much, so only what it adds is listed -->
      <div v-if="oneItemExtras" class="space-y-2 rounded-2xl border border-line bg-surface px-4 py-3">
        <div v-if="rec.lines[0]!.note || (rec.lines[0]!.amortMonths ?? 1) > 1 || (rec.lines[0]!.original != null && rec.currency)" class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
          <span v-if="rec.lines[0]!.note">{{ rec.lines[0]!.note }}</span>
          <span v-if="rec.lines[0]!.amortMonths && rec.lines[0]!.amortMonths > 1">分 {{ rec.lines[0]!.amortMonths }} 個月攤提</span>
          <span v-if="rec.lines[0]!.original != null && rec.currency">{{ rec.currency }} {{ fmtFx(rec.lines[0]!.original!) }}</span>
        </div>
        <ul v-if="rec.lines[0]!.details?.length" class="space-y-1 text-sm">
          <li v-for="(d, i) in rec.lines[0]!.details" :key="i" class="flex justify-between gap-3">
            <span class="min-w-0 truncate">{{ d.name }}<span v-if="d.qty" class="text-muted"> ×{{ d.qty }}</span></span>
            <span v-if="d.amount" class="shrink-0">${{ fmt(d.amount) }}</span>
          </li>
        </ul>
      </div>

      <ul v-else-if="rec.type !== 'transfer' && !rec.adjust && rec.lines.length > 1" class="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
        <li v-for="l in rec.lines" :key="l.id" class="flex items-center gap-3 py-3">
          <CatIcon :icon="data.catMap.get(l.categoryId)?.icon" :color="data.catMap.get(l.categoryId)?.color" :size="36" />
          <div class="min-w-0 flex-1">
            <p class="mb-0.5 flex min-w-0 items-center text-xs text-ink/70"><CatPath :id="l.categoryId" /></p>
            <p class="truncate text-sm font-medium">{{ l.name || data.catName(l.categoryId) }}</p>
            <p v-if="l.note || (l.amortMonths && l.amortMonths > 1)" class="flex items-center gap-2 truncate text-xs text-muted">
              <span v-if="l.note" class="truncate">{{ l.note }}</span>
              <span v-if="l.amortMonths && l.amortMonths > 1" class="shrink-0">分 {{ l.amortMonths }} 個月攤提</span>
            </p>
            <p v-if="l.details?.length" class="mt-0.5 text-xs text-ink">
              {{ l.details.map((d) => `${d.name}${d.qty ? ` ×${d.qty}` : ''}${d.amount ? ` $${fmt(d.amount)}` : ''}`).join('、') }}
            </p>
          </div>
          <div class="text-right">
            <p class="text-sm font-semibold">${{ fmt(l.amount) }}</p>
            <p v-if="l.original != null && rec.currency" class="text-xs text-muted">{{ rec.currency }} {{ fmtFx(l.original) }}</p>
          </div>
        </li>
      </ul>

      <!-- a shared bill: what was paid, and what each of the others still owes -->
      <div v-if="rec.split" class="rounded-2xl border border-line bg-surface px-4 text-sm">
        <div class="flex items-center justify-between pt-3 pb-1 text-xs text-muted">
          <span>{{ rec.split.mode === 'advance' ? '代墊' : rec.split.mode === 'other' ? '別人付' : '分帳' }}</span>
          <span class="tabular-nums">{{ rec.split.mode === 'other' ? `${data.memberName(rec.split.payer ?? '')} 先付了` : '共付' }} ${{ fmt(rec.total) }}</span>
        </div>
        <ul class="pb-2">
          <li class="flex items-center gap-2 py-1.5">
            <span class="min-w-0 flex-1">我</span>
            <span
              v-if="rec.split.mode === 'other' && rec.split.payer && shareStatus(rec.split.payer)"
              class="shrink-0 rounded-full px-2 py-0.5 text-xs"
              :class="shareLeft(rec.split.payer) > 0 ? 'bg-primary-soft text-primary-strong' : 'bg-surface-2 text-muted'"
            >{{ shareStatus(rec.split.payer) }}</span>
            <span class="text-right font-medium tabular-nums">${{ fmt(myTotal(rec)) }}</span>
          </li>
          <li v-for="p in rec.split.shares" :key="p.memberId" class="flex items-center gap-2 py-1.5">
            <span class="min-w-0 flex-1 truncate">{{ data.memberName(p.memberId) }}</span>
            <span v-if="shareStatus(p.memberId)" class="shrink-0 rounded-full px-2 py-0.5 text-xs" :class="shareLeft(p.memberId) > 0 ? 'bg-primary-soft text-primary-strong' : 'bg-surface-2 text-muted'">{{ shareStatus(p.memberId) }}</span>
            <span class="text-right font-medium tabular-nums">${{ fmt(p.amount) }}</span>
          </li>
        </ul>
      </div>

      <!-- account, ledger, merchant ... -->
      <ul class="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-sm">
        <li v-for="(d, i) in details" :key="i" class="flex min-w-0 items-center gap-2.5" :class="d.wide && 'col-span-2'">
          <component :is="d.icon" :size="16" class="shrink-0" :class="d.empty ? 'text-muted/50' : 'text-muted'" />
          <span class="truncate" :class="d.empty && 'text-muted'">{{ d.text }}</span>
        </li>
        <li class="col-span-2 flex min-w-0 items-center gap-2.5">
          <Clock :size="16" class="shrink-0 text-muted" />
          <span class="truncate">{{ when }}</span>
        </li>
      </ul>

      <p v-if="rec.note && !rec.adjust" class="rounded-2xl bg-surface-2 p-3.5 text-sm whitespace-pre-wrap">{{ rec.note }}</p>

      <!-- the photos on the left, the quiet record of when it was added and changed on the right -->
      <div v-if="photos.length || rec.updatedAt" class="flex items-end justify-between gap-3">
        <div class="flex min-w-0 gap-2 overflow-x-auto scrollbar-none">
          <button v-for="p in photos" :key="p.id" class="size-16 shrink-0 overflow-hidden rounded-xl border border-line" aria-label="放大圖片" @click="big = p.url">
            <img :src="p.url" alt="" class="size-full object-cover" />
          </button>
        </div>
        <dl v-if="rec.updatedAt" class="ml-auto grid shrink-0 grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-right text-[11px] leading-tight text-muted/80">
          <template v-if="rec.createdAt">
            <dt>新增</dt>
            <dd class="tabular-nums">{{ addedAt(rec.createdAt) }}</dd>
          </template>
          <!-- records from before the add time was kept only have the last change; one just added has no change yet -->
          <template v-if="!rec.createdAt || rec.updatedAt - rec.createdAt > 60_000">
            <dt>編輯</dt>
            <dd class="tabular-nums">{{ addedAt(rec.updatedAt) }}</dd>
          </template>
        </dl>
      </div>

      <!-- an adjustment has no items to edit or copy; deleting it brings the old balance back -->
      <div v-if="rec.adjust" class="pt-2">
        <button class="btn btn-primary w-full" @click="editAdjust"><Pencil :size="17" />編輯</button>
      </div>
      <div v-else class="grid grid-cols-[auto_1fr] gap-2 pt-2">
        <button class="btn btn-ghost" @click="copy"><Copy :size="17" />複製</button>
        <button class="btn btn-primary" @click="edit"><Pencil :size="17" />編輯</button>
      </div>
    </div>
  </BottomSheet>

  <BottomSheet v-model="adjOpen" title="編輯餘額調整">
    <div class="space-y-4">
      <div>
        <label class="label" for="adj-amount">調整金額</label>
        <input id="adj-amount" v-model="adjText" class="input" inputmode="decimal" placeholder="正數增加餘額，負數減少" @keyup.enter="saveAdjust" />
        <p class="mt-1.5 px-1 text-xs text-muted">正數會讓帳戶餘額增加，負數會減少。這筆不算收入或支出。</p>
      </div>
      <div>
        <label class="label">日期</label>
        <DateField v-model="adjDate" title="日期" />
      </div>
      <button class="btn btn-primary w-full" @click="saveAdjust">儲存</button>
    </div>
  </BottomSheet>

  <ImageViewer :src="big" @close="big = ''" />
</template>
