<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronDown, ChevronRight, Plus, Trash2 } from '@/lib/uiIcons'
import { remove, save } from '@/db'
import type { Loan } from '@/db/types'
import { loanOutstanding } from '@/lib/calc'
import { today } from '@/lib/date'
import { P } from '@/lib/colors'
import { uid } from '@/lib/id'
import { evalExpr, fmt } from '@/lib/money'
import { useData } from '@/stores/data'
import { useMembers } from '@/stores/members'
import { useUi } from '@/stores/ui'
import BottomSheet from '@/components/BottomSheet.vue'
import CatIcon from '@/components/CatIcon.vue'
import DateField from '@/components/DateField.vue'
import PageHeader from '@/components/PageHeader.vue'
import PillTabs from '@/components/PillTabs.vue'
import SelectField from '@/components/SelectField.vue'

const data = useData()
const ui = useUi()
const members = useMembers()

const byDate = (a: Loan, b: Loan) => b.date.localeCompare(a.date)
const open = (l: Loan) => loanOutstanding(l) > 0

/** the settled ones only grow, so the list shows the latest few until asked for all */
const DONE_SHOWN = 5
const doneAll = ref(false)
const shownRows = (g: { key: string; rows: Loan[] }) =>
  g.key === 'done' && !doneAll.value ? g.rows.slice(0, DONE_SHOWN) : g.rows
const owed = (list: Loan[]) => list.reduce((n, l) => n + Math.max(0, loanOutstanding(l)), 0)
const groups = computed(() =>
  [
    { key: 'borrow', title: '我欠別人', rows: data.loans.filter((l) => l.direction === 'borrow' && open(l)).sort(byDate) },
    { key: 'lend', title: '別人欠我', rows: data.loans.filter((l) => l.direction === 'lend' && open(l)).sort(byDate) },
    { key: 'done', title: '已結清', rows: data.loans.filter((l) => !open(l)).sort(byDate) },
  ]
    .map((g) => ({ ...g, sum: g.key === 'done' ? 0 : owed(g.rows) }))
    .filter((g) => g.rows.length),
)
/** how much of it has come back, as a short line */
const paidText = (l: Loan) => {
  const paid = l.repayments.reduce((n, r) => n + r.amount, 0)
  return paid > 0 ? `已還 $${fmt(paid)}` : ''
}
const receivable = computed(() => data.loans.filter((l) => l.direction === 'lend').reduce((s, l) => s + Math.max(0, loanOutstanding(l)), 0))
const payable = computed(() => data.loans.filter((l) => l.direction === 'borrow').reduce((s, l) => s + Math.max(0, loanOutstanding(l)), 0))

// the loan form
const formOpen = ref(false)
const editId = ref('')
const direction = ref<'lend' | 'borrow'>('lend')
const person = ref('')
const principal = ref('')
const date = ref(today())
const dueDate = ref('')
const accountId = ref('')
const note = ref('')

function openForm(l?: Loan) {
  editId.value = l?.id ?? ''
  direction.value = l?.direction ?? 'lend'
  person.value = l ? members.nameOf(l.personId) : ''
  principal.value = l ? String(l.principal) : ''
  date.value = l?.date ?? today()
  dueDate.value = l?.dueDate ?? ''
  accountId.value = l ? (l.accountId ?? '') : (data.sortedAccounts.find((a) => !a.archived)?.id ?? '')
  note.value = l?.note ?? ''
  formOpen.value = true
}

async function submit() {
  const amount = evalExpr(principal.value)
  if (!person.value.trim()) return ui.toast('請輸入對象', 'error')
  if (!amount || amount <= 0) return ui.toast('請輸入金額', 'error')
  const old = data.loans.find((l) => l.id === editId.value)
  // the person is a member: one of that name is used, or made now
  const personId = await members.resolve(person.value)
  await save('loans', {
    id: editId.value || uid(),
    direction: direction.value,
    personId,
    principal: amount,
    date: date.value,
    ...(dueDate.value ? { dueDate: dueDate.value } : {}),
    ...(accountId.value ? { accountId: accountId.value } : {}),
    ...(note.value.trim() ? { note: note.value.trim() } : {}),
    repayments: old?.repayments ?? [],
  })
  formOpen.value = false
  ui.toast(editId.value ? '已更新借款' : '已新增借款')
}

// the repayment sheet
const openId = ref('')
const detailOpen = computed({ get: () => Boolean(openId.value), set: (v: boolean) => !v && (openId.value = '') })
const cur = computed(() => data.loans.find((l) => l.id === openId.value))
const repayAmount = ref('')
const repayDate = ref(today())
const repayAccount = ref('')

function openDetail(l: Loan) {
  openId.value = l.id
  repayAmount.value = ''
  repayDate.value = today()
  repayAccount.value = l.accountId ?? data.records.find((r) => r.id === l.recordId)?.accountId ?? ''
}

// arriving from a reminder: open that loan's sheet straight away (once the data is there)
const route = useRoute()
const router = useRouter()
watch(
  [() => route.query.open, () => data.loans, () => data.ready],
  () => {
    const id = route.query.open
    if (typeof id !== 'string' || !data.ready) return
    const l = data.loans.find((x) => x.id === id)
    if (l) openDetail(l)
    void router.replace({ query: {} })
  },
  { immediate: true },
)

async function addRepayment() {
  const l = cur.value
  const amount = evalExpr(repayAmount.value)
  if (!l || !amount || amount <= 0) return ui.toast('請輸入金額', 'error')
  await save('loans', {
    ...l,
    repayments: [...l.repayments, { id: uid(), date: repayDate.value, amount, ...(repayAccount.value ? { accountId: repayAccount.value } : {}) }],
  })
  repayAmount.value = ''
  ui.toast(l.direction === 'lend' ? `已記錄收款 $${fmt(amount)}` : `已記錄還款 $${fmt(amount)}`)
}

async function dropRepayment(id: string) {
  const l = cur.value
  const r = l?.repayments.find((x) => x.id === id)
  if (!l || !r) return
  if (!(await ui.confirm('移除這筆還款紀錄？', { message: `$${fmt(r.amount)}（${r.date}）移除後，欠款會恢復，帳戶餘額也會一併還原。`, danger: true, confirmText: '移除' }))) return
  await save('loans', { ...l, repayments: l.repayments.filter((x) => x.id !== id) })
  ui.toast('已移除還款紀錄')
}

function editCurrent() {
  const l = cur.value
  if (!l) return
  detailOpen.value = false
  openForm(l)
}

async function destroy() {
  const l = data.loans.find((x) => x.id === editId.value) ?? cur.value
  if (!l) return
  if (!(await ui.confirm(`刪除與 ${members.nameOf(l.personId)} 的借款？`, { message: '相關的帳戶餘額變動也會一併還原。', danger: true, confirmText: '刪除' }))) return
  await remove('loans', l.id)
  detailOpen.value = false
  formOpen.value = false
  ui.toast('已刪除借款')
}

/** the bill a shared-bill loan came from */
const source = computed(() => data.records.find((r) => r.id === cur.value?.recordId))
const sourceTitle = computed(() => {
  const r = source.value
  if (!r) return ''
  const l = r.lines[0]
  return (r.lines.length === 1 && (l?.name || data.catName(l?.categoryId ?? ''))) || (r.merchantId && data.merchantMap.get(r.merchantId)?.name) || '這筆消費'
})
function openSource() {
  const id = cur.value?.recordId
  if (!id) return
  detailOpen.value = false
  ui.viewRecord(id)
}
const repayNow = computed(() => evalExpr(repayAmount.value) ?? 0)
const repayWord = computed(() => (cur.value?.direction === 'lend' ? '收到' : '還給'))

const accName = (id?: string) => (id ? (data.accMap.get(id)?.name ?? '') : '')

const accountItems = computed(() => [
  { value: '', label: '不影響帳戶餘額' },
  ...data.sortedAccounts.filter((a) => !a.archived).map((a) => ({ value: a.id, label: a.name })),
])
</script>

<template>
  <div>
    <PageHeader title="借款">
      <template #right>
        <button class="circle-btn" aria-label="新增借款" @click="openForm()"><Plus :size="22" /></button>
      </template>
    </PageHeader>

    <section class="card mb-4 grid grid-cols-2 text-center">
      <div>
        <p class="text-xs text-muted">應付（我欠別人）</p>
        <p class="text-xl font-semibold text-expense">${{ fmt(payable) }}</p>
      </div>
      <div>
        <p class="text-xs text-muted">應收（別人欠我）</p>
        <p class="text-xl font-semibold text-primary">${{ fmt(receivable) }}</p>
      </div>
    </section>

    <template v-if="groups.length">
      <section v-for="g in groups" :key="g.key" class="mb-6">
        <div class="mb-2 flex items-baseline justify-between px-2">
          <h2 class="text-sm font-semibold text-ink/70">{{ g.title }}</h2>
          <span v-if="g.sum" class="text-sm font-semibold" :class="g.key === 'lend' ? 'text-primary' : 'text-expense'">${{ fmt(g.sum) }}</span>
        </div>
        <div class="card divide-y divide-line p-0">
          <button v-for="l in shownRows(g)" :key="l.id" class="flex w-full items-center gap-3 px-4 py-3.5 text-left" @click="openDetail(l)">
            <CatIcon :icon="l.direction === 'lend' ? 'handcoins' : 'receipt'" :color="g.key === 'done' ? P.gray : l.direction === 'lend' ? P.blue : P.red" :size="36" />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ members.nameOf(l.personId) }}</span>
              <span class="block truncate text-xs text-muted">
                {{ [l.date, l.dueDate && g.key !== 'done' ? `${l.dueDate} 前` : '', paidText(l)].filter(Boolean).join(' ｜ ') }}
              </span>
            </span>
            <span class="text-right">
              <span class="block font-semibold" :class="g.key === 'done' ? 'text-muted' : l.direction === 'lend' ? 'text-primary' : 'text-expense'">
                {{ g.key === 'done' ? '已結清' : `$${fmt(loanOutstanding(l))}` }}
              </span>
              <span v-if="g.key !== 'done' && l.dueDate && l.dueDate < today()" class="block text-xs text-danger">已逾期</span>
            </span>
          </button>
          <button
            v-if="g.key === 'done' && g.rows.length > DONE_SHOWN"
            class="flex w-full items-center justify-center gap-1 py-3 text-xs text-muted"
            @click="doneAll = !doneAll"
          >
            {{ doneAll ? '收起' : `顯示全部 ${g.rows.length} 筆` }}
            <ChevronDown :size="14" class="transition-transform" :class="doneAll && 'rotate-180'" />
          </button>
        </div>
      </section>
    </template>
    <p v-else class="card py-12 text-center text-sm text-muted">還沒有借款記錄</p>

    <BottomSheet v-model="formOpen" :title="editId ? '編輯借款' : '新增借款'">
      <div class="space-y-4">
        <PillTabs
          v-model="direction"
          :options="[
            { value: 'lend', label: '我借給別人' },
            { value: 'borrow', label: '我向別人借' },
          ]"
        />
        <div class="grid grid-cols-[3fr_2fr] gap-3">
          <div class="min-w-0">
            <label class="label">對象</label>
            <input v-model="person" class="input" maxlength="20" />
          </div>
          <div class="min-w-0">
            <label class="label">金額</label>
            <span class="relative block">
              <span class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted">$</span>
              <input v-model="principal" class="input !pl-7" inputmode="decimal" placeholder="0" />
            </span>
          </div>
        </div>
        <!-- the names sit under both boxes, so they have the whole width to run along and do not stretch the name box -->
        <div v-if="members.list.length" class="scrollbar-none -mt-2 flex gap-1.5 overflow-x-auto">
          <button v-for="m in members.list.slice(0, 8)" :key="m.id" class="chip shrink-0 whitespace-nowrap" :class="person.trim() === m.name && 'chip-on'" @click="person = m.name">{{ members.nameOf(m.id) }}</button>
        </div>
        <div>
          <label class="label">日期</label>
          <DateField v-model="date" title="借款日期" />
        </div>
        <div>
          <label class="label">約定還款日（選填）</label>
          <DateField v-model="dueDate" title="約定還款日" placeholder="不設定" clearable />
        </div>
        <div>
          <label class="label">{{ direction === 'lend' ? '從哪個帳戶拿出去' : '錢進哪個帳戶' }}</label>
          <SelectField v-model="accountId" title="選擇帳戶" :items="accountItems" />
        </div>
        <div>
          <label class="label">備註</label>
          <input v-model="note" class="input" />
        </div>
        <button class="btn btn-primary w-full" @click="submit">儲存</button>
        <button v-if="editId" class="btn btn-ghost -mt-2 w-full text-danger" @click="destroy">刪除這筆借款</button>
      </div>
    </BottomSheet>

    <BottomSheet v-model="detailOpen" :title="cur ? `${members.nameOf(cur.personId)}` : ''">
      <div v-if="cur" class="space-y-4">
        <div class="card text-center">
          <p class="text-xs text-muted">{{ cur.direction === 'lend' ? '對方還欠我' : '我還欠對方' }}</p>
          <p class="text-3xl font-bold">${{ fmt(Math.max(0, loanOutstanding(cur))) }}</p>
          <p class="mt-1 text-xs text-muted">總額 ${{ fmt(cur.principal) }}，{{ cur.date }}{{ cur.accountId ? `，${accName(cur.accountId)}` : '' }}</p>
          <p v-if="cur.note && !source" class="mt-1 text-xs text-muted">{{ cur.note }}</p>
        </div>

        <!-- a share of a bill: which one -->
        <button v-if="source" class="card flex w-full items-center gap-3 text-left" @click="openSource">
          <span class="min-w-0 flex-1">
            <span class="block text-xs text-muted">來自這筆分帳</span>
            <span class="block truncate font-medium">{{ sourceTitle }}<span class="font-normal text-muted">　{{ source.date }}・共 ${{ fmt(source.total) }}</span></span>
          </span>
          <ChevronRight :size="16" class="shrink-0 text-muted" />
        </button>

        <ul v-if="cur.repayments.length" class="card divide-y divide-line p-0">
          <li v-for="r in cur.repayments" :key="r.id" class="flex items-center gap-3 px-4 py-3 text-sm">
            <span class="flex-1">{{ r.date }}{{ r.accountId ? `　${accName(r.accountId)}` : '' }}</span>
            <span class="font-semibold">${{ fmt(r.amount) }}</span>
            <button class="icon-btn size-8 text-muted" aria-label="移除這筆還款" @click="dropRepayment(r.id)"><Trash2 :size="15" /></button>
          </li>
        </ul>

        <div v-if="loanOutstanding(cur) > 0" class="card space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-sm font-semibold">{{ cur.direction === 'lend' ? '收款' : '還款' }}</p>
            <button class="chip" @click="repayAmount = String(loanOutstanding(cur))">全額 ${{ fmt(loanOutstanding(cur)) }}</button>
          </div>
          <div class="grid grid-cols-[2fr_3fr] gap-3">
            <div>
              <label class="label">{{ repayWord }}金額</label>
              <span class="relative block">
                <span class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted">$</span>
                <input v-model="repayAmount" class="input !pl-7" inputmode="decimal" placeholder="0" />
              </span>
            </div>
            <div>
              <label class="label">日期</label>
              <DateField v-model="repayDate" title="還款日期" />
            </div>
          </div>
          <div>
            <label class="label">{{ cur.direction === 'lend' ? '存進哪個帳戶' : '從哪個帳戶付' }}</label>
            <SelectField v-model="repayAccount" title="選擇帳戶" :items="accountItems" />
          </div>
          <button class="btn btn-primary w-full" :disabled="repayNow <= 0" @click="addRepayment">
            {{ repayNow > 0 ? `確認${repayWord} $${fmt(repayNow)}` : `輸入${repayWord}金額` }}
          </button>
        </div>

        <button class="btn btn-soft w-full" @click="editCurrent">編輯借款</button>
      </div>
    </BottomSheet>
  </div>
</template>
