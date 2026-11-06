<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { remove, save } from '@/db'
import { BASE_CURRENCY } from '@/lib/currency'
import {
  saveCurrencyOrder,
  setCurrencyShown,
  useCurrencyEntries,
  type CurrencyEntry,
} from '@/lib/customCurrency'
import { uid } from '@/lib/id'
import { Eye, EyeOff, Pencil, Plus, Trash2 } from '@/lib/uiIcons'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import PageHeader from '@/components/PageHeader.vue'

const data = useData()
const ui = useUi()
const entries = useCurrencyEntries()

const chosen = computed(() => entries.value.filter((c) => c.shown))

/** the row being carried while dragging, and how far it is drawn from its place */
const drag = ref<{ code: string; dy: number } | null>(null)
let lastDrag = 0

/** what is shown; it is reordered live while a row is being dragged */
const rows = ref<CurrencyEntry[]>([])
/** the currencies that are not shown, under the shown ones */
const others = computed(() => entries.value.filter((c) => !c.shown))

watch(
  chosen,
  (l) => {
    if (!drag.value) rows.value = [...l]
  },
  { immediate: true },
)

// ---- adding and editing: a small centred dialog ----
const open = ref(false)
/** the added currency being edited; its code stays, since accounts and records point at it */
const editing = ref<CurrencyEntry | null>(null)
const code = ref('')
const name = ref('')

function openAdd() {
  editing.value = null
  code.value = ''
  name.value = ''
  open.value = true
}

function openEdit(c: CurrencyEntry) {
  if (c.builtin) return
  editing.value = c
  code.value = c.code
  name.value = c.name
  open.value = true
}

async function submit() {
  const n = name.value.trim()
  if (!n) return ui.toast('請輸入幣別名稱', 'error')
  const c = editing.value
  if (c) {
    const row = data.currencies.find((r) => r.id === c.rowId)
    if (row) await save('currencies', { ...row, name: n })
    open.value = false
    return
  }
  const k = code.value.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(k)) return ui.toast('代碼請輸入 3 個英文字母，例如 VND', 'error')
  if (entries.value.some((x) => x.code === k)) return ui.toast('這個代碼已經有了', 'error')
  await save('currencies', { id: uid(), code: k, name: n })
  open.value = false
}

async function destroy(c: CurrencyEntry) {
  const used =
    data.accounts.some((a) => a.currency === c.code) ||
    data.ledgers.some((l) => l.currency === c.code) ||
    data.records.some((r) => r.currency === c.code)
  if (used) return ui.toast(`${c.name}已經有帳戶或記錄在使用，不能刪除`, 'error')
  if (!(await ui.confirm(`刪除${c.name}？`, { danger: true, confirmText: '刪除' }))) return
  if (c.rowId) await remove('currencies', c.rowId)
}

// ---- press and hold to reorder (the shown ones only) --------------------
const HOLD_MS = 420
let holdTimer = 0
let holdFrom = { x: 0, y: 0 }
const listEl = ref<HTMLElement>()
let pointerY = 0
let grabY = 0
let raf = 0

function cancelHold() {
  window.clearTimeout(holdTimer)
  window.removeEventListener('pointermove', watchHold)
  window.removeEventListener('pointerup', cancelHold)
  window.removeEventListener('pointercancel', cancelHold)
}
function watchHold(e: PointerEvent) {
  // moving before the hold is up means the finger is scrolling or swiping
  if (Math.hypot(e.clientX - holdFrom.x, e.clientY - holdFrom.y) > 8) cancelHold()
}
function press(e: PointerEvent, c: CurrencyEntry) {
  if (rows.value.length < 2) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  // the eye and the bin are their own buttons
  if ((e.target as HTMLElement).closest('[data-nodrag]')) return
  const row = (e.currentTarget as HTMLElement).closest('li')!
  holdFrom = { x: e.clientX, y: e.clientY }
  pointerY = e.clientY
  window.addEventListener('pointermove', watchHold)
  window.addEventListener('pointerup', cancelHold)
  window.addEventListener('pointercancel', cancelHold)
  holdTimer = window.setTimeout(() => {
    cancelHold()
    navigator.vibrate?.(12)
    startDrag(row, pointerY, c.code)
  }, HOLD_MS)
}

/** once dragging, the page must not scroll under the finger */
const stopScroll = (e: TouchEvent) => e.preventDefault()

function startDrag(row: HTMLElement, clientY: number, id: string) {
  const r = row.getBoundingClientRect()
  grabY = clientY - (r.top + r.height / 2)
  pointerY = clientY
  drag.value = { code: id, dy: 0 }
  window.addEventListener('touchmove', stopScroll, { passive: false })
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
  raf = requestAnimationFrame(frame)
}

function onMove(e: PointerEvent) {
  pointerY = e.clientY
}

/** every frame: swap rows when the finger crosses one, and keep the carried row under the finger */
function frame() {
  const el = listEl.value
  const d = drag.value
  if (!el || !d) return
  const box = el.getBoundingClientRect()
  const items = [...el.querySelectorAll<HTMLElement>('[data-row]')]
  const py = pointerY - box.top
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
  const from = rows.value.findIndex((c) => c.code === d.code)
  if (from >= 0 && target !== from) {
    const [moved] = rows.value.splice(from, 1)
    rows.value.splice(target, 0, moved!)
  }
  const cur = items.find((t) => t.dataset.code === d.code)
  if (cur) {
    const r = cur.getBoundingClientRect()
    const centre = Math.min(
      box.bottom - r.height / 2,
      Math.max(box.top + r.height / 2, pointerY - grabY),
    )
    const dy = Math.round(centre - (r.top + r.height / 2))
    if (dy !== d.dy) drag.value = { code: d.code, dy }
  }
  // near the top or bottom of the screen, the page follows
  if (pointerY < 90) window.scrollBy(0, -10)
  else if (pointerY > window.innerHeight - 90) window.scrollBy(0, 10)
  raf = requestAnimationFrame(frame)
}

async function endDrag() {
  cancelAnimationFrame(raf)
  window.removeEventListener('touchmove', stopScroll)
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
  if (!drag.value) return
  lastDrag = Date.now()
  drag.value = null
  const changed = rows.value.some((c, i) => c.code !== chosen.value[i]?.code)
  if (changed) await saveCurrencyOrder(rows.value)
}

onBeforeUnmount(() => {
  cancelHold()
  void endDrag()
})
</script>

<template>
  <div>
    <PageHeader title="幣別">
      <template #right>
        <button class="circle-btn" aria-label="新增幣別" @click="openAdd">
          <Plus :size="22" />
        </button>
      </template>
    </PageHeader>

    <section class="mb-5">
      <h2 class="section-title">已選擇</h2>
      <div ref="listEl" class="card relative p-0">
        <ul class="divide-y divide-line">
          <li
            v-for="c in rows"
            :key="c.code"
            data-row
            :data-code="c.code"
            class="relative"
            :class="drag?.code === c.code && 'z-10'"
          >
            <div
              class="flex items-center gap-2 py-3 pr-[7px] pl-4 select-none"
              :class="
                drag?.code === c.code
                  ? 'rounded-2xl bg-surface shadow-xl ring-2 ring-primary'
                  : ''
              "
              :style="drag?.code === c.code ? { transform: `translateY(${drag.dy}px)` } : undefined"
              @pointerdown="press($event, c)"
              @contextmenu.prevent
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ c.name }}</span>
                <span class="block text-xs text-muted">{{ c.code }}</span>
              </span>
              <button
                v-if="!c.builtin && !c.shown"
                data-nodrag
                class="icon-btn size-9 border-0 bg-transparent text-danger"
                :aria-label="`刪除${c.name}`"
                @click="destroy(c)"
              >
                <Trash2 :size="18" />
              </button>
              <button
                v-if="!c.builtin"
                data-nodrag
                class="icon-btn size-9 border-0 bg-transparent text-muted"
                :aria-label="`編輯${c.name}`"
                @click="openEdit(c)"
              >
                <Pencil :size="18" />
              </button>
              <button
                data-nodrag
                class="icon-btn size-9 border-0 bg-transparent text-muted disabled:opacity-40"
                :aria-label="c.shown ? `隱藏${c.name}` : `顯示${c.name}`"
                :disabled="c.code === BASE_CURRENCY"
                @click="setCurrencyShown(c, !c.shown)"
              >
                <Eye v-if="c.shown" :size="18" />
                <EyeOff v-else :size="18" />
              </button>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <section v-if="others.length">
      <h2 class="section-title">未選擇</h2>
      <ul class="card divide-y divide-line p-0">
        <li v-for="c in others" :key="c.code" class="flex items-center gap-2 py-3 pr-[7px] pl-4">
          <span class="min-w-0 flex-1 opacity-50">
            <span class="block truncate font-medium">{{ c.name }}</span>
            <span class="block text-xs text-muted">{{ c.code }}</span>
          </span>
          <button
            v-if="!c.builtin && !c.shown"
            data-nodrag
            class="icon-btn size-9 border-0 bg-transparent text-danger"
            :aria-label="`刪除${c.name}`"
            @click="destroy(c)"
          >
            <Trash2 :size="18" />
          </button>
          <button
            v-if="!c.builtin"
            data-nodrag
            class="icon-btn size-9 border-0 bg-transparent text-muted"
            :aria-label="`編輯${c.name}`"
            @click="openEdit(c)"
          >
            <Pencil :size="18" />
          </button>
          <button
            data-nodrag
            class="icon-btn size-9 border-0 bg-transparent text-muted disabled:opacity-40"
            :aria-label="c.shown ? `隱藏${c.name}` : `顯示${c.name}`"
            :disabled="c.code === BASE_CURRENCY"
            @click="setCurrencyShown(c, !c.shown)"
          >
            <Eye v-if="c.shown" :size="18" />
            <EyeOff v-else :size="18" />
          </button>
        </li>
      </ul>
    </section>

    <!-- a centred dialog for a new or edited currency, like the other small ones -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="open"
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          @click.self="open = false"
          @keydown.esc="open = false"
        >
          <form class="card w-full max-w-[21rem] space-y-5 p-5 shadow-xl" @submit.prevent="submit">
            <h2 class="text-lg leading-snug font-bold">{{ editing ? '編輯幣別' : '新增幣別' }}</h2>
            <div class="space-y-3">
              <input
                v-model="code"
                class="input uppercase disabled:opacity-60"
                maxlength="3"
                :disabled="Boolean(editing)"
                placeholder="代碼，3 個英文字母，例如：VND"
                aria-label="幣別代碼"
              />
              <input
                v-model="name"
                class="input"
                maxlength="10"
                placeholder="名稱，例如：越南盾"
                aria-label="幣別名稱"
              />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <button type="button" class="btn btn-soft" @click="open = false">取消</button>
              <button
                type="submit"
                class="btn btn-primary"
                :disabled="!code.trim() || !name.trim()"
              >
                {{ editing ? '儲存' : '新增' }}
              </button>
            </div>
          </form>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
