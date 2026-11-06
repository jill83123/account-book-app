<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Pencil, Scale } from '@/lib/uiIcons'
import { cardCycles, isForeignAccount, nextDayOfMonth, spendOn } from '@/lib/calc'
import { currencyName } from '@/lib/customCurrency'
import { save } from '@/db'
import { nowTime, today } from '@/lib/date'
import { uid } from '@/lib/id'
import { evalExpr, fmt } from '@/lib/money'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import AccountFormSheet from '@/components/AccountFormSheet.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import PageHeader from '@/components/PageHeader.vue'
import RecordCard from '@/components/RecordCard.vue'

const route = useRoute()
const router = useRouter()
const ui = useUi()
const data = useData()
const editOpen = ref(false)

const account = computed(() => data.accMap.get(String(route.params.id)))
/** only the records that move this account: the ones in another currency are listed in their own ledger */
const records = computed(() => {
  const counted = new Set(data.counted.map((r) => r.id))
  return data.sortedRecords.filter(
    (r) => counted.has(r.id) && (r.accountId === account.value?.id || r.toAccountId === account.value?.id),
  )
})
const balance = computed(() => (account.value ? (data.balances.get(account.value.id) ?? 0) : 0))

// 餘額調整: the real balance differs from the book (money went missing, cash was miscounted ...), so a difference is booked
// that moves the balance but is neither income nor spending
const isCard = computed(() => account.value?.kind === 'card')
const adjustOpen = ref(false)
const actualText = ref('')
/** a card is entered as what is owed, everything else as what is there */
const shown = computed(() => (isCard.value ? -balance.value : balance.value))
const actual = computed(() => evalExpr(actualText.value))
const diff = computed(() => (actual.value == null ? 0 : (isCard.value ? -actual.value : actual.value) - balance.value))

function openAdjust() {
  actualText.value = String(shown.value)
  adjustOpen.value = true
}

async function adjust() {
  const a = account.value
  if (!a) return
  if (actual.value == null) return ui.toast('金額格式不正確', 'error')
  if (!diff.value) {
    adjustOpen.value = false
    return ui.toast('帳面和實際一樣，不用調整', 'info')
  }
  await save('records', {
    id: uid(),
    type: diff.value > 0 ? 'income' : 'expense',
    date: today(),
    time: nowTime(),
    ledgerId: data.writeLedgerId,
    accountId: a.id,
    lines: [],
    total: Math.round(Math.abs(diff.value)),
    adjust: true,
  })
  adjustOpen.value = false
  ui.toast(`已調整，差額 ${diff.value > 0 ? '+' : '-'}$${fmt(Math.abs(diff.value))}`, 'success')
}

const card = computed(() => {
  const a = account.value
  if (!a || a.kind !== 'card' || !a.statementDay) return null
  const cy = cardCycles(a.statementDay, today())
  return {
    prev: spendOn(a.id, data.counted, cy.prev.start, cy.prev.end),
    cur: spendOn(a.id, data.counted, cy.cur.start, cy.cur.end),
    prevRange: `${cy.prev.start}～${cy.prev.end}`,
    curRange: `${cy.cur.start}～${cy.cur.end}`,
    due: a.dueDay ? nextDayOfMonth(a.dueDay, today()) : '',
  }
})
</script>

<template>
  <div v-if="account">
    <PageHeader :title="account.name" :subtitle="isForeignAccount(account) ? currencyName(account.currency!) : undefined">
      <template #right>
        <button class="circle-btn" aria-label="編輯帳戶" @click="editOpen = true">
          <Pencil :size="19" />
        </button>
      </template>
    </PageHeader>

    <section class="card mb-4 text-center">
      <p class="text-xs text-muted">{{ account.kind === 'card' ? '目前欠款' : '目前餘額' }}</p>
      <p class="text-3xl font-bold" :class="balance < 0 ? 'text-expense' : 'text-primary'">{{ `$${fmt(balance)}` }}</p>
      <button class="btn btn-soft btn-sm mt-3" @click="openAdjust"><Scale :size="16" />調整餘額</button>
    </section>

    <section v-if="card" class="card mb-4 space-y-3 text-sm">
      <div class="flex justify-between">
        <span>
          上期帳單
          <span class="block text-xs text-muted">{{ card.prevRange }}</span>
        </span>
        <span class="text-lg font-semibold">${{ fmt(card.prev) }}</span>
      </div>
      <div class="flex justify-between">
        <span>
          本期累計（尚未出帳）
          <span class="block text-xs text-muted">{{ card.curRange }}</span>
        </span>
        <span class="text-lg font-semibold">${{ fmt(card.cur) }}</span>
      </div>
      <p v-if="card.due" class="text-xs text-muted">下次繳款日：{{ card.due }}</p>
      <button
        v-if="card"
        class="btn btn-primary w-full"
        @click="router.push({ path: '/record/new', query: { type: 'transfer', to: account.id, note: `${account.name}繳款`, ...(card.prev > 0 ? { amount: String(card.prev) } : {}) } })"
      >
        記繳卡費
      </button>
    </section>

    <div v-if="records.length" class="card divide-y divide-line py-0">
      <button
        v-for="r in records"
        :key="r.id"
        class="block w-full text-left"
        @click="ui.viewRecord(r.id)"
      >
        <RecordCard :rec="r" show-date show-ledger />
      </button>
    </div>
    <p v-else class="card py-10 text-center text-sm text-muted">這個帳戶還沒有記錄</p>

    <BottomSheet v-model="adjustOpen" title="調整餘額">
      <div class="space-y-4">
        <p class="text-sm text-muted">
          帳面和實際對不起來時（例如不知道錢花去哪），輸入實際的數字，會補一筆差額，不算收入也不算支出，不會影響統計。
        </p>
        <div class="card flex items-center justify-between">
          <span class="text-sm text-muted">帳面{{ isCard ? '欠款' : '餘額' }}</span>
          <span class="font-semibold">{{ `$${fmt(shown)}` }}</span>
        </div>
        <div>
          <label class="label" for="actual">實際{{ isCard ? '欠款' : '餘額' }}</label>
          <input id="actual" v-model="actualText" class="input" inputmode="decimal" placeholder="0" @keyup.enter="adjust" />
        </div>
        <p v-if="actual != null && diff" class="text-sm">
          差額
          <b :class="diff > 0 ? 'text-income' : 'text-expense'">{{ diff > 0 ? '+' : '-' }}{{ `$${fmt(Math.abs(diff))}` }}</b>
          <span class="text-muted">，{{ isCard ? (diff > 0 ? '欠款變少' : '欠款變多') : diff > 0 ? '帳面補上' : '帳面扣掉' }}這筆</span>
        </p>
        <button class="btn btn-primary w-full" :disabled="actual == null || !diff" @click="adjust">確定調整</button>
      </div>
    </BottomSheet>

    <AccountFormSheet v-model="editOpen" :account="account" @removed="router.replace('/accounts')" />
  </div>
</template>
