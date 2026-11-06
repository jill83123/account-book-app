<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { saveMany } from '@/db'
import type { Rec } from '@/db/types'
import { useUi } from '@/stores/ui'
import RecordCard from './RecordCard.vue'

/**
 * `reorder`: the list is one day, so holding a row and dragging it up or down places it among the others.
 * Picking several records has its own button; holding only moves a row.
 */
const props = defineProps<{ records: Rec[]; showDate?: boolean; showLedger?: boolean; noSelect?: boolean; reorder?: boolean; flat?: boolean; dense?: boolean }>()
const ui = useUi()

/** what is shown; reordered live while a row is being carried */
// shallow, so the records stay plain objects that the database can store
const rows = shallowRef<Rec[]>([])
const drag = ref<{ id: string; dy: number } | null>(null)
watch(
  () => props.records,
  (l) => {
    if (!drag.value) rows.value = [...l]
  },
  { immediate: true },
)

// tap opens the record, or ticks it while picking; holding a row starts picking (or carrying it)
let timer = 0
let from = { x: 0, y: 0 }
let held = false
/** the row that has been held but not yet let go of or moved */
let ready = ''

function down(e: PointerEvent, id: string) {
  held = false
  // holding a row is for moving it, so only a day that can be reordered reacts
  if (ui.selecting || !props.reorder || rows.value.length < 2) return
  from = { x: e.clientX, y: e.clientY }
  pointerY = e.clientY
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    held = true
    navigator.vibrate?.(12)
    holdForCarry(id)
  }, 450)
}
function move(e: PointerEvent) {
  if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > 8) window.clearTimeout(timer)
}
function cancel() {
  window.clearTimeout(timer)
}
function tap(id: string) {
  if (held) {
    held = false
    return
  }
  if (ui.selecting && !props.noSelect) ui.toggleSelect(id)
  else ui.viewRecord(id)
}

// ---- carrying a row ------------------------------------------------------
const listEl = ref<HTMLElement>()
let pointerY = 0
let grabY = 0
let raf = 0
/** stops the page from scrolling under the finger once a row is held */
const stopScroll = (e: TouchEvent) => e.preventDefault()

function holdForCarry(id: string) {
  ready = id
  window.addEventListener('touchmove', stopScroll, { passive: false })
  window.addEventListener('pointermove', carryMove)
  window.addEventListener('pointerup', carryUp)
  window.addEventListener('pointercancel', carryUp)
}

function carryMove(e: PointerEvent) {
  pointerY = e.clientY
  // the row is picked up as soon as the finger moves
  if (ready && !drag.value && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 8) beginDrag(ready)
}

function beginDrag(id: string) {
  const row = listEl.value?.querySelector<HTMLElement>(`[data-id="${id}"]`)
  if (!row) return
  const r = row.getBoundingClientRect()
  grabY = from.y - (r.top + r.height / 2)
  drag.value = { id, dy: 0 }
  raf = requestAnimationFrame(frame)
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
    const dist = Math.abs(py - (t.offsetTop + t.offsetHeight / 2))
    if (dist < best) {
      best = dist
      target = i
    }
  })
  const fromIdx = rows.value.findIndex((c) => c.id === d.id)
  if (fromIdx >= 0 && target !== fromIdx) {
    const next = [...rows.value]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(target, 0, moved!)
    rows.value = next
  }
  const cur = items.find((t) => t.dataset.id === d.id)
  if (cur) {
    const r = cur.getBoundingClientRect()
    const centre = Math.min(box.bottom - r.height / 2, Math.max(box.top + r.height / 2, pointerY - grabY))
    const dy = Math.round(centre - (r.top + r.height / 2))
    if (dy !== d.dy) drag.value = { id: d.id, dy }
  }
  if (pointerY < 90) window.scrollBy(0, -10)
  else if (pointerY > window.innerHeight - 90) window.scrollBy(0, 10)
  raf = requestAnimationFrame(frame)
}

function stopCarry() {
  cancelAnimationFrame(raf)
  window.removeEventListener('touchmove', stopScroll)
  window.removeEventListener('pointermove', carryMove)
  window.removeEventListener('pointerup', carryUp)
  window.removeEventListener('pointercancel', carryUp)
}

async function carryUp() {
  stopCarry()
  ready = ''
  if (!drag.value) {
    // held and let go without moving: nothing happens (picking has its own button)
    return
  }
  drag.value = null
  // every row of the day gets its place, so the order stays as it was left
  const next = rows.value.map((r, i) => ({ ...r, pos: i }))
  const changed = next.filter((r, i) => props.records[i]?.id !== r.id || r.pos !== props.records.find((x) => x.id === r.id)?.pos)
  rows.value = next
  if (changed.length) await saveMany('records', changed)
}

onBeforeUnmount(() => {
  cancel()
  stopCarry()
})
</script>

<template>
  <div ref="listEl" class="relative" :class="!flat && 'card py-0'">
    <TransitionGroup name="rows" tag="div" class="divide-y divide-line">
      <button
        v-for="r in rows"
        :key="r.id"
        data-row
        :data-id="r.id"
        class="relative block w-full text-left select-none [-webkit-touch-callout:none]"
        :class="drag?.id === r.id && 'z-10'"
        @pointerdown="down($event, r.id)"
        @pointermove="move"
        @pointerup="cancel"
        @pointercancel="cancel"
        @pointerleave="cancel"
        @contextmenu.prevent
        @click="tap(r.id)"
      >
        <div
          class="transition-transform duration-150"
          :class="drag?.id === r.id ? '-mx-3 rounded-2xl bg-surface px-3 shadow-xl ring-2 ring-primary' : !flat && 'bg-surface'"
          :style="drag?.id === r.id ? { transform: `translateY(${drag.dy}px) scale(1)`, transition: 'none' } : undefined"
        >
          <RecordCard :rec="r" :show-date="showDate" :show-ledger="showLedger" :selecting="ui.selecting && !noSelect" :checked="ui.selectedIds.includes(r.id)" :dense="dense" />
        </div>
      </button>
    </TransitionGroup>
  </div>
</template>
