<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import {
  ArrowLeftRight,
  Calculator,
  Camera,
  ScanLine,
  Star,
  Info,
  GripVertical,
  Plus,
  Repeat as RepeatIcon,
  Store,
  Wallet,
  BookMarked,
  CalendarDays,
  Trash2,
  Users,
  HandCoins,
  X,
} from '@/lib/uiIcons'
import { remove, save } from '@/db'
import type { Account, Line, Rec, RecordType, Recurring } from '@/db/types'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useSync } from '@/stores/sync'
import { useUi, type Draft } from '@/stores/ui'
import { addedAt, relativeLabel, today, weekday, WEEKDAYS } from '@/lib/date'
import { uid } from '@/lib/id'
import { baseCurrency } from '@/lib/currency'
import { currencyOf } from '@/lib/calc'
import {
  addPhoto,
  forgetPhotos,
  loadPhotos,
  releasePhotos,
  savePhotos,
  type Photo,
} from '@/lib/images'
import { accountIcon } from '@/lib/banks'
import { evalExpr, fmt } from '@/lib/money'
import { learn, suggest } from '@/lib/merchants'
import { buildRecord, type Repeat } from '@/lib/recurrence'
import BottomSheet from '@/components/BottomSheet.vue'
import ImageViewer from '@/components/ImageViewer.vue'
import CatIcon from '@/components/CatIcon.vue'
import CategoryPickerSheet from '@/components/CategoryPickerSheet.vue'
import CompanionSheet from '@/components/CompanionSheet.vue'
import SplitSheet from '@/components/SplitSheet.vue'
import { resolveSplit, syncSplitLoans } from '@/lib/split'
import DatePickerSheet from '@/components/DatePickerSheet.vue'
import TimeField from '@/components/TimeField.vue'
import KeypadSheet from '@/components/KeypadSheet.vue'
import MerchantPickerSheet from '@/components/MerchantPickerSheet.vue'
import PickSheet from '@/components/PickSheet.vue'
import LedgerPickSheet from '@/components/LedgerPickSheet.vue'
import PillTabs from '@/components/PillTabs.vue'
import RepeatSheet from '@/components/RepeatSheet.vue'
import ScanSheet from '@/components/ScanSheet.vue'

interface LineForm {
  id: string
  name: string
  categoryId: string
  amountText: string
  amortMonths: number
  note: string
  /** starred: remember this item under the merchant */
  remember: boolean
  /** it was already remembered when the record was opened */
  wasRemembered: boolean
  /** the parts of the item, typed as a name and an amount */
  details: { id: string; name: string; amountText: string; qtyText: string }[]
  /** the item amount last filled in from the parts, so a different typed amount is left alone */
  autoSum?: number
}

const route = useRoute()
const router = useRouter()
const data = useData()
const ui = useUi()
const { s } = useSettings()
const sync = useSync()

const editingId = computed(() => (route.params.id === 'new' ? '' : String(route.params.id)))
const editing = computed(() => data.records.find((r) => r.id === editingId.value))

const type = ref<RecordType>('expense')
const lines = ref<LineForm[]>([])
const active = ref(0)
const accountId = ref('')
const toAccountId = ref('')
const ledgerId = ref('')
const merchantId = ref('')
const newMerchantName = ref('')
const date = ref(today())
/** HH:mm, or empty: the time of day is optional */
const time = ref('')
const note = ref('')
const companions = ref<string[]>([])
/** how a shared bill is split, once chosen */
const split = ref<Rec['split']>()
const repeat = ref<Repeat>({ kind: 'once' })
const recurringId = ref<string | undefined>()
const transferText = ref('')
/** prices are typed in the currency of the ledger; a ledger in another one only lists spending, nothing is converted */
const currency = computed(() => data.ledgerMap.get(ledgerId.value)?.currency ?? baseCurrency.value)
const foreign = computed(() => currency.value !== baseCurrency.value && type.value !== 'transfer')
// the wallet only moves when it is in the ledger's currency, so a new record starts with one that is
watch(ledgerId, () => {
  if (editingId.value || route.query.copy || type.value === 'transfer') return
  // a record keeps to its ledger's currency, so only an account in that currency fits
  const cur = currency.value
  const fits = (a?: Account) => Boolean(a) && !a!.archived && currencyOf(a) === cur
  // a ledger can say which account its records usually go to
  const preset = data.accMap.get(data.ledgerMap.get(ledgerId.value)?.accountId ?? '')
  if (fits(preset)) {
    accountId.value = preset!.id
    return
  }
  if (fits(data.accMap.get(accountId.value))) return
  // a ledger in another currency can do without an account
  accountId.value = data.sortedAccounts.find((a) => fits(a))?.id ?? ''
})

const sheet = ref<
  | ''
  | 'category'
  | 'keypad'
  | 'merchant'
  | 'account'
  | 'toAccount'
  | 'ledger'
  | 'repeat'
  | 'scan'
  | 'date'
  | 'photos'
  | 'companions'
  | 'split'
>('')
const open = (name: Exclude<typeof sheet.value, ''>) => (sheet.value = name)
const sheetOpen = (name: typeof sheet.value) =>
  computed({ get: () => sheet.value === name, set: (v: boolean) => (sheet.value = v ? name : '') })
const categorySheet = sheetOpen('category')
const keypadSheet = sheetOpen('keypad')
const merchantSheet = sheetOpen('merchant')
const accountSheet = sheetOpen('account')
const toAccountSheet = sheetOpen('toAccount')
const ledgerSheet = sheetOpen('ledger')
const repeatSheet = sheetOpen('repeat')
const scanSheet = sheetOpen('scan')
const dateSheet = sheetOpen('date')
const photoSheet = sheetOpen('photos')
const companionSheet = sheetOpen('companions')
const splitSheet = sheetOpen('split')

const kind = computed(() => (type.value === 'income' ? 'income' : 'expense'))

function blankLine(): LineForm {
  return {
    id: uid(),
    name: '',
    categoryId: '',
    amountText: '',
    amortMonths: 1,
    note: '',
    remember: false,
    wasRemembered: false,
    details: [],
  }
}

const line = computed(() => lines.value[active.value] ?? lines.value[0]!)
/** what was typed */
const amountOf = (l: LineForm) => evalExpr(l.amountText) ?? 0
const total = computed(() =>
  type.value === 'transfer'
    ? Math.round(evalExpr(transferText.value) ?? 0)
    : lines.value.reduce((n, l) => n + amountOf(l), 0),
)

/** the line on the form: how the bill is shared, with today's total */
const splitText = computed(() => {
  const sp = resolveSplit(split.value, total.value, companions.value)
  if (!sp) return '分帳、代墊（選填）'
  if (sp.mode === 'other') return `${data.memberName(sp.payer ?? '')}付的：我 ${fmt(sp.mine ?? 0)}`
  const others = sp.shares.reduce((n, x) => n + x.amount, 0)
  return `${sp.mode === 'advance' ? '代墊' : '分帳'}：我 $${fmt(total.value - others)}，其他 $${fmt(others)}`
})

/** a transfer is in the currency of the wallet it leaves */
const transferCur = computed(() => currencyOf(data.accMap.get(accountId.value)))
const toCur = computed(() => currencyOf(data.accMap.get(toAccountId.value)))
/** money that crosses currencies: say how much arrived. The rate only works one amount out of the other, it is not kept */
const needToAmount = computed(
  () => type.value === 'transfer' && Boolean(toAccountId.value) && toCur.value !== transferCur.value,
)
const toTotalText = ref('')
const rateText = ref('')
/** the amount that left follows what arrived and the rate */
function fromArrived() {
  const to = evalExpr(toTotalText.value) ?? 0
  const r = Number(rateText.value)
  if (to > 0 && r > 0) transferText.value = String(Math.round(to * r))
}
/** a rate typed after one of the amounts works out the other one; what arrived wins when both are there */
function fromRate() {
  if ((evalExpr(toTotalText.value) ?? 0) > 0) fromArrived()
  else fromLeft()
}
/** the amount that arrived follows what left, once there is a rate */
function fromLeft() {
  const left = evalExpr(transferText.value) ?? 0
  const r = Number(rateText.value)
  if (needToAmount.value && left > 0 && r > 0) toTotalText.value = String(Math.round(left / r))
}
watch(needToAmount, (v) => {
  if (!v) {
    toTotalText.value = ''
    rateText.value = ''
  }
})
const totalText = computed(() => `$${fmt(total.value)}`)

const merchant = computed(() => data.merchantMap.get(merchantId.value))
const merchantLabel = computed(() => merchant.value?.name || newMerchantName.value)

function applyDraft(d: Draft) {
  if (d.date) date.value = d.date
  if (d.time) time.value = d.time
  if (d.merchantName) {
    const found = data.merchants.find((m) => m.name === d.merchantName)
    merchantId.value = found?.id ?? ''
    newMerchantName.value = found ? '' : d.merchantName
  }
  type.value = 'expense'
  lines.value = d.lines.map((l) => ({
    id: uid(),
    name: l.name,
    categoryId: l.categoryId,
    amountText: l.amount ? String(l.amount) : '',
    amortMonths: 1,
    note: '',
    remember: false,
    wasRemembered: false,
    details: (l.details ?? []).map((x) => ({
      id: uid(),
      name: x.name,
      amountText: x.amount ? String(x.amount) : '',
      qtyText: x.qty ? String(x.qty) : '',
    })),
  }))
  if (!lines.value.length) lines.value = [blankLine()]
  active.value = 0
}

/** the form was filled from this version of the record */
let loadedAt = 0
function load() {
  // 複製: start from an existing record but save it as a new one, dated now
  const copying = !editing.value ? data.records.find((x) => x.id === route.query.copy) : undefined
  const r = editing.value ?? copying
  if (r) {
    type.value = r.type
    accountId.value = r.accountId
    toAccountId.value = r.toAccountId ?? ''
    ledgerId.value = r.ledgerId
    merchantId.value = r.merchantId ?? ''
    date.value = copying ? today() : r.date
    time.value = copying ? '' : r.time
    note.value = r.note ?? ''
    companions.value = [...(r.companions ?? [])]
    split.value = r.split
    recurringId.value = copying ? undefined : r.recurringId
    if (!copying) void loadPhotos(r.id).then((p) => (photos.value = p))
    const items = r.merchantId ? (data.merchantMap.get(r.merchantId)?.items ?? []) : []
    const remembered = (name: string) => Boolean(name) && items.some((i) => i.name === name)
    if (r.type === 'transfer') {
      transferText.value = String(r.total)
      toTotalText.value = r.toTotal != null ? String(r.toTotal) : ''
      rateText.value = r.toTotal ? String(Math.round((r.total / r.toTotal) * 10000) / 10000) : ''
      lines.value = [blankLine()]
    } else {
      lines.value = r.lines.map((l) => ({
        id: copying ? uid() : l.id,
        name: l.name,
        categoryId: l.categoryId,
        amountText: String(l.amount),
        amortMonths: l.amortMonths ?? 1,
        note: l.note ?? '',
        remember: remembered(l.name),
        wasRemembered: !copying && remembered(l.name),
        details: (l.details ?? []).map((d) => ({
          id: uid(),
          name: d.name,
          amountText: String(d.amount),
          qtyText: d.qty ? String(d.qty) : '',
        })),
      }))
    }
    return
  }
  if (route.query.type === 'transfer') type.value = 'transfer'
  // from a card's "記繳卡費": the card is the destination and the statement is the amount
  const toQ = route.query.to
  if (typeof toQ === 'string' && data.accMap.has(toQ)) toAccountId.value = toQ
  const amountQ = route.query.amount
  if (typeof amountQ === 'string' && Number(amountQ) > 0) transferText.value = amountQ
  const noteQ = route.query.note
  if (typeof noteQ === 'string' && noteQ) note.value = noteQ
  const q = route.query.date
  date.value = typeof q === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : today()
  accountId.value = data.accMap.has(s.lastAccountId)
    ? s.lastAccountId
    : (data.sortedAccounts[0]?.id ?? '')
  ledgerId.value = data.writeLedgerId
  lines.value = [blankLine()]
  if (ui.draft) {
    applyDraft(ui.draft)
    ui.draft = null
  }
}

const amountEl = ref<HTMLInputElement>()
// 手機只靠手指，金額直接用內建計算機，不開系統鍵盤
const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches
const ready = ref(false)
watch(
  () => data.ready,
  async (r) => {
    if (!r || ready.value) return
    ready.value = true
    load()
    loadedAt = editing.value?.updatedAt ?? 0
    await nextTick()
    baseline = formSnapshot()
    if (!editingId.value && matchMedia('(pointer: fine)').matches) amountEl.value?.focus()
    // the form is up at once; the newest copy is fetched behind it
    if (editingId.value) void freshen()
  },
  { immediate: true },
)

/** anything typed or tapped since the form opened */
let touched = false
const markTouched = () => (touched = true)
onMounted(() => {
  window.addEventListener('pointerdown', markTouched, true)
  window.addEventListener('keydown', markTouched, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', markTouched, true)
  window.removeEventListener('keydown', markTouched, true)
})

/**
 * Another device may have changed this record. Fetch the newest copy without holding the form back: if a newer one
 * arrives and nothing has been touched yet the form simply shows it, otherwise the person is told instead, since
 * swapping the form under their hands would lose what they typed.
 */
async function freshen() {
  await sync.refresh()
  await nextTick()
  const cur = editing.value
  if (!cur || cur.updatedAt <= loadedAt) return
  if (touched) {
    ui.toast('這筆記錄剛在另一台裝置更新過，儲存會蓋過那份', 'info')
    return
  }
  load()
  loadedAt = cur.updatedAt
  await nextTick()
  baseline = formSnapshot()
}

/** what the form held when it opened, to tell whether anything was changed */
let baseline = ''
let leaving = false
function formSnapshot() {
  return JSON.stringify([
    type.value,
    lines.value,
    accountId.value,
    toAccountId.value,
    ledgerId.value,
    merchantId.value,
    newMerchantName.value,
    date.value,
    time.value,
    note.value,
    companions.value,
    split.value,
    repeat.value,
    transferText.value,
    toTotalText.value,
    rateText.value,
  ])
}
onBeforeRouteLeave(async () => {
  if (leaving || !ready.value || formSnapshot() === baseline) return true
  return await ui.confirm('放棄這筆記錄？', {
    message: '離開後輸入的內容不會保留。',
    confirmText: '離開',
    danger: true,
  })
})
onMounted(() => window.scrollTo(0, 0))

watch(type, (t, old) => {
  if (!ready.value || t === 'transfer' || old === 'transfer') return
  // income and expense have different categories
  for (const l of lines.value) {
    const c = data.catMap.get(l.categoryId)
    if (!c || c.kind !== kind.value) l.categoryId = ''
  }
})

const strip = ref<HTMLElement>()

/** keep the selected item in view when the row scrolls sideways */
function showActive() {
  void nextTick(() =>
    strip.value
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }),
  )
}
watch(active, showActive)

/** items hidden past either edge of the row fade out there, so it is clear the row scrolls */
const fade = reactive({ left: false, right: false })
function updateFade() {
  const el = strip.value
  if (!el) return
  fade.left = el.scrollLeft > 2
  fade.right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
}
const stripMask = computed(() => {
  const mask = `linear-gradient(to right, transparent 0, #000 ${fade.left ? 36 : 0}px, #000 calc(100% - ${fade.right ? 36 : 0}px), transparent 100%)`
  return { maskImage: mask, WebkitMaskImage: mask }
})
watch(
  () => lines.value.length,
  () => void nextTick(updateFade),
  { flush: 'post' },
)
onMounted(() => {
  updateFade()
  window.addEventListener('resize', updateFade)
})
onBeforeUnmount(() => window.removeEventListener('resize', updateFade))

/** a mouse wheel only scrolls up and down, so turn it sideways while over the row */
function onStripWheel(e: WheelEvent) {
  const el = strip.value
  if (!el || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return
  el.scrollLeft += e.deltaY
  e.preventDefault()
}

function addLine() {
  const l = blankLine()
  // another item of the same thing (a burger and a tea at breakfast) starts in the category of the one before;
  // an item that is something else can still be given its own by tapping it again
  l.categoryId = line.value?.categoryId ?? ''
  lines.value.push(l)
  active.value = lines.value.length - 1
  showActive()
  if (lines.value.length === 2 && !s.tipDrag) {
    s.tipDrag = true
    ui.toast('長按品項可以拖曳排序', 'info')
  }
}

// Hold an item for a moment, then drag it to change the order. A quick tap still selects it.
const drag = ref<{ id: string; dx: number; dy: number } | null>(null)
let grab = { x: 0, y: 0 }
let last = { x: 0, y: 0 }
let raf = 0
let pressTimer = 0
let pressAt = { x: 0, y: 0 }
let justDragged = false

/**
 * A mouse cannot swipe the row, so dragging it sideways scrolls it (a finger already does that on its own).
 * Moving before the hold finishes counts as scrolling; holding still first picks an item up instead.
 */
let stripFrom = { x: 0, scroll: 0 }
let stripScrolling = false
let justScrolled = false

function onStripDown(e: PointerEvent) {
  if (e.pointerType !== 'mouse' || e.button !== 0 || !strip.value) return
  stripFrom = { x: e.clientX, scroll: strip.value.scrollLeft }
  stripScrolling = false
  window.addEventListener('pointermove', onStripMove)
  window.addEventListener('pointerup', onStripUp)
}
function onStripMove(e: PointerEvent) {
  const el = strip.value
  if (!el || drag.value) return
  const dx = e.clientX - stripFrom.x
  if (!stripScrolling && Math.abs(dx) > 6) {
    stripScrolling = true
    cancelPress()
  }
  if (stripScrolling) el.scrollLeft = stripFrom.scroll - dx
}
function onStripUp() {
  window.removeEventListener('pointermove', onStripMove)
  window.removeEventListener('pointerup', onStripUp)
  // the click that follows a scroll must not count as a tap on whatever the pointer ended on
  if (stripScrolling) {
    justScrolled = true
    window.setTimeout(() => (justScrolled = false), 60)
  }
  stripScrolling = false
}

function tapLine(i: number) {
  if (justScrolled) return
  if (justDragged) {
    justDragged = false
    return
  }
  if (i === active.value) open('category')
  else active.value = i
}

function cancelPress() {
  window.clearTimeout(pressTimer)
}

function onTabDown(e: PointerEvent, id: string) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  pressAt = { x: e.clientX, y: e.clientY }
  // where on the tile it was picked up, so it does not jump to the centre under the finger
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  grab = { x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) }
  window.clearTimeout(pressTimer)
  pressTimer = window.setTimeout(() => {
    drag.value = { id, dx: 0, dy: 0 }
    last = { ...pressAt }
    raf = requestAnimationFrame(frame)
    justDragged = true
    navigator.vibrate?.(12)
    window.addEventListener('pointermove', carry)
    window.addEventListener('pointerup', drop)
    window.addEventListener('pointercancel', drop)
  }, 380)
}

/** moving before the hold finishes means the finger is scrolling the row, not picking an item up */
function onTabMove(e: PointerEvent) {
  if (!drag.value && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 8) cancelPress()
}

/** while an item is carried the row must not scroll with the finger */
function blockWhileDragging(e: TouchEvent) {
  if (drag.value && e.cancelable) e.preventDefault()
}

function carry(e: PointerEvent) {
  last = { x: e.clientX, y: e.clientY }
}

/**
 * Runs every frame while an item is carried: put it in the slot nearest the finger, then work out how far the
 * tile has to be drawn from where it sits so that it stays under the finger. Reading the tile's real position
 * each frame keeps this right while the other tiles are still sliding aside.
 */
function frame() {
  const el = strip.value
  const d = drag.value
  if (!el || !d) return
  const box = el.getBoundingClientRect()
  const px = last.x - box.left + el.scrollLeft
  const py = last.y - box.top + el.scrollTop
  const tiles = [...el.querySelectorAll<HTMLElement>('[data-tab]')]
  let target = 0
  let best = Infinity
  tiles.forEach((t, i) => {
    // layout positions, not screen ones: unaffected by the tiles' own sliding
    const dist = Math.hypot(
      px - (t.offsetLeft + t.offsetWidth / 2),
      py - (t.offsetTop + t.offsetHeight / 2),
    )
    if (dist < best) {
      best = dist
      target = i
    }
  })
  const from = lines.value.findIndex((l) => l.id === d.id)
  if (from >= 0 && target !== from) {
    const [moved] = lines.value.splice(from, 1)
    lines.value.splice(target, 0, moved!)
    active.value = target
  }
  const tile = tiles.find((t) => t.dataset.id === d.id)
  if (tile) {
    const r = tile.getBoundingClientRect()
    // the row clips whatever sticks out of it, so the carried tile stays inside it: in the single row it only
    // moves sideways, and when spread over several rows it stays within them
    const cx = Math.min(box.right - r.width / 2, Math.max(box.left + r.width / 2, last.x - grab.x))
    const cy = r.top + r.height / 2
    const dx = Math.round(cx - (r.left + r.width / 2))
    const dy = Math.round(cy - (r.top + r.height / 2))
    if (dx !== d.dx || dy !== d.dy) drag.value = { id: d.id, dx, dy }
  }
  if (last.x < box.left + 28) el.scrollLeft -= 8
  else if (last.x > box.right - 28) el.scrollLeft += 8
  raf = requestAnimationFrame(frame)
}

function drop() {
  cancelAnimationFrame(raf)
  drag.value = null
  window.removeEventListener('pointermove', carry)
  window.removeEventListener('pointerup', drop)
  window.removeEventListener('pointercancel', drop)
  // the click that follows letting go of a carried item must not count as a tap
  window.setTimeout(() => (justDragged = false), 60)
}

onBeforeUnmount(() => {
  cancelPress()
  onStripUp()
  drop()
})

function toggleRemember() {
  const l = line.value
  // an item is remembered under a merchant, so without one the star stays off
  if (!l.remember && !merchantId.value && !newMerchantName.value) {
    ui.toast('品項記在商家底下，請先選一個商家', 'info')
    return
  }
  l.remember = !l.remember
}

/** the little x on an item: ask first, then take that item out */
async function removeLine(id: string) {
  if (lines.value.length < 2) return
  const i = lines.value.findIndex((l) => l.id === id)
  if (i < 0) return
  const l = lines.value[i]!
  // name what is about to go: its name, else its category, else its place in the row
  const label = l.name.trim() || data.catMap.get(l.categoryId)?.name || `第 ${i + 1} 項`
  if (
    !(await ui.confirm('移除這個品項？', {
      message: `${label}會從這筆記錄移除。`,
      danger: true,
      confirmText: '移除',
    }))
  )
    return
  // the list may have changed while the dialog was open, so find the item again
  const at = lines.value.findIndex((x) => x.id === id)
  if (at < 0) return
  lines.value.splice(at, 1)
  if (active.value > at) active.value -= 1
  active.value = Math.min(active.value, lines.value.length - 1)
}

function commitAmount() {
  const l = line.value
  const v = evalExpr(l.amountText)
  if (v != null && l.amountText.trim()) l.amountText = String(v)
}

const keypadValue = computed({
  get: () => (type.value === 'transfer' ? total.value : amountOf(line.value)),
  set: (v: number) => {
    if (type.value === 'transfer') {
      transferText.value = v ? String(v) : ''
      fromLeft()
    } else line.value.amountText = v ? String(v) : ''
  },
})

const suggestions = computed(() =>
  type.value === 'transfer'
    ? []
    : suggest(data.merchants, merchantId.value || undefined, line.value.name),
)

function useSuggestion(sug: ReturnType<typeof suggest>[number]) {
  const l = line.value
  l.name = sug.name
  l.categoryId = data.catMap.has(sug.categoryId) ? sug.categoryId : l.categoryId
  l.remember = true
  if (!amountOf(l)) l.amountText = String(sug.price)
}

watch(merchantId, (id) => {
  const m = data.merchantMap.get(id)
  if (m?.defaultAccountId && data.accMap.has(m.defaultAccountId) && !editingId.value) {
    accountId.value = m.defaultAccountId
  }
})

const accountItems = computed(() => {
  const list = data.sortedAccounts
    // a record keeps to its ledger's currency; a transfer can go between any two
    .filter((a) => (!a.archived || a.id === accountId.value) && (type.value === 'transfer' || currencyOf(a) === currency.value))
    .map((a) => ({
      value: a.id,
      label: a.name,
      sub: `餘額 $${fmt(data.balances.get(a.id) ?? 0)}`,
      icon: accountIcon(a),
      color: a.color,
    }))
  // a ledger in another currency only lists spending, so it does not need an account
  return foreign.value ? [{ value: '', label: '不指定帳戶', none: true }, ...list] : list
})
const toAccountItems = computed(() => accountItems.value.filter((a) => a.value !== accountId.value))
const accountName = computed(() => data.accMap.get(accountId.value)?.name ?? (foreign.value ? '不指定帳戶' : '選擇帳戶'))
const toAccountName = computed(() => data.accMap.get(toAccountId.value)?.name ?? '轉入帳戶')
const ledgerName = computed(() => data.ledgerMap.get(ledgerId.value)?.name ?? '帳本')

const dateText = computed(() => {
  const [, m, d] = date.value.split('-')
  const rel = relativeLabel(date.value)
  return ['今天', '昨天', '明天'].includes(rel) ? rel : `${Number(m)}/${Number(d)}`
})

const repeatLabel = computed(() => {
  const r = repeat.value
  if (r.kind === 'once') return '單次'
  if (r.kind === 'installment') return `分期 ${r.periods} 期`
  return `${{ daily: '每天', weekly: '每週', monthly: '每月', yearly: '每年' }[r.freq]}${r.interval > 1 ? ` x${r.interval}` : ''}`
})
const canInstall = computed(
  () => type.value === 'expense' && lines.value.length === 1 && !editingId.value,
)

// ---- the parts of an item (a burger and a tea): names and amounts, no categories
/** what a part cost, as typed (the quantity is only a count) */
const subtotalOf = (d: { amountText: string }) => evalExpr(d.amountText) ?? 0
const detailsOf = (l: LineForm) =>
  l.details
    .map((d) => {
      const qty = evalExpr(d.qtyText, 2) ?? 0
      return { name: d.name.trim(), amount: subtotalOf(d), ...(qty > 0 ? { qty } : {}) }
    })
    .filter((d) => d.name || d.amount)

/**
 * Parts used before, most used first, offered only when there is something to go by: the ones bought at the chosen merchant,
 * else the ones under this item's category (at any merchant). One tap puts one in.
 */
const detailSuggestions = computed(() => {
  const here = line.value?.categoryId
  const shop = merchantId.value
  const collect = (match: (r: Rec, l: Rec['lines'][number]) => boolean) => {
    const seen = new Map<string, { name: string; amount: number; uses: number; at: string }>()
    for (const r of data.records) {
      for (const l of r.lines) {
        if (!match(r, l)) continue
        for (const d of l.details ?? []) {
          const cur = seen.get(d.name)
          const latest = !cur || r.date >= cur.at
          seen.set(d.name, {
            name: d.name,
            amount: latest ? d.amount : cur.amount,
            uses: (cur?.uses ?? 0) + 1,
            at: latest ? r.date : cur.at,
          })
        }
      }
    }
    return [...seen.values()]
  }
  let list = shop ? collect((r) => r.merchantId === shop) : []
  if (!list.length && here) list = collect((_r, l) => l.categoryId === here)
  const taken = new Set((line.value?.details ?? []).map((d) => d.name.trim()))
  return list
    .filter((d) => !taken.has(d.name))
    .sort((a, b) => b.uses - a.uses || b.at.localeCompare(a.at))
    .slice(0, 8)
})

function useDetail(sug: { name: string; amount: number }) {
  const l = line.value
  // fill the empty row that is waiting, else add one
  const empty = l.details.find((d) => !d.name.trim() && !d.amountText.trim() && !d.qtyText.trim())
  if (empty) {
    empty.name = sug.name
    empty.amountText = sug.amount ? String(sug.amount) : ''
  } else
    l.details.push({
      id: uid(),
      name: sug.name,
      amountText: sug.amount ? String(sug.amount) : '',
      qtyText: '',
    })
  syncDetails()
}

/** the part being added or edited in the small window */
/** `priceText` only helps work out the subtotal; it is not kept */
const partEdit = ref<{ id: string; name: string; qtyText: string; priceText: string; amountText: string; isNew: boolean } | null>(null)
/** with a unit price typed, the subtotal follows price times count (one when no count) */
function calcPart() {
  const p = partEdit.value
  if (!p) return
  const price = evalExpr(p.priceText)
  if (!price) return
  const qty = evalExpr(p.qtyText) || 1
  p.amountText = String(Math.round(price * qty * 100) / 100)
}
function addDetail() {
  partEdit.value = { id: uid(), name: '', qtyText: '', priceText: '', amountText: '', isNew: true }
}
function editDetail(d: LineForm['details'][number]) {
  partEdit.value = { id: d.id, name: d.name, qtyText: d.qtyText, priceText: '', amountText: d.amountText, isNew: false }
}
const partNameEl = ref<HTMLInputElement>()
watch(
  () => partEdit.value?.id,
  async (id) => {
    if (!id) return
    await nextTick()
    partNameEl.value?.focus()
  },
)
function savePart() {
  const p = partEdit.value
  if (!p) return
  partEdit.value = null
  // nothing typed: nothing to add
  if (!p.name.trim() && !p.amountText.trim()) return
  const list = line.value.details
  const next = { id: p.id, name: p.name, qtyText: p.qtyText, amountText: p.amountText }
  const i = list.findIndex((x) => x.id === p.id)
  if (i >= 0) list[i] = next
  else list.push(next)
  syncDetails()
}
function removeDetail(id: string) {
  line.value.details = line.value.details.filter((d) => d.id !== id)
  syncDetails()
}
function dropPart() {
  const p = partEdit.value
  partEdit.value = null
  if (p) removeDetail(p.id)
}

// ---- reordering the parts: the bar on a row is dragged ----
const detailListEl = ref<HTMLElement>()
/** the part being carried, and how far it is drawn from its place */
const partDrag = ref<{ id: string; dy: number } | null>(null)
let partPointerY = 0
let partGrabY = 0
let partRaf = 0

function pressPart(e: PointerEvent, id: string) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const row = (e.currentTarget as HTMLElement).closest('li')!
  navigator.vibrate?.(12)
  startPartDrag(row, e.clientY, id)
}
/** once carrying, the page must not scroll under the finger */
const stopPartScroll = (e: TouchEvent) => e.preventDefault()
function startPartDrag(row: HTMLElement, clientY: number, id: string) {
  const r = row.getBoundingClientRect()
  partGrabY = clientY - (r.top + r.height / 2)
  partPointerY = clientY
  partDrag.value = { id, dy: 0 }
  window.addEventListener('touchmove', stopPartScroll, { passive: false })
  window.addEventListener('pointermove', movePart)
  window.addEventListener('pointerup', endPartDrag)
  window.addEventListener('pointercancel', endPartDrag)
  partRaf = requestAnimationFrame(partFrame)
}
function movePart(e: PointerEvent) {
  partPointerY = e.clientY
}
/** every frame: swap parts when the finger crosses one, and keep the carried part under the finger */
function partFrame() {
  const el = detailListEl.value
  const d = partDrag.value
  if (!el || !d) return
  const box = el.getBoundingClientRect()
  const items = [...el.querySelectorAll<HTMLElement>('[data-part]')]
  const py = partPointerY - box.top
  let target = 0
  let best = Infinity
  items.forEach((t, i) => {
    // layout positions, so the rows' own sliding does not matter
    const dist = Math.abs(py - (t.offsetTop + t.offsetHeight / 2))
    if (dist < best) {
      best = dist
      target = i
    }
  })
  const list = line.value.details
  const from = list.findIndex((x) => x.id === d.id)
  if (from >= 0 && target !== from) {
    const [moved] = list.splice(from, 1)
    list.splice(target, 0, moved!)
  }
  const cur = items.find((t) => t.dataset.id === d.id)
  if (cur) {
    const r = cur.getBoundingClientRect()
    const centre = Math.min(box.bottom - r.height / 2, Math.max(box.top + r.height / 2, partPointerY - partGrabY))
    const dy = Math.round(centre - (r.top + r.height / 2))
    if (dy !== d.dy) partDrag.value = { id: d.id, dy }
  }
  // near the top or bottom of the screen, the page follows
  if (partPointerY < 90) window.scrollBy(0, -10)
  else if (partPointerY > window.innerHeight - 90) window.scrollBy(0, 10)
  partRaf = requestAnimationFrame(partFrame)
}
function endPartDrag() {
  cancelAnimationFrame(partRaf)
  window.removeEventListener('touchmove', stopPartScroll)
  window.removeEventListener('pointermove', movePart)
  window.removeEventListener('pointerup', endPartDrag)
  window.removeEventListener('pointercancel', endPartDrag)
  partDrag.value = null
}
onBeforeUnmount(() => endPartDrag())
/** the parts added up */
const detailSum = (l: LineForm) =>
  Math.round(l.details.reduce((n, d) => n + subtotalOf(d), 0) * 100) / 100
/** the item's amount follows the parts as long as nobody typed a different one; if one was typed, the gap is only pointed out */
function syncDetails() {
  const l = line.value
  if (!l.details.some((d) => d.amountText.trim())) return
  const sum = detailSum(l)
  const typed = l.amountText.trim() ? evalExpr(l.amountText) : null
  if (typed == null || typed === l.autoSum) {
    l.amountText = String(sum)
    l.autoSum = sum
  }
}
/** how far the parts are from the item's amount, once both are filled in */
const detailGap = computed(() => {
  const l = line.value
  if (!l || !l.details.some((d) => d.amountText.trim())) return 0
  const typed = evalExpr(l.amountText)
  return typed == null ? 0 : Math.round((detailSum(l) - typed) * 100) / 100
})

const lineCat = (l: LineForm) => data.catMap.get(l.categoryId)

// photos attached to this record (kept on this device)
const photos = ref<Photo[]>([])
const viewing = ref('')

async function onPhotos(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  for (const f of files) {
    try {
      photos.value.push(await addPhoto(f))
    } catch (err) {
      ui.toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }
}
const fileEl = ref<HTMLInputElement>()
function onCamera() {
  if (photos.value.length) open('photos')
  else fileEl.value?.click()
}

function dropPhoto(p: Photo) {
  photos.value = photos.value.filter((x) => x.id !== p.id)
  if (p.blob) URL.revokeObjectURL(p.url)
}
onBeforeUnmount(() => releasePhotos(photos.value))

const saving = ref(false)

async function submit() {
  if (saving.value) return
  commitAmount()
  if (editingId.value) {
    // another device may have saved this record since it was opened: pull first, and ask before covering that change
    saving.value = true
    try {
      await sync.refresh(10_000, 5000)
      await nextTick()
    } finally {
      saving.value = false
    }
    const cur = editing.value
    if (cur && cur.updatedAt > loadedAt) {
      const ok = await ui.confirm('這筆記錄在另一台裝置更新過', { message: '儲存會蓋過那份更新。', confirmText: '仍要儲存' })
      if (!ok) return
      loadedAt = cur.updatedAt
    }
  }
  const recType = type.value
  let recLines: Line[] = []
  let sum = 0
  if (recType === 'transfer') {
    if ((evalExpr(transferText.value) ?? 0) <= 0) return ui.toast('請輸入轉帳金額', 'error')
    if (!toAccountId.value || toAccountId.value === accountId.value)
      return ui.toast('請選擇不同的轉入帳戶', 'error')
    if (needToAmount.value && !((evalExpr(toTotalText.value) ?? 0) > 0))
      return ui.toast(`請輸入轉入的${toCur.value}金額`, 'error')
    sum = total.value
  } else {
    const used = lines.value.filter((l) => l.name.trim() || amountOf(l) !== 0)
    if (!used.length) return ui.toast('請輸入金額', 'error')
    for (const l of used) {
      if (!l.categoryId) return ui.toast('請選擇分類', 'error')
      if (evalExpr(l.amountText) == null)
        return ui.toast(`金額格式不正確：${l.amountText}`, 'error')
    }
    recLines = used.map((l) => ({
      id: l.id,
      name: l.name.trim(),
      categoryId: l.categoryId,
      amount: amountOf(l),
      ...(l.note.trim() ? { note: l.note.trim() } : {}),
      ...(detailsOf(l).length ? { details: detailsOf(l) } : {}),
      // spreading an expense over months is set up under 更多 → 攤提; editing a record keeps what is there
      ...(recType === 'expense' && l.amortMonths > 1 ? { amortMonths: l.amortMonths } : {}),
    }))
    sum = recLines.reduce((n, l) => n + l.amount, 0)
    if (sum === 0) return ui.toast('金額合計不能是 0', 'error')
  }
  if (!accountId.value && !foreign.value) return ui.toast('請選擇帳戶', 'error')

  saving.value = true
  try {
    // only starred items are remembered; one that lost its star is forgotten again
    const keep = new Set(
      lines.value.filter((l) => l.remember && l.name.trim()).map((l) => l.name.trim()),
    )
    const forget = new Set(
      lines.value
        .filter((l) => !l.remember && l.wasRemembered && l.name.trim())
        .map((l) => l.name.trim()),
    )
    const mid =
      recType === 'transfer'
        ? undefined
        : await learn(
            newMerchantName.value || merchant.value?.name || '',
            merchantId.value || undefined,
            {
              type: recType,
              lines: recLines,
              date: date.value,
              accountId: accountId.value,
            },
            { keep, forget },
          )

    // a shared bill is worked out again from today's total, in case the amount or the people changed
    const splitNow =
      recType === 'expense' ? resolveSplit(split.value, sum, [...companions.value]) : undefined

    const base: Omit<Rec, 'updatedAt'> = {
      id: editingId.value || uid(),
      type: recType,
      date: date.value,
      time: time.value,
      ...(editing.value?.createdAt
        ? { createdAt: editing.value.createdAt }
        : editingId.value
          ? {}
          : { createdAt: Date.now() }),
      ...(editing.value?.pos !== undefined ? { pos: editing.value.pos } : {}),
      ledgerId: ledgerId.value || data.writeLedgerId,
      accountId: accountId.value,
      ...(recType === 'transfer' ? { toAccountId: toAccountId.value } : {}),
      ...(recType === 'transfer' && needToAmount.value ? { toTotal: evalExpr(toTotalText.value) ?? 0 } : {}),
      ...(mid ? { merchantId: mid } : {}),
      lines: recLines,
      total: sum,
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
      ...(recType !== 'transfer' && companions.value.length
        ? { companions: [...companions.value] }
        : {}),
      ...(splitNow ? { split: splitNow } : {}),
      ...(recurringId.value ? { recurringId: recurringId.value } : {}),
    }

    const r = repeat.value
    if (!editingId.value && r.kind !== 'once') {
      const ruleId = uid()
      const template = {
        type: recType,
        accountId: base.accountId,
        toAccountId: base.toAccountId,
        ledgerId: base.ledgerId,
        merchantId: base.merchantId,
        lines:
          recType === 'transfer'
            ? [{ id: uid(), name: '轉帳', categoryId: '', amount: sum }]
            : recLines,
        note: base.note,
      }
      const firstName =
        recLines[0]?.name ||
        merchantLabel.value ||
        data.catName(recLines[0]?.categoryId ?? '') ||
        '週期交易'
      const rule: Omit<Recurring, 'updatedAt'> =
        r.kind === 'installment'
          ? {
              id: ruleId,
              name: firstName,
              kind: 'installment',
              template,
              freq: 'monthly',
              interval: 1,
              startDate: date.value,
              count: r.periods,
              generated: 0,
              autoPost: true,
              active: true,
              installment: { total: sum, periods: r.periods, fee: r.fee },
            }
          : {
              id: ruleId,
              name: firstName,
              kind: 'recurring',
              template,
              freq: r.freq,
              interval: r.interval,
              startDate: date.value,
              endDate: r.endDate,
              generated: 0,
              autoPost: r.autoPost,
              active: true,
            }
      // this record is the first occurrence
      const first = buildRecord({ ...rule, updatedAt: 0 }, 0)
      rule.generated = 1
      await save('recurrings', rule)
      await save('records', {
        ...first,
        time: base.time,
        total: first.total,
        lines: first.lines,
      })
      await savePhotos(first.id, photos.value)
    } else {
      await save('records', base)
      await syncSplitLoans(base)
      await savePhotos(base.id, photos.value)
    }
    if (accountId.value) s.lastAccountId = accountId.value
    leaving = true
    void router.replace('/')
  } finally {
    saving.value = false
  }
}

async function destroy() {
  if (!(await ui.confirm('刪除這筆記錄？', { danger: true, confirmText: '刪除' }))) return
  await remove('records', editingId.value)
  await forgetPhotos(editingId.value)
  leaving = true
  void router.back()
}

function cancel() {
  if (window.history.state?.back) router.back()
  else void router.push('/')
}
</script>

<template>
  <div v-if="ready" class="pb-24">
    <header
      class="sticky top-0 z-20 -mx-4 mb-3 grid grid-cols-[1fr_auto_1fr] items-center bg-bg px-4 py-2"
    >
      <button class="circle-btn" aria-label="取消" @click="cancel"><X :size="22" /></button>
      <h1 class="text-xl font-bold">{{ editingId ? '編輯記錄' : '新增記錄' }}</h1>
      <div class="flex items-center justify-end gap-2">
        <button
          v-if="type !== 'transfer'"
          class="circle-btn"
          aria-label="掃描發票"
          title="掃描發票"
          @click="open('scan')"
        >
          <ScanLine :size="21" />
        </button>
      </div>
    </header>

    <PillTabs
      v-model="type"
      class="mb-4"
      size="sm"
      :options="[
        { value: 'expense', label: '支出' },
        { value: 'income', label: '收入' },
        { value: 'transfer', label: '轉帳', icon: ArrowLeftRight },
      ]"
    />

    <!-- one tab per item of the receipt: tap the selected one to pick its category, hold and drag to reorder -->
    <section v-if="type !== 'transfer'" class="mb-4">
      <div
        ref="strip"
        class="relative -mx-4 flex cursor-grab items-start gap-x-2 gap-y-3 overflow-x-auto px-4 pt-3 pb-1 scrollbar-none"
        :style="stripMask"
        @scroll.passive="updateFade"
        @wheel="onStripWheel"
        @touchmove="blockWhileDragging"
        @pointerdown="onStripDown"
      >
        <TransitionGroup tag="div" name="tabs" class="contents">
          <button
            v-for="(l, i) in lines"
            :key="l.id"
            data-tab
            :data-id="l.id"
            class="relative shrink-0 select-none [-webkit-touch-callout:none]"
            :class="drag?.id === l.id && 'z-30'"
            :data-active="i === active"
            :aria-label="`品項 ${i + 1}`"
            @click="tapLine(i)"
            @pointerdown="onTabDown($event, l.id)"
            @pointermove="onTabMove"
            @pointerup="cancelPress"
            @pointercancel="cancelPress"
            @contextmenu.prevent
          >
            <span
              class="flex w-[68px] flex-col items-center gap-2 transition-transform duration-150"
              :class="drag?.id === l.id && 'drop-shadow-lg'"
              :style="
                drag?.id === l.id
                  ? {
                      transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.12)`,
                      transition: 'none',
                    }
                  : undefined
              "
            >
              <CatIcon
                v-if="lineCat(l)"
                :icon="lineCat(l)?.icon"
                :color="lineCat(l)?.color"
                :size="56"
                :ring="i === active"
              />
              <!-- nothing chosen yet: just a plus, tap to pick -->
              <span
                v-else
                class="inline-flex size-14 items-center justify-center rounded-[14px] border-2 border-dashed border-line text-muted"
              >
                <Plus :size="24" />
              </span>
              <span
                v-if="lines.length > 1"
                role="button"
                :aria-label="`移除品項 ${i + 1}`"
                class="absolute -top-1.5 right-0 grid size-5 place-items-center rounded-full bg-ink/70 text-white"
                @click.stop="removeLine(l.id)"
                @pointerdown.stop
              >
                <X :size="12" :stroke-width="3" />
              </span>
              <span class="flex w-full flex-col items-center gap-0.5">
                <span
                  class="max-w-full truncate text-xs leading-tight"
                  :class="i === active ? 'font-semibold text-ink/90' : 'text-muted'"
                >
                  {{ l.name.trim() || lineCat(l)?.name || '' }}
                </span>
                <span
                  class="text-xs font-medium leading-tight"
                  :class="amountOf(l) ? 'text-ink/80' : 'text-success'"
                >
                  ${{ fmt(amountOf(l)) }}
                </span>
              </span>
            </span>
          </button>
        </TransitionGroup>
        <!-- another item only after every item so far has a category -->
        <button
          v-if="lines.every((l) => l.categoryId)"
          class="grid size-14 shrink-0 place-items-center rounded-[14px] bg-surface-2 text-muted transition active:scale-95"
          aria-label="新增品項"
          @click="addLine"
        >
          <Plus :size="24" />
        </button>
      </div>
      <div v-if="lines.length > 1" class="mt-2 text-center text-sm font-medium text-muted">
        共 {{ lines.length }} 項
      </div>
    </section>

    <!-- the selected item: amount and name -->
    <section class="mb-3">
      <div class="space-y-3">
        <div class="field justify-start gap-3 pr-2">
          <span
            class="inline-flex items-center rounded-lg bg-surface-2 px-2.5 py-1 text-sm font-medium"
            :aria-label="`幣別 ${type === 'transfer' ? transferCur : currency}`"
          >
            {{ type === 'transfer' ? transferCur : currency }}
          </span>
          <input
            v-if="type === 'transfer'"
            v-model="transferText"
            class="min-w-0 flex-1 bg-transparent text-right text-xl outline-none"
            :class="needToAmount && 'placeholder:text-[15px]'"
            :inputmode="touchOnly ? 'none' : 'decimal'"
            :readonly="touchOnly"
            :placeholder="needToAmount ? '轉出金額' : '0'"
            :aria-label="needToAmount ? `轉出金額 ${transferCur}` : undefined"
            @focus="($event.target as HTMLInputElement).select()"
            @click="touchOnly && open('keypad')"
            @input="fromLeft"
          />
          <input
            v-else
            ref="amountEl"
            v-model="line.amountText"
            class="min-w-0 flex-1 bg-transparent text-right text-xl outline-none"
            :inputmode="touchOnly ? 'none' : 'decimal'"
            :readonly="touchOnly"
            placeholder="0"
            @focus="($event.target as HTMLInputElement).select()"
            @click="touchOnly && open('keypad')"
            @blur="commitAmount"
            @keydown.enter.prevent="commitAmount"
          />
          <button
            class="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted"
            aria-label="計算機"
            @click="open('keypad')"
          >
            <Calculator :size="18" />
          </button>
        </div>

        <div v-if="type !== 'transfer'" class="field justify-start gap-2 pr-2">
          <input
            v-model="line.name"
            class="min-w-0 flex-1 bg-transparent outline-none"
            placeholder="品項名稱"
            maxlength="60"
          />
          <!-- a starred item is remembered under the merchant -->
          <button
            class="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 transition"
            :class="line.remember ? 'text-primary' : 'text-muted'"
            :aria-pressed="line.remember"
            :aria-label="line.remember ? '取消記住這個品項' : '記住這個品項'"
            @click="toggleRemember"
          >
            <Star :size="18" :fill="line.remember ? 'currentColor' : 'none'" />
          </button>
        </div>

        <!-- right under the name: the starred items, one tap to fill one in -->
        <div v-if="type !== 'transfer' && suggestions.length" class="-mt-1">
          <div class="flex flex-wrap gap-2">
            <button
              v-for="sug in suggestions"
              :key="`${sug.merchant}-${sug.name}`"
              class="chip text-ink/85"
              @click="useSuggestion(sug)"
            >
              <span>{{ sug.name }}</span>
              <span class="text-xs text-muted">${{ fmt(sug.price) }}</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- the whole record -->
    <section class="mb-5 grid grid-cols-2 gap-3">
      <button class="field justify-start" @click="open('account')">
        <Wallet :size="17" class="shrink-0 text-muted" />
        <span class="truncate" :class="!accountId && 'field-empty'">{{
          type === 'transfer' ? `轉出：${accountName}` : accountName
        }}</span>
      </button>
      <button v-if="type === 'transfer'" class="field justify-start" @click="open('toAccount')">
        <Wallet :size="17" class="shrink-0 text-muted" />
        <span class="truncate" :class="!toAccountId && 'field-empty'">{{
          type === 'transfer' && toAccountId ? `轉入：${toAccountName}` : '選擇轉入帳戶'
        }}</span>
      </button>
      <div v-if="needToAmount" class="col-span-2 space-y-3">
        <div class="field justify-start gap-3 pr-3">
          <span class="whitespace-nowrap text-sm text-muted">1 {{ toCur }} =</span>
          <input
            v-model="rateText"
            class="min-w-0 flex-1 bg-transparent text-right text-lg outline-none placeholder:text-[15px]"
            inputmode="decimal"
            placeholder="匯率（選填）"
            @input="fromRate"
          />
          <span class="text-sm text-muted">{{ transferCur }}</span>
        </div>
        <div class="field justify-start gap-3 pr-2">
          <span class="inline-flex items-center rounded-lg bg-surface-2 px-2.5 py-1 text-sm font-medium">{{ toCur }}</span>
          <input
            v-model="toTotalText"
            class="min-w-0 flex-1 bg-transparent text-right text-xl outline-none placeholder:text-[15px]"
            inputmode="decimal"
            placeholder="轉入金額"
            :aria-label="`轉入金額 ${toCur}`"
            @input="fromArrived"
          />
        </div>
      </div>
      <button class="field justify-start" @click="open('ledger')">
        <BookMarked :size="17" class="shrink-0 text-muted" />
        <span class="truncate">{{ ledgerName }}</span>
      </button>

      <template v-if="type !== 'transfer'">
        <button class="field justify-start" @click="open('merchant')">
          <Store :size="17" class="shrink-0 text-muted" />
          <span class="truncate" :class="!merchantLabel && 'field-empty'">{{
            merchantLabel || '商家'
          }}</span>
        </button>
        <button
          class="field justify-start disabled:cursor-not-allowed disabled:opacity-45"
          :class="repeat.kind !== 'once' && 'border-primary text-primary-strong'"
          :disabled="!!editingId"
          @click="open('repeat')"
        >
          <RepeatIcon :size="17" class="shrink-0" :class="repeat.kind === 'once' && 'text-muted'" />
          <span class="truncate">{{ editingId && recurringId ? '週期交易' : repeatLabel }}</span>
        </button>
      </template>

      <div class="col-span-2 grid grid-cols-2 gap-3">
        <button class="field justify-start" @click="open('date')">
          <CalendarDays :size="17" class="shrink-0 text-muted" />
          <span class="truncate"
            >{{ dateText }}
            <span class="text-sm text-muted">(週{{ WEEKDAYS[weekday(date)] }})</span></span
          >
        </button>
        <TimeField
          v-model="time"
          title="時間"
          placeholder="時間（選填）"
          clearable
          class="w-full"
        />
      </div>
      <!-- a transfer has no item name, so its note sits with the rest below -->
      <div v-if="type === 'transfer'" class="field col-span-2 justify-start gap-2 pr-2">
        <input
          v-model="note"
          class="min-w-0 flex-1 bg-transparent outline-none"
          placeholder="備註"
        />
        <button
          class="inline-flex size-9 shrink-0 items-center justify-center gap-1 rounded-full bg-surface-2 text-muted"
          :aria-label="photos.length ? `圖片（${photos.length} 張）` : '附加圖片'"
          @click="onCamera"
        >
          <Camera :size="18" />
        </button>
      </div>
      <!-- who the money is spent with, and how it is shared, under one title -->
      <div v-if="type !== 'transfer'" class="col-span-2 mt-2 space-y-2">
        <p class="label !mb-0 pb-1">成員</p>
        <button class="field w-full justify-start" @click="open('companions')">
          <Users :size="17" class="shrink-0 text-muted" />
          <span class="truncate" :class="!companions.length && 'field-empty'">{{
            companions.length ? companions.map(data.memberName).join('、') : '和誰一起（選填）'
          }}</span>
        </button>
        <button
          v-if="type === 'expense' && companions.length"
          class="field w-full justify-start"
          @click="open('split')"
        >
          <HandCoins :size="17" class="shrink-0 text-muted" />
          <span class="truncate" :class="!split && 'field-empty'">{{ splitText }}</span>
        </button>
      </div>
    </section>

    <!-- the parts of this item: names and amounts, not categories -->
    <div v-if="type !== 'transfer'" class="mb-5">
      <p class="label !mb-2 pb-1">細項（選填）</p>
      <div v-if="line.details.length" ref="detailListEl" class="relative">
        <!-- the parts only slide aside while one is being carried -->
        <TransitionGroup tag="ul" :name="partDrag ? 'rows' : 'still'" class="space-y-2">
          <li
            v-for="d in line.details"
            :key="d.id"
            data-part
            :data-id="d.id"
            class="relative"
            :class="partDrag?.id === d.id && 'z-10'"
          >
            <!-- tap the row to edit it; the bar on the right is dragged to reorder -->
            <div
              class="flex items-center gap-3 rounded-2xl border border-line bg-surface py-1.5 pr-1.5 pl-4 transition-transform duration-150 select-none"
              :class="partDrag?.id === d.id ? 'bg-surface shadow-xl ring-2 ring-primary' : ''"
              :style="partDrag?.id === d.id ? { transform: `translateY(${partDrag.dy}px)`, transition: 'none' } : undefined"
            >
              <button class="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left" @click="editDetail(d)">
                <span class="min-w-0 flex-1 truncate" :class="!d.name.trim() && 'text-muted'">{{ d.name.trim() || '未命名' }}</span>
                <span class="shrink-0 text-sm text-muted">×{{ d.qtyText || 1 }}</span>
                <span class="shrink-0 text-sm font-medium tabular-nums">{{ foreign ? currency : '$' }}{{ d.amountText || 0 }}</span>
              </button>
              <span
                class="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-full text-muted active:cursor-grabbing"
                aria-label="拖曳調整順序"
                @pointerdown.prevent="pressPart($event, d.id)"
              >
                <GripVertical :size="18" />
              </span>
            </div>
          </li>
        </TransitionGroup>
      </div>
      <!-- new parts go at the bottom, under the ones already there -->
      <button
        class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-primary-soft py-2.5 text-sm font-semibold text-primary-strong transition active:scale-[0.99]"
        @click="addDetail"
      >
        <Plus :size="16" />新增細項
      </button>
      <p v-if="detailGap" class="mt-2 flex items-start gap-1.5 text-xs text-muted">
        <Info :size="14" class="mt-px shrink-0" />
        <span
          >細項加起來 {{ foreign ? `${currency} ` : '$' }}{{ fmt(detailSum(line)) }}，比上面的金額{{
            detailGap > 0 ? '多' : '少'
          }}
          {{ foreign ? `${currency} ` : '$' }}{{ fmt(Math.abs(detailGap)) }}。</span
        >
      </p>
      <p v-if="!line.details.length && !detailSuggestions.length" class="mt-2 text-xs text-muted">
        同一個分類裡想分開記，例如早餐的漢堡和紅茶。
      </p>
      <!-- used before: one tap adds it with its last amount -->
      <div v-if="detailSuggestions.length" class="mt-3 flex flex-wrap gap-1.5">
        <button
          v-for="sug in detailSuggestions"
          :key="sug.name"
          class="chip text-ink/85"
          @click="useDetail(sug)"
        >
          <span>{{ sug.name }}</span>
          <span v-if="sug.amount" class="text-xs text-muted">${{ fmt(sug.amount) }}</span>
        </button>
      </div>
    </div>

    <div v-if="type !== 'transfer' && lines.length > 1" class="mb-3">
      <p class="label">品項備註（{{ lineCat(line)?.name ?? '還沒選分類' }}）</p>
      <input v-model="line.note" class="input" placeholder="只記在這個品項上，選填" />
    </div>
    <div v-if="type !== 'transfer'" class="mb-4">
      <p class="label">附註（選填）</p>
      <!-- the note box holds the camera at its bottom right: tap it to add pictures -->
      <div class="relative">
        <textarea v-model="note" class="input block min-h-32 resize-none pb-16" />
        <div class="absolute right-3 bottom-3 left-3 flex items-center justify-end gap-2">
          <img
            v-for="p in photos.slice(0, 4)"
            :key="p.id"
            :src="p.url"
            alt=""
            class="size-10 shrink-0 rounded-xl border border-line object-cover"
          />
          <button
            class="relative grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-muted"
            :aria-label="photos.length ? `圖片（${photos.length} 張）` : '附加圖片'"
            @click="onCamera"
          >
            <Camera :size="20" />
            <span
              v-if="photos.length"
              class="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-white"
              >{{ photos.length }}</span
            >
          </button>
        </div>
      </div>
    </div>

    <div v-if="type === 'transfer' && !editingId" class="mb-4 space-y-1 text-xs text-muted">
      <p>轉帳不計入收入或支出，只會調整兩個帳戶的餘額。</p>
      <p>信用卡還款可以用轉帳記錄。</p>
    </div>

    <dl v-if="editing?.updatedAt" class="mb-3 ml-auto grid w-fit grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-right text-[11px] leading-tight text-muted/80">
      <template v-if="editing.createdAt">
        <dt>新增</dt>
        <dd class="tabular-nums">{{ addedAt(editing.createdAt) }}</dd>
      </template>
      <!-- records from before the add time was kept only have the last change; one just added has no change yet -->
      <template v-if="!editing.createdAt || editing.updatedAt - editing.createdAt > 60_000">
        <dt>編輯</dt>
        <dd class="tabular-nums">{{ addedAt(editing.updatedAt) }}</dd>
      </template>
    </dl>

    <button v-if="editingId" class="btn btn-ghost w-full text-danger" @click="destroy">
      <Trash2 :size="16" />刪除這筆記錄
    </button>

    <div
      class="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur"
    >
      <div class="mx-auto flex max-w-xl items-center gap-6">
        <div class="min-w-0">
          <p class="text-xs text-muted">
            {{ type === 'income' ? '收入' : type === 'transfer' ? '轉帳' : '支出' }}合計
          </p>
          <p class="text-xl leading-tight font-bold">
            <template v-if="totalText.startsWith('$')"
              ><span class="mr-px">$</span>{{ totalText.slice(1) }}</template
            >
            <template v-else>{{ totalText }}</template>
          </p>
        </div>
        <button class="btn btn-primary flex-1" :disabled="saving" @click="submit">儲存</button>
      </div>
    </div>

    <CategoryPickerSheet v-model:open="categorySheet" v-model="line.categoryId" :kind="kind" />
    <KeypadSheet v-model:open="keypadSheet" v-model="keypadValue" />
    <!-- a small centred window for adding or editing one part -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="partEdit"
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          @click.self="partEdit = null"
          @keydown.esc="partEdit = null"
        >
          <form class="card w-full max-w-[21rem] space-y-5 p-5 shadow-xl" @submit.prevent="savePart">
            <h2 class="text-lg leading-snug font-bold">{{ partEdit.isNew ? '新增細項' : '編輯細項' }}</h2>
            <div class="space-y-3">
              <input ref="partNameEl" v-model="partEdit.name" class="input" placeholder="名稱，例如 漢堡" />
              <div class="grid grid-cols-2 gap-3">
                <span class="relative">
                  <span class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-muted">×</span>
                  <input v-model="partEdit.qtyText" class="input w-full !pr-3 !pl-7 text-right" inputmode="decimal" placeholder="數量" @input="calcPart" />
                </span>
                <span class="relative">
                  <span class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-muted">{{ foreign ? currency : '$' }}</span>
                  <input
                    v-model="partEdit.priceText"
                    class="input w-full !pr-3 text-right"
                    :class="foreign ? '!pl-11' : '!pl-7'"
                    inputmode="decimal"
                    placeholder="單價"
                    @input="calcPart"
                  />
                </span>
              </div>
              <span class="relative block">
                <span class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-muted">{{ foreign ? currency : '$' }}</span>
                <input
                  v-model="partEdit.amountText"
                  class="input w-full !pr-3 text-right"
                  :class="foreign ? '!pl-11' : '!pl-7'"
                  inputmode="decimal"
                  placeholder="小計"
                />
              </span>
            </div>
            <div class="space-y-2">
              <div class="grid grid-cols-2 gap-2">
                <button type="button" class="btn btn-soft" @click="partEdit = null">取消</button>
                <button type="submit" class="btn btn-primary">確認</button>
              </div>
              <button v-if="!partEdit.isNew" type="button" class="btn btn-ghost w-full text-danger" @click="dropPart">刪除這個細項</button>
            </div>
          </form>
        </div>
      </Transition>
    </Teleport>

    <MerchantPickerSheet
      v-model:open="merchantSheet"
      v-model="merchantId"
      v-model:new-name="newMerchantName"
    />
    <PickSheet
      v-model:open="accountSheet"
      v-model="accountId"
      title="選擇帳戶"
      :items="accountItems"
    />
    <PickSheet
      v-model:open="toAccountSheet"
      v-model="toAccountId"
      title="選擇轉入帳戶"
      :items="toAccountItems"
    />
    <LedgerPickSheet v-model:open="ledgerSheet" v-model="ledgerId" title="選擇帳本" />
    <RepeatSheet
      v-model:open="repeatSheet"
      v-model="repeat"
      :total="total"
      :can-install="canInstall"
    />
    <ScanSheet v-model:open="scanSheet" @draft="applyDraft" />
    <CompanionSheet v-model:open="companionSheet" v-model="companions" />
    <SplitSheet v-model:open="splitSheet" v-model="split" :total="total" :people="companions" />
    <DatePickerSheet v-model:open="dateSheet" v-model="date" title="日期" />
    <input ref="fileEl" type="file" accept="image/*" multiple class="hidden" @change="onPhotos" />
    <BottomSheet v-model="photoSheet" title="圖片">
      <div class="grid grid-cols-3 gap-3">
        <div v-for="p in photos" :key="p.id" class="relative aspect-square">
          <button
            class="size-full overflow-hidden rounded-2xl border border-line"
            aria-label="查看圖片"
            @click="viewing = p.url"
          >
            <img :src="p.url" alt="" class="size-full object-cover" />
          </button>
          <button
            class="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-ink text-bg"
            aria-label="移除圖片"
            @click="dropPhoto(p)"
          >
            <X :size="13" :stroke-width="2.6" />
          </button>
        </div>
        <button
          class="grid aspect-square place-items-center rounded-2xl border border-dashed border-line text-muted"
          aria-label="新增圖片"
          @click="fileEl?.click()"
        >
          <Plus :size="26" />
        </button>
      </div>
    </BottomSheet>
    <ImageViewer :src="viewing" @close="viewing = ''" />
  </div>
</template>
