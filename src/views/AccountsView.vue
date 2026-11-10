<script setup lang="ts">
import MoneyText from '@/components/MoneyText.vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Archive, ArrowLeftRight, ChevronRight, Plus } from '@/lib/uiIcons'
import type { Account } from '@/db/types'
import { cardCycles, isForeignAccount, loanOutstanding, spendOn } from '@/lib/calc'
import { save, saveMany } from '@/db'
import { accountIcon } from '@/lib/banks'
import { today } from '@/lib/date'
import { currencyName } from '@/lib/customCurrency'
import { P } from '@/lib/colors'
import { fmt } from '@/lib/money'
import { useData } from '@/stores/data'
import AccountFormSheet from '@/components/AccountFormSheet.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import CatIcon from '@/components/CatIcon.vue'

const router = useRouter()
const data = useData()
const formOpen = ref(false)
/** archived accounts are kept out of the lists; this sheet is where they are found again */
const archivedOpen = ref(false)
const archived = computed(() => data.sortedAccounts.filter((a) => a.archived))

async function unarchive(a: Account) {
  const next: Account = { ...a }
  delete next.archived
  await save('accounts', next)
}

const receivable = computed(() =>
  data.loans.filter((l) => l.direction === 'lend').reduce((s, l) => s + Math.max(0, loanOutstanding(l)), 0),
)
const payable = computed(() =>
  data.loans.filter((l) => l.direction === 'borrow').reduce((s, l) => s + Math.max(0, loanOutstanding(l)), 0),
)

const active = computed(() => data.sortedAccounts.filter((a) => !a.archived))
const bal = (a: Account) => data.balances.get(a.id) ?? 0
/** a wallet in another currency shows its own currency in front */

const totals = computed(() => {
  let assets = receivable.value
  let debts = -payable.value
  for (const a of active.value) {
    // a wallet in another currency is not converted, so it stays out of the totals
    if (a.excluded || isForeignAccount(a)) continue
    const b = bal(a)
    if (b >= 0) assets += b
    else debts += b
  }
  return { assets, debts, net: assets + debts }
})

const groups = computed(() => [
  { title: 'cash', label: '現金', list: active.value.filter((a) => a.kind === 'cash') },
  { title: 'bank', label: '帳戶與電子錢包', list: active.value.filter((a) => a.kind === 'bank' || a.kind === 'wallet') },
  { title: 'card', label: '信用卡', list: active.value.filter((a) => a.kind === 'card') },
])

function cardInfo(a: Account) {
  if (!a.statementDay) return { prev: 0, cur: 0 }
  const cy = cardCycles(a.statementDay, today())
  return {
    prev: spendOn(a.id, data.counted, cy.prev.start, cy.prev.end),
    cur: spendOn(a.id, data.counted, cy.cur.start, cy.cur.end),
  }
}

const groupSum = (list: Account[]) => list.reduce((s, a) => s + (isForeignAccount(a) ? 0 : bal(a)), 0)
const tone = (n: number) => (n < 0 ? 'text-expense' : 'text-income')

// ---- sorting: hold a row, then drag it up or down inside its group (the same gesture as on the home page) ----
const carry = ref<{ id: string; group: string; dy: number } | null>(null)
/** the group's order while a row is being carried */
const carried = ref<Account[]>([])
let holdTimer = 0
let fromX = 0
let fromY = 0
let pointerY = 0
/** how far below the row's top the finger first touched it */
let grabRel = 0
let raf = 0
/** a carried row must not also open its account when the finger lifts */
let suppressClick = false

function shownList(g: { title: string; list: Account[] }) {
  return carry.value?.group === g.title ? carried.value : g.list
}

function holdStart(e: PointerEvent, a: Account, g: { title: string; list: Account[] }) {
  if (g.list.length < 2) return
  fromX = e.clientX
  fromY = e.clientY
  pointerY = e.clientY
  const row = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  grabRel = row ? fromY - row.top : 0
  window.clearTimeout(holdTimer)
  holdTimer = window.setTimeout(() => {
    navigator.vibrate?.(12)
    carried.value = [...g.list]
    carry.value = { id: a.id, group: g.title, dy: 0 }
    window.addEventListener('pointermove', carryMove)
    window.addEventListener('pointerup', carryUp)
    window.addEventListener('pointercancel', carryUp)
    raf = requestAnimationFrame(frame)
  }, 450)
}

/** moving before the hold is up means scrolling, not holding */
function holdMove(e: PointerEvent) {
  if (Math.hypot(e.clientX - fromX, e.clientY - fromY) > 8) window.clearTimeout(holdTimer)
}
function holdEnd() {
  window.clearTimeout(holdTimer)
}

function carryMove(e: PointerEvent) {
  pointerY = e.clientY
}

/** every frame: swap rows when the finger crosses one, and keep the carried row under the finger */
function frame() {
  const c = carry.value
  if (!c) return
  const container = document.querySelector<HTMLElement>(`[data-group="${c.group}"]`)
  const el = container?.querySelector<HTMLElement>(`[data-acc="${c.id}"]`)
  if (container && el) {
    const box = container.getBoundingClientRect()
    const py = pointerY - box.top
    const rows = [...container.querySelectorAll<HTMLElement>('[data-acc]')]
    let target = 0
    let best = Infinity
    rows.forEach((t, i) => {
      const d = Math.abs(py - (t.offsetTop + t.offsetHeight / 2))
      if (d < best) {
        best = d
        target = i
      }
    })
    const from = carried.value.findIndex((x) => x.id === c.id)
    if (from >= 0 && target !== from) {
      const next = [...carried.value]
      const [moved] = next.splice(from, 1)
      next.splice(target, 0, moved!)
      carried.value = next
    }
    // offsetTop ignores the transform, so this is where the row sits in the layout
    const dy = Math.round(py - grabRel - el.offsetTop)
    if (dy !== c.dy) carry.value = { ...c, dy }
  }
  raf = requestAnimationFrame(frame)
}

async function carryUp() {
  cancelAnimationFrame(raf)
  window.clearTimeout(holdTimer)
  window.removeEventListener('pointermove', carryMove)
  window.removeEventListener('pointerup', carryUp)
  window.removeEventListener('pointercancel', carryUp)
  const c = carry.value
  suppressClick = true
  window.setTimeout(() => (suppressClick = false), 0)
  if (!c) return
  const g = groups.value.find((x) => x.title === c.group)
  carry.value = null
  if (!g) return
  // the group keeps the order numbers it had; the accounts take them in their new sequence
  const slots = g.list.map((x) => x.order)
  const changed: Account[] = []
  carried.value.forEach((a, i) => {
    if (a.order !== slots[i]) changed.push({ ...a, order: slots[i]! })
  })
  carried.value = []
  if (changed.length) await saveMany('accounts', changed)
}

function openAccount(a: Account) {
  if (suppressClick || carry.value) return
  router.push(`/account/${a.id}`)
}

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.clearTimeout(holdTimer)
  window.removeEventListener('pointermove', carryMove)
  window.removeEventListener('pointerup', carryUp)
  window.removeEventListener('pointercancel', carryUp)
})
</script>

<template>
  <div>
    <header class="sticky top-0 z-20 -mx-4 bg-bg px-4 mb-3 grid min-h-14 grid-cols-[1fr_auto_1fr] items-center py-2">
      <div class="flex justify-start">
        <button class="circle-btn" aria-label="已封存的帳戶" @click="archivedOpen = true">
          <Archive :size="20" />
        </button>
      </div>
      <h1 class="text-center text-xl font-bold">資產</h1>
      <div class="flex justify-end gap-2">
        <button class="circle-btn" aria-label="轉帳" @click="router.push({ path: '/record/new', query: { type: 'transfer' } })">
          <ArrowLeftRight :size="20" />
        </button>
        <button class="circle-btn" aria-label="新增帳戶" @click="formOpen = true">
          <Plus :size="22" />
        </button>
      </div>
    </header>

    <section class="card mb-5 grid grid-cols-3 text-center">
      <div>
        <p class="text-xs text-muted">資產</p>
        <p class="text-lg font-semibold text-income">{{ fmt(totals.assets) }}</p>
      </div>
      <div>
        <p class="text-xs text-muted">負債</p>
        <p class="text-lg font-semibold text-expense">{{ fmt(totals.debts) }}</p>
      </div>
      <div>
        <p class="text-xs text-muted">合計</p>
        <p class="text-lg font-semibold">{{ fmt(totals.net) }}</p>
      </div>
    </section>

    <section v-for="g in groups" :key="g.title" class="mb-5">
      <div class="mb-2 flex items-end justify-between px-1">
        <h2 class="text-sm font-semibold text-muted">{{ g.label }}</h2>
        <div v-if="g.title === 'card'" class="flex gap-3 pr-10 text-xs text-muted">
          <span class="w-20 text-right">上期帳單</span><span class="w-20 text-right">本期累計</span>
        </div>
        <span v-else class="text-sm font-semibold" :class="tone(groupSum(g.list))"><MoneyText :n="groupSum(g.list)" /></span>
      </div>
      <TransitionGroup
        v-if="g.list.length"
        tag="div"
        :name="carry ? 'rows' : 'still'"
        class="card relative divide-y divide-line p-0"
        :data-group="g.title"
      >
        <div
          v-for="a in shownList(g)"
          :key="a.id"
          :data-acc="a.id"
          class="relative"
          :class="carry?.id === a.id && 'z-10'"
        >
          <button
            class="relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors select-none [-webkit-touch-callout:none]"
            :class="carry?.id === a.id && 'rounded-2xl bg-surface shadow-xl ring-2 ring-primary'"
            :style="carry?.id === a.id ? { transform: `translateY(${carry?.dy ?? 0}px)` } : undefined"
            @pointerdown="holdStart($event, a, g)"
            @pointermove="holdMove"
            @pointerup="holdEnd"
            @pointerleave="holdEnd"
            @pointercancel="holdEnd"
            @contextmenu.prevent
            @click="openAccount(a)"
          >
            <CatIcon :icon="accountIcon(a)" :color="a.color" :size="40" />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">
                {{ a.name }}
                <span v-if="a.excluded" class="ml-1.5 text-xs font-normal text-muted">不計入總額</span>
              </span>
              <span v-if="isForeignAccount(a)" class="block text-xs text-muted">{{ currencyName(a.currency!) }}</span>
            </span>
            <template v-if="a.kind === 'card'">
              <span class="w-20 text-right text-sm font-semibold"><MoneyText :n="cardInfo(a).prev" /></span>
              <span class="w-20 text-right text-sm font-semibold"><MoneyText :n="cardInfo(a).cur" /></span>
            </template>
            <span v-else class="font-semibold" :class="tone(bal(a))"><MoneyText :n="bal(a)" /></span>
            <ChevronRight :size="16" class="text-muted" />
          </button>
        </div>
      </TransitionGroup>
      <p v-else class="card py-5 text-center text-sm text-muted">還沒有{{ g.label }}</p>
    </section>

    <section class="mb-5">
      <div class="mb-2 flex items-end justify-between px-1">
        <h2 class="text-sm font-semibold text-muted">借款</h2>
        <div class="flex gap-3 pr-10 text-xs text-muted">
          <span class="w-20 text-right">應付</span><span class="w-20 text-right">應收</span>
        </div>
      </div>
      <div class="card p-0">
        <button class="flex w-full items-center gap-3 px-4 py-3.5 text-left" @click="router.push('/more/loans')">
          <CatIcon icon="handcoins" :color="P.blue" :size="40" />
          <span class="min-w-0 flex-1 truncate font-medium">借款</span>
          <span class="w-20 text-right text-sm font-semibold"><MoneyText :n="payable" /></span>
          <span class="w-20 text-right text-sm font-semibold"><MoneyText :n="receivable" /></span>
          <ChevronRight :size="16" class="text-muted" />
        </button>
      </div>
    </section>

    <BottomSheet v-model="archivedOpen" title="已封存的帳戶">
      <p v-if="!archived.length" class="py-6 text-center text-sm text-muted">沒有封存的帳戶</p>
      <ul v-else class="card divide-y divide-line p-0">
        <li v-for="a in archived" :key="a.id" class="flex items-center gap-3 px-4 py-3.5">
          <button class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="archivedOpen = false; router.push(`/account/${a.id}`)">
            <CatIcon :icon="accountIcon(a)" :color="a.color" :size="36" />
            <span class="min-w-0 flex-1 truncate font-medium">{{ a.name }}</span>
            <span class="text-sm text-muted"><MoneyText :n="bal(a)" /></span>
          </button>
          <button class="btn btn-soft btn-sm shrink-0" @click="unarchive(a)">取消封存</button>
        </li>
      </ul>
    </BottomSheet>

    <AccountFormSheet v-model="formOpen" />
  </div>
</template>
