<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Minus, Plus, X } from '@/lib/uiIcons'

/**
 * A photo shown on its own over a dark backdrop, the way a gallery does. Mouse wheel, pinch, the buttons or a
 * double tap zoom it; a zoomed photo is dragged around. Tap the backdrop, the close button or press Esc to leave.
 */
const props = defineProps<{ src: string }>()
const emit = defineEmits<{ close: [] }>()

const MIN = 1
const MAX = 6

const stage = ref<HTMLElement>()
const img = ref<HTMLImageElement>()
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
/** true while a finger or the mouse is moving the photo: the transform then follows without easing */
const gesturing = ref(false)

function reset() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}

/** how far the photo may be dragged: it can leave the screen only as far as its own edge reaches the screen's */
function clamp() {
  const s = stage.value
  const i = img.value
  if (!s || !i) return
  const maxX = Math.max(0, (i.offsetWidth * scale.value - s.clientWidth) / 2)
  const maxY = Math.max(0, (i.offsetHeight * scale.value - s.clientHeight) / 2)
  tx.value = Math.min(maxX, Math.max(-maxX, tx.value))
  ty.value = Math.min(maxY, Math.max(-maxY, ty.value))
}

/** zoom to `next`, keeping the point under (cx, cy) where it is */
function zoomAt(next: number, cx?: number, cy?: number) {
  const s = stage.value
  if (!s) return
  const to = Math.min(MAX, Math.max(MIN, next))
  const box = s.getBoundingClientRect()
  // the photo sits in the middle of the stage, so offsets are measured from there
  const px = (cx ?? box.left + box.width / 2) - (box.left + box.width / 2)
  const py = (cy ?? box.top + box.height / 2) - (box.top + box.height / 2)
  const k = to / scale.value
  tx.value = px - (px - tx.value) * k
  ty.value = py - (py - ty.value) * k
  scale.value = to
  if (to === MIN) {
    tx.value = 0
    ty.value = 0
  }
  clamp()
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  gesturing.value = true
  zoomAt(scale.value * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY)
  window.clearTimeout(wheelTimer)
  wheelTimer = window.setTimeout(() => (gesturing.value = false), 120)
}
let wheelTimer = 0

// ---- dragging and pinching ------------------------------------------------
const pointers = new Map<number, { x: number; y: number }>()
let pinchFrom = { dist: 0, scale: 1 }
let moved = false
let lastTap = 0

function dist() {
  const [a, b] = [...pointers.values()]
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
}

function onDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  // no pointer capture: the stage fills the screen, and capturing would turn a click on the photo into one on the backdrop
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  moved = false
  gesturing.value = true
  if (pointers.size === 2) pinchFrom = { dist: dist(), scale: scale.value }
}

function onMove(e: PointerEvent) {
  const p = pointers.get(e.pointerId)
  if (!p) return
  const dx = e.clientX - p.x
  const dy = e.clientY - p.y
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (Math.abs(dx) + Math.abs(dy) > 0) moved = moved || Math.hypot(dx, dy) > 1.5
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    if (pinchFrom.dist)
      zoomAt(pinchFrom.scale * (dist() / pinchFrom.dist), (a!.x + b!.x) / 2, (a!.y + b!.y) / 2)
  } else if (scale.value > 1) {
    tx.value += dx
    ty.value += dy
    clamp()
  }
}

function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  if (pointers.size === 1) {
    // one finger of a pinch is still down: carry on dragging from where it is
    pinchFrom = { dist: 0, scale: scale.value }
  }
  if (!pointers.size) gesturing.value = false
}

/** a second tap or click soon after the first: zoom in there, or back out if already zoomed */
function onPhotoClick(e: MouseEvent) {
  if (moved) return
  const now = Date.now()
  if (now - lastTap < 300) {
    lastTap = 0
    zoomAt(scale.value > 1.01 ? 1 : 2.5, e.clientX, e.clientY)
  } else lastTap = now
}

/** only the bare backdrop closes; a drag that happened to end on it does not */
function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget && !moved) emit('close')
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
  else if (e.key === '+' || e.key === '=') zoomAt(scale.value * 1.4)
  else if (e.key === '-') zoomAt(scale.value / 1.4)
  else if (e.key === '0') reset()
}
watch(
  () => props.src,
  (s) => {
    reset()
    if (s) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.clearTimeout(wheelTimer)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="src"
        ref="stage"
        class="fixed inset-0 z-50 flex touch-none items-center justify-center overflow-hidden bg-black/85 p-6 select-none sm:p-14"
        role="dialog"
        aria-modal="true"
        aria-label="圖片"
        @click="onBackdrop"
        @wheel="onWheel"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      >
        <img
          ref="img"
          :src="src"
          alt=""
          draggable="false"
          class="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          :class="[
            scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
            !gesturing && 'transition-transform duration-150',
          ]"
          :style="{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }"
          @click="onPhotoClick"
        />
        <button
          class="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 grid size-10 place-items-center rounded-full bg-neutral-800/90 text-white transition hover:bg-neutral-700"
          aria-label="關閉"
          @click.stop="emit('close')"
          @pointerdown.stop
        >
          <X :size="20" />
        </button>
        <div
          class="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-neutral-800/90 p-1 text-white"
          @click.stop
          @pointerdown.stop
        >
          <button
            class="grid size-9 place-items-center rounded-full transition hover:bg-neutral-700 disabled:opacity-40"
            aria-label="縮小"
            :disabled="scale <= MIN"
            @click="zoomAt(scale / 1.5)"
          >
            <Minus :size="18" />
          </button>
          <button
            class="min-w-12 rounded-full px-1 text-center text-xs font-medium tabular-nums transition hover:bg-neutral-700"
            aria-label="還原大小"
            title="還原大小"
            @click="reset"
          >
            {{ Math.round(scale * 100) }}%
          </button>
          <button
            class="grid size-9 place-items-center rounded-full transition hover:bg-neutral-700 disabled:opacity-40"
            aria-label="放大"
            :disabled="scale >= MAX"
            @click="zoomAt(scale * 1.5)"
          >
            <Plus :size="18" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
