<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, Pencil, Plus, Star, Store, X } from '@/lib/uiIcons'
import { remove, save as save_, saveMany } from '@/db'
import type { Rec } from '@/db/types'
import { collectItemNames } from '@/lib/itemNames'
import { uid } from '@/lib/id'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import CatPath from '@/components/CatPath.vue'
import PageHeader from '@/components/PageHeader.vue'
import RecordList from '@/components/RecordList.vue'

const data = useData()
const ui = useUi()

const q = ref('')
/** 每個商家的品項數（記住的加上記錄裡用過的）和記錄筆數 */
const stats = computed(() => {
  const names = new Map<string, Set<string>>()
  const recs = new Map<string, number>()
  for (const m of data.merchants) names.set(m.id, new Set(m.items.map((i) => i.name)))
  for (const r of data.records) {
    if (!r.merchantId) continue
    recs.set(r.merchantId, (recs.get(r.merchantId) ?? 0) + 1)
    const set = names.get(r.merchantId)
    for (const l of r.lines) if (set && l.name.trim() && l.categoryId) set.add(l.name.trim())
  }
  return (id: string) => ({
    names: names.get(id) ?? new Set<string>(),
    items: names.get(id)?.size ?? 0,
    recs: recs.get(id) ?? 0,
  })
})

const list = computed(() => {
  const s = q.value.trim().toLowerCase()
  return [...data.merchants]
    .filter(
      (m) =>
        !s ||
        m.name.toLowerCase().includes(s) ||
        [...stats.value(m.id).names].some((n) => n.toLowerCase().includes(s)),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
})

/** 實際記錄裡每個商家各品項出現的筆數 */
const usage = computed(() => {
  const map = new Map<string, number>()
  for (const r of data.records) {
    if (!r.merchantId) continue
    for (const l of r.lines) {
      const name = l.name.trim()
      if (name) map.set(`${r.merchantId}|${name}`, (map.get(`${r.merchantId}|${name}`) ?? 0) + 1)
    }
  }
  return map
})
const used = (name: string) => usage.value.get(`${openId.value}|${name}`) ?? 0

const openId = ref('')
watch(openId, () => (edits.value = {}))
const current = computed(() => data.merchantMap.get(openId.value))

async function add() {
  const name = (
    await ui.prompt('新增商家', { placeholder: '商家名稱', confirmText: '新增' })
  )?.trim()
  if (!name) return
  if (data.merchants.some((x) => x.name === name)) return ui.toast('已經有同名的商家', 'error')
  const id = uid()
  await save_('merchants', { id, name, items: [] })
  openId.value = id
}

// ---- 品項下的細項，在視窗裡一次改名 ----------------------------------------------
/** 這個商家某個品項下用過的細項，用得多的在前 */
function detailsOf(itemName: string) {
  const id = openId.value
  const recs = data.records
    .filter((r) => r.merchantId === id)
    .map((r) => ({ ...r, lines: r.lines.filter((l) => l.name.trim() === itemName) }))
  return collectItemNames(recs, new Set(data.pinnedParts.map((p) => p.name)))
}

/** 正在改細項的品項，null 是沒開；空字串是沒有設定品項名稱的那些 */
const detailItem = ref<string | null>(null)
const detailOpen = computed({
  get: () => detailItem.value !== null,
  set: (v: boolean) => !v && (detailItem.value = null),
})
const detailRows = computed(() => (detailItem.value === null ? [] : detailsOf(detailItem.value)))
/** 品項名稱留空的記錄，細項也要能改 */
const unnamed = computed(() => detailsOf(''))
/** 品項名稱留空的有幾筆 */
const unnamedUsed = computed(() =>
  data.records
    .filter((r) => r.merchantId === openId.value)
    .reduce((n, r) => n + r.lines.filter((l) => !l.name.trim() && l.details?.length).length, 0),
)
const detailTitle = computed(() => (detailItem.value ? '編輯品項' : '未設定品名的細項'))
/** 改過的細項名稱，沒動過的不在裡面 */
const edits = ref<Record<string, string>>({})
/** 品名輸入框的內容 */
const itemName = ref('')
function openDetails(item: string) {
  edits.value = {}
  itemName.value = item
  detailItem.value = item
}
watch(openId, () => (detailItem.value = null))
const changes = computed(() => {
  const map = new Map<string, string>()
  for (const [from, v] of Object.entries(edits.value)) {
    const to = v.trim()
    if (to && to !== from) map.set(from, to)
  }
  return map
})
/** 品名改了嗎；沒有品名的那一列不能改 */
const nameChange = computed(() => {
  const to = itemName.value.trim()
  return detailItem.value && to && to !== detailItem.value ? to : ''
})
/** 改了幾項：品名加上細項 */
const changeCount = computed(() => changes.value.size + (nameChange.value ? 1 : 0))
/** 分期產生的品項名稱不能改 */
const nameLocked = computed(() =>
  data.records.some(
    (r) =>
      r.merchantId === openId.value &&
      r.lines.some((l) => l.name.trim() === detailItem.value && l.period),
  ),
)

/** 有重複的名稱就不存，回傳要提示的文字 */
function problem() {
  if (nameChange.value && rows.value.some((x) => x.name === nameChange.value))
    return `已經有同名的品項：${nameChange.value}`
  const seen = new Set<string>()
  for (const d of detailRows.value) {
    const name = changes.value.get(d.name) ?? d.name
    if (seen.has(name)) return `細項名稱重複：${name}`
    seen.add(name)
  }
  return ''
}

async function save() {
  const id = openId.value
  const item = detailItem.value ?? ''
  const msg = problem()
  if (msg) return ui.toast(msg, 'error')
  const to = nameChange.value
  const recs: Rec[] = []
  for (const r of data.records) {
    if (r.merchantId !== id) continue
    let hit = false
    const lines = r.lines.map((l) => {
      if (l.name.trim() !== item) return l
      const details = l.details?.map((d) => {
        const next = changes.value.get(d.name.trim())
        if (next) hit = true
        return next ? { ...d, name: next } : d
      })
      if (to) hit = true
      return { ...l, ...(details ? { details } : {}), ...(to ? { name: to } : {}) }
    })
    if (hit) recs.push({ ...r, lines })
  }
  const parts = [
    to ? `品名改成${to}` : '',
    changes.value.size ? `修改 ${changes.value.size} 個細項名稱` : '',
  ].filter(Boolean)
  const ok = await ui.confirm(`${parts.join('，')}？`, {
    message: `共會改到 ${recs.length} 筆記錄。\n只改這個商家，其他商家的同名品項不受影響。`,
    confirmText: '修改',
  })
  if (!ok) return
  await saveMany('records', recs)
  const m = current.value
  if (to && m?.items.some((i) => i.name === item)) {
    await save_('merchants', {
      ...m,
      items: m.items.map((i) => (i.name === item ? { ...i, name: to } : i)),
    })
  }
  ui.toast(`已更新 ${recs.length} 筆記錄`, 'success')
  detailItem.value = null
}

// ---- 這個商家的全部記錄 ---------------------------------------------------------
const merchantRecords = computed(() =>
  data.records
    .filter((r) => r.merchantId === openId.value)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0)),
)
const shown = ref(30)
watch(openId, () => (shown.value = 30))

const editing = ref(false)
const name = ref('')
function edit() {
  name.value = current.value?.name ?? ''
  editing.value = true
}
async function rename() {
  const m = current.value
  const next = name.value.trim()
  if (!m) return
  if (!next) return ui.toast('請輸入商家名稱', 'error')
  if (data.merchants.some((x) => x.id !== m.id && x.name === next))
    return ui.toast('已經有同名的商家', 'error')
  if (next !== m.name) await save_('merchants', { ...m, name: next })
  editing.value = false
}

/** 這個商家下所有用過的品項：記住的（有星星）排最上面，其餘是記錄裡出現過但沒記住的 */
const rows = computed(() => {
  const m = current.value
  if (!m) return []
  const map = new Map<
    string,
    { name: string; categoryId: string; price: number; lastUsed: string; starred: boolean }
  >()
  for (const i of m.items) map.set(i.name, { ...i, starred: !i.off })
  for (const r of data.records) {
    if (r.merchantId !== m.id) continue
    for (const l of r.lines) {
      const n = l.name.trim()
      if (!n || !l.categoryId) continue
      const cur = map.get(n)
      if (!cur)
        map.set(n, {
          name: n,
          categoryId: l.categoryId,
          price: l.amount,
          lastUsed: r.date,
          starred: false,
        })
      else if (!m.items.some((i) => i.name === n) && r.date >= cur.lastUsed)
        Object.assign(cur, { categoryId: l.categoryId, price: l.amount, lastUsed: r.date })
    }
  }
  return [...map.values()].sort(
    (a, b) => Number(b.starred) - Number(a.starred) || used(b.name) - used(a.name),
  )
})

async function toggleItem(itemName: string) {
  const m = current.value
  const row = rows.value.find((r) => r.name === itemName)
  if (!m || !row) return
  const star = !row.starred
  const has = m.items.some((i) => i.name === itemName)
  const items = has
    ? m.items.map((i) => (i.name === itemName ? { ...i, off: star ? undefined : true } : i))
    : [
        ...m.items,
        {
          name: itemName,
          categoryId: row.categoryId,
          price: row.price,
          count: used(itemName),
          lastUsed: row.lastUsed,
        },
      ]
  await save_('merchants', { ...m, items })
  ui.toast(
    star ? `已記住${itemName}，記帳時會提示` : `已取消記住${itemName}，記帳時不會再提示`,
    'success',
  )
}

/** 有記錄用到的商家不能刪除 */
const inUse = computed(() => data.records.some((r) => r.merchantId === openId.value))

async function destroy() {
  const m = current.value
  if (!m) return
  if (!(await ui.confirm(`刪除商家${m.name}？`, { danger: true, confirmText: '刪除' }))) return
  await remove('merchants', m.id)
  editing.value = false
  openId.value = ''
}
</script>

<template>
  <div>
    <PageHeader :title="current ? current.name : '商家與品項'" :hide-back="Boolean(current)">
      <template #left>
        <button v-if="current" class="circle-btn" aria-label="返回" @click="openId = ''">
          <ChevronLeft :size="22" />
        </button>
      </template>
      <template #right>
        <button v-if="!current" class="circle-btn" aria-label="新增商家" @click="add">
          <Plus :size="22" />
        </button>
        <button v-else class="circle-btn" aria-label="編輯商家" @click="edit">
          <Pencil :size="20" />
        </button>
      </template>
    </PageHeader>
    <template v-if="!current">
      <input v-model="q" class="input mb-3" placeholder="搜尋商家或品項" />
      <div v-if="list.length" class="card divide-y divide-line p-0">
        <button
          v-for="m in list"
          :key="m.id"
          class="flex w-full items-center gap-3 px-4 py-3.5 text-left"
          @click="openId = m.id"
        >
          <Store :size="20" class="text-muted" />
          <span class="min-w-0 flex-1">
            <span class="block font-medium">{{ m.name }}</span>
            <span class="block text-xs text-muted"
              >{{ stats(m.id).items }} 個品項｜{{ stats(m.id).recs }} 筆紀錄</span
            >
          </span>
          <ChevronRight :size="16" class="shrink-0 text-muted" />
        </button>
      </div>
      <p v-else class="card py-12 text-center text-sm text-muted">
        記帳時輸入商家名稱就會出現在這裡
      </p>
    </template>

    <template v-else>
      <h2 v-if="rows.length || unnamed.length" class="label !mb-0.5">
        {{ rows.length + (unnamed.length ? 1 : 0) }} 個品項
      </h2>
      <p v-if="rows.length || unnamed.length" class="mb-3 text-xs text-muted">
        點擊品項，可以修改品名和細項名稱
      </p>
      <ul v-if="rows.length || unnamed.length" class="card mb-4 divide-y divide-line p-0">
        <li v-for="i in rows" :key="i.name" class="px-4 py-3">
          <div class="flex cursor-pointer items-center gap-3" @click="openDetails(i.name)">
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs text-muted"><CatPath :id="i.categoryId" /></span>
              <span class="block truncate font-medium">{{ i.name }}</span>
            </span>
            <span class="shrink-0 text-xs text-muted">{{ used(i.name) }} 次</span>
            <button
              class="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 transition active:scale-95"
              :class="i.starred ? 'text-primary' : 'text-muted'"
              :aria-pressed="i.starred"
              :aria-label="i.starred ? `取消記住 ${i.name}` : `記住 ${i.name}`"
              @click.stop="toggleItem(i.name)"
            >
              <Star :size="18" :fill="i.starred ? 'currentColor' : 'none'" />
            </button>
          </div>
        </li>
        <li v-if="unnamed.length" class="px-4 py-3">
          <div class="flex min-h-10 cursor-pointer items-center gap-3" @click="openDetails('')">
            <span class="min-w-0 flex-1 truncate font-medium">未設定品名</span>
            <span class="shrink-0 text-xs text-muted">{{ unnamedUsed }} 次</span>
            <!-- 沒有品名就沒辦法記住，星星只是擺著 -->
            <button
              class="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted disabled:opacity-40"
              disabled
              aria-label="沒有品名，無法記住"
              @click.stop
            >
              <Star :size="18" fill="none" />
            </button>
          </div>
        </li>
      </ul>
      <p v-else class="card mb-4 py-12 text-center text-sm text-muted">這個商家還沒有品項</p>
      <template v-if="merchantRecords.length">
        <h2 class="label">{{ merchantRecords.length }} 筆記錄</h2>
        <RecordList :records="merchantRecords.slice(0, shown)" show-date />
        <button
          v-if="merchantRecords.length > shown"
          class="btn btn-soft mt-3 w-full"
          @click="shown += 30"
        >
          顯示更多
        </button>
      </template>
    </template>

    <!-- 改細項名稱：置中的視窗，細項多的時候在視窗內捲動 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="detailOpen"
          class="fixed inset-0 z-[55] flex items-center justify-center bg-black/30 p-4"
          @click.self="detailOpen = false"
        >
          <div class="card flex max-h-[85vh] w-full max-w-[26rem] flex-col gap-3 p-5 shadow-xl">
            <h3 class="shrink-0 truncate text-lg font-bold">{{ detailTitle }}</h3>
            <div v-if="detailItem" class="shrink-0">
              <label class="label" for="item-name">品名</label>
              <input
                id="item-name"
                v-model="itemName"
                class="input"
                :class="nameChange && 'ring-2 ring-primary'"
                :disabled="nameLocked"
              />
            </div>
            <div class="flex min-h-0 flex-1 flex-col">
              <label v-if="detailRows.length && detailItem" class="label shrink-0">細項</label>
              <div class="-mx-1 -my-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 py-1">
                <div v-for="d in detailRows" :key="d.name">
                  <div class="relative">
                    <input
                      class="input pr-14"
                      :class="changes.has(d.name) && 'ring-2 ring-primary'"
                      :value="edits[d.name] ?? d.name"
                      @input="edits[d.name] = ($event.target as HTMLInputElement).value"
                    />
                    <span
                      class="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xs text-muted"
                      >{{ d.count }} 筆</span
                    >
                  </div>
                </div>
              </div>
            </div>
            <div class="mt-2 grid shrink-0 grid-cols-2 gap-2">
              <button class="btn btn-soft" @click="detailOpen = false">取消</button>
              <button
                class="btn btn-primary"
                :disabled="!changes.size && !nameChange"
                @click="save"
              >
                儲存<template v-if="changeCount"> ({{ changeCount }})</template>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 編輯商家：只有一個欄位，用置中視窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="editing"
          class="fixed inset-0 z-[55] flex items-center justify-center bg-black/30 p-4"
          @click.self="editing = false"
        >
          <form class="card w-full max-w-[21rem] space-y-4 p-5 shadow-xl" @submit.prevent="rename">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-lg font-bold">編輯商家</h3>
              <button
                type="button"
                class="icon-btn -my-1.5 -mr-2 size-9 border-0 bg-transparent"
                aria-label="關閉"
                @click="editing = false"
              >
                <X :size="18" />
              </button>
            </div>
            <input v-model="name" class="input" aria-label="商家名稱" />
            <div class="flex gap-2">
              <button
                type="button"
                class="btn btn-ghost border-danger text-danger"
                :class="inUse && 'cursor-not-allowed opacity-40'"
                @click="inUse ? ui.toast('已有記錄使用這個商家，不能刪除', 'error') : destroy()"
              >
                刪除
              </button>
              <button type="submit" class="btn btn-primary flex-1">儲存</button>
            </div>
          </form>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
