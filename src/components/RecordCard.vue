<script setup lang="ts">
import { myTotal } from '@/lib/split'
import { computed } from 'vue'
import { ArrowLeftRight, Circle, CircleCheck, Repeat, Scale } from '@/lib/uiIcons'
import type { Rec } from '@/db/types'
import { useData } from '@/stores/data'
import { fmt } from '@/lib/money'
import { P } from '@/lib/colors'
import CatIcon from './CatIcon.vue'

const props = defineProps<{ rec: Rec; showDate?: boolean; showLedger?: boolean; selecting?: boolean; checked?: boolean; dense?: boolean }>()
const data = useData()

const merchant = computed(() => (props.rec.merchantId ? data.merchantMap.get(props.rec.merchantId)?.name : ''))
const account = computed(() => data.accMap.get(props.rec.accountId)?.name ?? '')
/** the account tag stays grey, so the ledger tag is the only coloured one */
const accountStyle = { background: 'transparent', borderColor: 'var(--line)', color: 'var(--muted)' }
const first = computed(() => props.rec.lines[0])
const cat = computed(() => (first.value ? data.catMap.get(first.value.categoryId) : undefined))
/** a ledger's own screens do not need its name on every row; lists that mix ledgers (search, an account) ask for it */
const ledger = computed(() => (props.showLedger && data.ledgers.length > 1 ? (data.ledgerMap.get(props.rec.ledgerId)?.name ?? '') : ''))
/** the ledger tag is an outline in the ledger colour */
const ledgerStyle = computed(() => {
  const c = data.ledgerMap.get(props.rec.ledgerId)?.color
  return c ? { background: 'transparent', borderColor: c, color: c } : undefined
})
const multi = computed(() => props.rec.lines.length > 1)
/** several items that all sit in one category show that category's icon, not the "many kinds" one */
const mixed = computed(() => multi.value && props.rec.lines.some((l) => l.categoryId !== props.rec.lines[0]!.categoryId))

/** the parts of the item (漢堡、紅茶) */
const parts = computed(() => first.value?.details?.map((d) => (d.qty && d.name ? `${d.name} ×${d.qty}` : d.name)).filter(Boolean).join('、') ?? '')

const title = computed(() => {
  const r = props.rec
  if (r.type === 'transfer') return '轉帳'
  if (r.adjust) return '餘額調整'
  if (multi.value) return merchant.value || first.value?.name || '多項目'
  // an item is called by its name, else by what it holds (蛋餅、奶茶), else by its category; the category tag sits below
  return first.value?.name || parts.value || cat.value?.name || '未命名'
})
/** the title already is the category only when nothing else could name the item */
const titleIsCat = computed(() => !first.value?.name && !parts.value)

/**
 * The small line under the title, in pieces so each kind can look different: the category is a light chip, the parts
 * of the item are plain text, the merchant and the people follow a thin bar.
 */
type Piece = { kind: 'text' | 'cat' | 'parts' | 'merchant' | 'who'; text: string }
const pieces = computed<Piece[]>(() => {
  const r = props.rec
  if (r.type === 'transfer') return [{ kind: 'text', text: `${account.value} → ${data.accMap.get(r.toAccountId ?? '')?.name ?? ''}` }]
  if (r.adjust) return [{ kind: 'text', text: r.type === 'income' ? '補上差額' : '扣除差額' }]
  if (multi.value) {
    const items: Piece = { kind: 'text', text: r.lines.map((l) => l.name || data.catName(l.categoryId)).join('、') }
    // the category tag sits in the same place as on a single item: the shared category, or that there are several
    const label = mixed.value ? '多分類' : cat.value?.name
    return label ? [{ kind: 'cat', text: label }, items] : [items]
  }
  const out: Piece[] = []
  // the category tag is on every row, except when the category itself is the title
  if (!titleIsCat.value && cat.value) out.push({ kind: 'cat', text: cat.value.name })
  // the parts are the title of an unnamed item, so they only go below a named one
  if (first.value?.name && parts.value) out.push({ kind: 'parts', text: parts.value })
  if (merchant.value) out.push({ kind: 'merchant', text: merchant.value })
  if (r.companions?.length) out.push({ kind: 'who', text: r.companions.map(data.memberName).join('、') })
  return out
})

// the category tag always leads the line; everything else follows it
const catPiece = computed(() => pieces.value.find((p) => p.kind === 'cat'))
const restPieces = computed(() => pieces.value.filter((p) => p.kind !== 'cat'))

const sign = computed(() => (props.rec.type === 'income' ? '+' : props.rec.type === 'expense' ? '' : ''))
const tone = computed(() =>
  props.rec.type === 'income' ? 'text-income' : props.rec.type === 'expense' ? 'text-expense' : 'text-muted',
)
</script>

<template>
  <div class="flex items-center gap-3" :class="dense ? 'py-2' : 'py-3'">
    <component :is="checked ? CircleCheck : Circle" v-if="selecting" :size="24" class="shrink-0" :class="checked ? 'text-primary' : 'text-muted/60'" />
    <span
      v-if="rec.type === 'transfer' || rec.adjust"
      class="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted"
    >
      <Scale v-if="rec.adjust" :size="21" />
      <ArrowLeftRight v-else :size="21" />
    </span>
    <!-- several items: one icon for "many kinds", not the first item's -->
    <CatIcon v-else-if="mixed" icon="multi" :color="P.blue" />
    <CatIcon v-else :icon="cat?.icon" :color="cat?.color" />
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5">
        <span class="truncate font-semibold">{{ title }}</span>
        <span v-if="multi" class="shrink-0 rounded-full bg-primary-soft px-1.5 text-[11px] font-semibold text-primary-strong">
          {{ rec.lines.length }} 項
        </span>
        <Repeat v-if="rec.recurringId" :size="13" class="shrink-0 text-muted" />
      </div>
      <div class="mt-0.5 flex h-[18px] items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap text-muted">
        <span v-if="catPiece" class="shrink-0 rounded bg-ink/[0.06] px-1.5 py-px">{{ catPiece.text }}</span>
        <span v-if="showDate" class="shrink-0">{{ rec.date }}</span>
        <span v-if="showDate && restPieces.length" class="h-3 w-px shrink-0 bg-muted/40" />
        <template v-for="(p, i) in restPieces" :key="i">
          <span v-if="p.kind === 'parts'" class="min-w-0 truncate text-ink/70">{{ p.text }}</span>
          <!-- the merchant and the people come after a thin vertical bar, unless they open the line -->
          <span v-else-if="p.kind === 'merchant' || p.kind === 'who'" class="inline-flex shrink-0 items-center gap-1.5">
            <span v-if="i > 0" class="h-3 w-px shrink-0 bg-muted/40" />
            <span class="max-w-28 truncate">{{ p.kind === 'who' ? `和${p.text}` : p.text }}</span>
          </span>
          <span v-else class="min-w-0 truncate">{{ p.text }}</span>
        </template>
      </div>
    </div>
    <div class="flex shrink-0 flex-col items-end">
      <span class="text-base leading-6 font-semibold" :class="tone">{{ sign }}${{ fmt(myTotal(rec)) }}</span>
      <span v-if="(account || ledger) && rec.type !== 'transfer'" class="mt-0.5 flex h-[18px] max-w-full items-center gap-1">
        <span v-if="ledger" class="tag truncate" :style="ledgerStyle">{{ ledger }}</span>
        <span v-if="account" class="tag shrink-0" :style="accountStyle">{{ account }}</span>
      </span>
    </div>
  </div>
</template>
