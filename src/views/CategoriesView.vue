<script setup lang="ts">
import { defaultBudget } from '@/lib/budget'
import { today, ym } from '@/lib/date'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronLeft, Eye, EyeOff, Pencil, Plus } from '@/lib/uiIcons'
import { remove, save, saveMany } from '@/db'
import type { Category, CategoryKind } from '@/db/types'
import { COLORS, ICON_GROUPS } from '@/lib/icons'
import { vDragScroll } from '@/lib/dragScroll'
import { uid } from '@/lib/id'
import { fmt } from '@/lib/money'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import BottomSheet from '@/components/BottomSheet.vue'
import CatIcon from '@/components/CatIcon.vue'
import PageHeader from '@/components/PageHeader.vue'
import PillTabs from '@/components/PillTabs.vue'
import SelectField from '@/components/SelectField.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'

const data = useData()
const ui = useUi()

const kind = ref<CategoryKind>('expense')
/** '' while looking at the top level, otherwise the category whose sub-categories are listed */
const level = ref('')
watch(kind, () => (level.value = ''))
const parent = computed(() => data.catMap.get(level.value))

const list = computed(() => data.childrenOf(level.value || null, kind.value, true))
const tops = computed(() => data.childrenOf(null, kind.value, true))
/** the row being carried while dragging, and how far it is drawn from its place */
const drag = ref<{ id: string; dy: number } | null>(null)
/** what is shown; it is reordered live while a row is being dragged */
const rows = ref<Category[]>([])
watch(
  list,
  (l) => {
    if (!drag.value) rows.value = [...l]
  },
  { immediate: true },
)

const kidCount = (id: string) => data.childrenOf(id, kind.value, true).length
function subText(c: Category) {
  const parts: string[] = []
  if (!c.parentId) parts.push(`${kidCount(c.id)} 個子分類`)
  if (c.budget) parts.push(`預算 $${fmt(c.budget)}`)
  if (c.hidden) parts.push('已隱藏')
  return parts.join('｜')
}

/** a top-level category opens its sub-categories; a sub-category is edited */
function openRow(c: Category) {
  // the click that ends a drag must not open the row
  if (Date.now() - lastDrag < 400) return
  if (!c.parentId) level.value = c.id
  else edit(c)
}

// ---- the edit form -------------------------------------------------------
const open = ref(false)
const editing = ref<Category | null>(null)
const name = ref('')
const icon = ref('tag')
const color = ref(COLORS[0]!)
const parentId = ref<string | null>(null)
const budget = ref('')
const pickingIcon = ref(false)

function edit(c?: Category, parent: string | null = null) {
  editing.value = c ?? null
  name.value = c?.name ?? ''
  const p = c ? c.parentId : parent
  parentId.value = p
  const base = p ? data.catMap.get(p) : undefined
  icon.value = c?.icon ?? base?.icon ?? 'tag'
  color.value = c?.color ?? base?.color ?? COLORS[tops.value.length % COLORS.length]!
  budget.value = c?.budget ? String(c.budget) : ''
  kidColor.value = false
  open.value = true
}

/** a big category whose sub-categories are not all in its color: offer to give them the same color */
const kidColor = ref(false)
const kidsDiffer = computed(
  () =>
    !!editing.value &&
    !editing.value.parentId &&
    data.childrenOf(editing.value.id, kind.value, true).some((k) => k.color !== color.value),
)

const iconBox = ref<HTMLElement>()
/** scroll the icon list to one of its sections */
function jumpTo(name: string) {
  const box = iconBox.value
  const sec = box?.querySelector<HTMLElement>(`[data-group="${name}"]`)
  if (box && sec) box.scrollTo({ top: sec.offsetTop - 6, behavior: 'smooth' })
}

// open on the chosen icon: scroll it to the middle of the list
watch(pickingIcon, async (o) => {
  if (!o) return
  await nextTick()
  const box = iconBox.value
  const cur = box?.querySelector<HTMLElement>('[aria-pressed="true"]')
  if (!box || !cur) return
  const b = box.getBoundingClientRect()
  const c = cur.getBoundingClientRect()
  box.scrollTop += c.top - b.top - (b.height - c.height) / 2
})

// the picker works on strings, so "no parent" is the empty string here
const parentSel = computed({
  get: () => parentId.value ?? '',
  set: (v: string) => (parentId.value = v || null),
})
const parentItems = computed(() => [
  { value: '', label: '無（這是大分類）' },
  ...tops.value
    .filter((x) => x.id !== editing.value?.id)
    .map((t) => ({ value: t.id, label: t.name })),
])

const hasKids = computed(() => (editing.value ? kidCount(editing.value.id) > 0 : false))

async function submit() {
  if (!name.value.trim()) return ui.toast('請輸入分類名稱', 'error')
  const siblings = data.childrenOf(parentId.value, kind.value, true)
  await save('categories', {
    ...editing.value,
    id: editing.value?.id ?? uid(),
    name: name.value.trim(),
    kind: kind.value,
    parentId: parentId.value,
    icon: icon.value,
    color: color.value,
    order: editing.value?.order ?? data.categories.length + siblings.length,
    ...defaultBudget(
      editing.value ?? undefined,
      Math.round(Number(budget.value)) || 0,
      ym(today()),
    ),
  })
  if (kidsDiffer.value && kidColor.value) {
    const kids = data.childrenOf(editing.value!.id, kind.value, true)
    await saveMany(
      'categories',
      kids.map((k) => ({ ...k, color: color.value })),
    )
  }
  open.value = false
}

// ---- hide, delete --------------------------------------------------------
async function toggleHidden(c: Category) {
  await save('categories', { ...c, hidden: c.hidden ? undefined : true })
}

async function destroy(c: Category) {
  const ids = new Set([c.id, ...data.childrenOf(c.id, kind.value, true).map((k) => k.id)])
  const used = data.records.some((r) => r.lines.some((l) => ids.has(l.categoryId)))
  if (used) return ui.toast('已有記錄使用這個分類，不能刪除；可以改成隱藏', 'error')
  if (!(await ui.confirm(`刪除分類${c.name}？`, { danger: true, confirmText: '刪除' }))) return
  for (const id of ids) await remove('categories', id)
  if (level.value === c.id) level.value = ''
  open.value = false
}

// ---- press and hold to reorder --------------------------------------------
const HOLD_MS = 420
let lastDrag = 0
let holdTimer = 0
let holdFrom = { x: 0, y: 0 }

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
function press(e: PointerEvent, id: string) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const row = (e.currentTarget as HTMLElement).closest('li')!
  holdFrom = { x: e.clientX, y: e.clientY }
  pointerY = e.clientY
  window.addEventListener('pointermove', watchHold)
  window.addEventListener('pointerup', cancelHold)
  window.addEventListener('pointercancel', cancelHold)
  holdTimer = window.setTimeout(() => {
    cancelHold()
    navigator.vibrate?.(12)
    startDrag(row, pointerY, id)
  }, HOLD_MS)
}
/** once dragging, the page must not scroll under the finger */
const stopScroll = (e: TouchEvent) => e.preventDefault()

// ---- drag to reorder -----------------------------------------------------
const listEl = ref<HTMLElement>()
let pointerY = 0
let grabY = 0
let raf = 0
let startOrders: number[] = []

function startDrag(row: HTMLElement, clientY: number, id: string) {
  const r = row.getBoundingClientRect()
  grabY = clientY - (r.top + r.height / 2)
  pointerY = clientY
  // the order numbers in use now; the rows get them again in their new sequence
  startOrders = rows.value.map((c) => c.order).sort((a, b) => a - b)
  drag.value = { id, dy: 0 }
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
  const from = rows.value.findIndex((c) => c.id === d.id)
  if (from >= 0 && target !== from) {
    const [moved] = rows.value.splice(from, 1)
    rows.value.splice(target, 0, moved!)
  }
  const cur = items.find((t) => t.dataset.id === d.id)
  if (cur) {
    const r = cur.getBoundingClientRect()
    const centre = Math.min(
      box.bottom - r.height / 2,
      Math.max(box.top + r.height / 2, pointerY - grabY),
    )
    const dy = Math.round(centre - (r.top + r.height / 2))
    if (dy !== d.dy) drag.value = { id: d.id, dy }
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
  const next = rows.value.map((c, i) => ({ ...c, order: startOrders[i]! }))
  const changed = next.filter((c, i) => c.order !== rows.value[i]!.order)
  rows.value = next
  if (changed.length) await saveMany('categories', changed)
}

onBeforeUnmount(() => {
  cancelHold()
  void endDrag()
})
</script>

<template>
  <div>
    <PageHeader :title="parent ? parent.name : '分類'" :hide-back="Boolean(parent)">
      <template #left>
        <button v-if="parent" class="circle-btn" aria-label="返回" @click="level = ''">
          <ChevronLeft :size="22" />
        </button>
      </template>
      <template #right>
        <button
          class="circle-btn"
          :aria-label="parent ? '新增子分類' : '新增分類'"
          @click="edit(undefined, level || null)"
        >
          <Plus :size="22" />
        </button>
      </template>
    </PageHeader>

    <PillTabs
      v-if="!parent"
      v-model="kind"
      class="mb-4"
      :options="[
        { value: 'expense', label: '支出' },
        { value: 'income', label: '收入' },
      ]"
    />

    <div ref="listEl" class="card relative p-0">
      <!-- rows only slide aside while one is being carried; switching to another list must not animate at all -->
      <TransitionGroup tag="ul" :name="drag ? 'rows' : 'still'" class="divide-y divide-line">
        <!-- the rows have their own background, so the first and last follow the card's rounded corners -->
        <li
          v-for="c in rows"
          :key="c.id"
          data-row
          :data-id="c.id"
          class="relative first:[&>div]:rounded-t-[20px] last:[&>div]:rounded-b-[20px]"
          :class="drag?.id === c.id && 'z-10'"
        >
          <div
            class="flex items-center gap-2 bg-surface p-3 transition-transform duration-150"
            :class="[c.hidden && 'opacity-55', drag?.id === c.id && 'rounded-2xl shadow-xl ring-2 ring-primary']"
            :style="
              drag?.id === c.id
                ? { transform: `translateY(${drag.dy}px) scale(1.02)`, transition: 'none' }
                : undefined
            "
          >
            <button
              class="flex min-w-0 flex-1 items-center gap-3 text-left select-none"
              @click="openRow(c)"
              @pointerdown="press($event, c.id)"
              @contextmenu.prevent
            >
              <CatIcon :icon="c.icon" :color="c.color" :size="44" />
              <span class="min-w-0">
                <span class="block truncate font-semibold">{{ c.name }}</span>
                <span v-if="subText(c)" class="block text-xs leading-snug text-muted">{{
                  subText(c)
                }}</span>
              </span>
            </button>
            <button
              class="icon-btn size-9 border-0 bg-transparent text-muted"
              aria-label="編輯"
              @click="edit(c)"
            >
              <Pencil :size="18" />
            </button>
            <button
              class="icon-btn size-9 border-0 bg-transparent text-muted"
              :aria-label="c.hidden ? '顯示這個分類' : '隱藏這個分類'"
              @click="toggleHidden(c)"
            >
              <EyeOff v-if="c.hidden" :size="18" />
              <Eye v-else :size="18" />
            </button>
          </div>
        </li>
      </TransitionGroup>
      <p v-if="!rows.length" class="py-10 text-center text-sm text-muted">
        還沒有分類，點右上角的 + 新增
      </p>
    </div>

    <ul class="mt-3 list-disc space-y-1 pl-6 pr-1 text-xs text-muted">
      <li>長按分類再上下拖，可以調整順序。</li>
      <li>隱藏的分類不會出現在記帳時的選單，舊記錄照樣保留。</li>
      <li>已經有記錄的分類不能刪除，請改用隱藏；要刪除請到編輯裡。</li>
    </ul>

    <BottomSheet
      v-model="open"
      :title="editing ? '編輯分類' : parentId ? '新增子分類' : '新增分類'"
    >
      <div class="space-y-4 pb-4">
        <!-- the icon and colour as they will look; tapping the icon opens the picker -->
        <div class="flex items-end gap-3">
          <button
            type="button"
            class="relative shrink-0 transition active:scale-95"
            aria-label="更換圖示"
            @click="pickingIcon = true"
          >
            <CatIcon :icon="icon" :color="color" :size="64" />
            <span
              class="absolute -right-2 -bottom-2 grid size-6.5 place-items-center rounded-full border border-muted/40 bg-surface text-muted"
            >
              <Pencil :size="14" :stroke-width="2.2" />
            </span>
          </button>
          <div class="min-w-0 flex-1">
            <label class="label">名稱</label>
            <input v-model="name" class="input" maxlength="16" />
          </div>
        </div>
        <div v-if="!hasKids">
          <label class="label">上層分類</label>
          <SelectField v-model="parentSel" title="上層分類" :items="parentItems" />
        </div>
        <div v-if="kind === 'expense'">
          <label class="label">預設每月預算（選填）</label>
          <input v-model="budget" class="input" inputmode="numeric" placeholder="0" />
          <p class="mt-1.5 px-1 text-xs text-muted">
            若想調整某個月，可到「統計 → 預算」修改。
          </p>
        </div>
        <div>
          <label class="label">顏色</label>
          <div class="grid grid-cols-[repeat(auto-fill,40px)] justify-between gap-x-3 gap-y-3.5">
            <button
              v-for="c in COLORS"
              :key="c"
              class="size-10 rounded-full ring-offset-2 ring-offset-bg transition"
              :class="color === c && 'ring-[3px] ring-primary'"
              :style="{ background: c }"
              :aria-label="c"
              @click="color = c"
            />
          </div>
          <div
            v-if="kidsDiffer"
            class="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-line/50 px-4 py-3"
          >
            <span class="text-sm">套用顏色到子分類</span>
            <ToggleSwitch v-model="kidColor" label="套用顏色到子分類" />
          </div>
        </div>
      </div>
      <template #footer>
        <div class="flex gap-2">
          <button v-if="editing" class="btn btn-ghost text-danger" @click="destroy(editing)">
            刪除
          </button>
          <button class="btn btn-primary flex-1" @click="submit">儲存</button>
        </div>
      </template>
    </BottomSheet>

    <!-- the icon picker, a centred dialog above the edit sheet -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="pickingIcon"
          class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
          @click.self="pickingIcon = false"
          @keydown.esc="pickingIcon = false"
        >
          <div class="card flex max-h-[80dvh] w-full max-w-sm flex-col gap-4 p-5 shadow-xl">
            <h2 class="text-lg leading-snug font-bold">選擇圖示</h2>
            <div v-drag-scroll class="scrollbar-none -mx-5 flex shrink-0 gap-1.5 overflow-x-auto px-5">
              <button
                v-for="g in ICON_GROUPS"
                :key="g.name"
                class="chip shrink-0 py-1 text-xs"
                @click="jumpTo(g.name)"
              >
                {{ g.name }}
              </button>
            </div>
            <div ref="iconBox" class="scrollbar-none relative -mx-1.5 min-h-0 flex-1 overflow-y-auto p-1.5">
              <section
                v-for="g in ICON_GROUPS"
                :key="g.name"
                :data-group="g.name"
                class="mb-3 last:mb-0"
              >
                <h3 class="mb-1.5 text-xs font-semibold text-muted">{{ g.name }}</h3>
                <!-- fixed size icons, as many per row as fit, spread edge to edge -->
                <div class="grid grid-cols-[repeat(auto-fill,36px)] justify-between gap-x-1.5 gap-y-2.5">
                  <button
                    v-for="k in g.keys"
                    :key="k"
                    class="grid place-items-center"
                    :aria-label="k"
                    :aria-pressed="icon === k"
                    @click="(icon = k), (pickingIcon = false)"
                  >
                    <CatIcon :icon="k" :color="color" :size="36" :ring="icon === k" />
                  </button>
                </div>
              </section>
            </div>
            <button type="button" class="btn btn-soft" @click="pickingIcon = false">取消</button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
