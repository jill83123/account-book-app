<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { BookMarked, ChevronRight, Pencil, Store, Tag, Trash2, X } from '@/lib/uiIcons'
import { remove, save, saveMany } from '@/db'
import type { Merchant, Rec } from '@/db/types'
import { forgetPhotos } from '@/lib/images'
import { uid } from '@/lib/id'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import BottomSheet from './BottomSheet.vue'
import PickSheet from './PickSheet.vue'
import CategoryPickerSheet from './CategoryPickerSheet.vue'
import MerchantPickerSheet from './MerchantPickerSheet.vue'

const ui = useUi()
const data = useData()
const route = useRoute()

const chosen = computed(() => data.records.filter((r) => ui.selectedIds.includes(r.id)))
/** transfers have neither a category nor a merchant */
const editable = computed(() => chosen.value.filter((r) => r.type !== 'transfer'))

// leaving the page ends picking
watch(() => route.path, () => ui.stopSelect())

async function apply(change: (r: Rec) => Rec, what: string) {
  const before = editable.value
  if (!before.length) return ui.toast('轉帳沒有分類或商家可以改', 'info')
  await saveMany('records', before.map(change))
  const skipped = chosen.value.length - before.length
  ui.toast(`${what} ${before.length} 筆${skipped ? `（略過 ${skipped} 筆轉帳）` : ''}`, 'success', {
    label: '復原',
    run: () => void saveMany('records', before),
  })
  ui.stopSelect()
}

// ---- what to change
const actionSheet = ref(false)
const actions = [
  { label: '分類', sub: '改成同一個分類', icon: Tag, run: () => askCategory() },
  { label: '商家', sub: '改成同一個商家', icon: Store, run: () => askMerchant() },
  { label: '帳本', sub: '搬到另一個帳本', icon: BookMarked, run: () => askLedger() },
]
function choose(run: () => void) {
  actionSheet.value = false
  run()
}

// ---- category
const categorySheet = ref(false)
const pickedCategory = ref('')
const kind = computed(() => (editable.value.some((r) => r.type === 'income') ? 'income' : 'expense'))

function askCategory() {
  if (!editable.value.length) return ui.toast('轉帳沒有分類可以改', 'info')
  if (new Set(editable.value.map((r) => r.type)).size > 1) return ui.toast('收入和支出的分類不同，請分開選取', 'info')
  pickedCategory.value = ''
  categorySheet.value = true
}

watch(pickedCategory, async (id) => {
  if (!id) return
  // records with several items have every item changed, so ask first
  const multi = editable.value.some((r) => r.lines.length > 1)
  if (multi && !(await ui.confirm('有多品項的記錄', { message: '這些多品項記錄裡的每個品項，都會改成這個分類。', confirmText: '全部改' }))) {
    pickedCategory.value = ''
    return
  }
  await apply((r) => ({ ...r, lines: r.lines.map((l) => ({ ...l, categoryId: id })) }), `分類已改，共`)
  pickedCategory.value = ''
})

// ---- merchant
const merchantSheet = ref(false)
const pickedMerchant = ref('')
const newMerchant = ref('')

function askMerchant() {
  if (!editable.value.length) return ui.toast('轉帳沒有商家可以改', 'info')
  pickedMerchant.value = ''
  newMerchant.value = ''
  merchantSheet.value = true
}

watch([pickedMerchant, newMerchant], async ([id, name]) => {
  if (!id && !name) return
  let target = id
  if (!target) {
    const m: Merchant = { id: uid(), name, items: [], updatedAt: 0 }
    await save('merchants', m)
    target = m.id
  }
  await apply((r) => ({ ...r, merchantId: target }), '商家已改，共')
  pickedMerchant.value = ''
  newMerchant.value = ''
})

// ---- ledger
const ledgerSheet = ref(false)
const pickedLedger = ref('')
const ledgerItems = computed(() => data.sortedLedgers.map((l) => ({ value: l.id, label: l.name, icon: 'book', color: l.color })))

function askLedger() {
  if (!editable.value.length) return ui.toast('轉帳沒有帳本可以改', 'info')
  pickedLedger.value = ''
  ledgerSheet.value = true
}

watch(pickedLedger, async (id) => {
  if (!id) return
  await apply((r) => ({ ...r, ledgerId: id }), '帳本已改，共')
  pickedLedger.value = ''
})

// ---- delete
async function destroy() {
  const n = chosen.value.length
  if (!n) return
  if (!(await ui.confirm(`刪除這 ${n} 筆記錄？`, { danger: true, confirmText: '刪除' }))) return
  for (const r of chosen.value) {
    await remove('records', r.id)
    await forgetPhotos(r.id)
  }
  ui.toast(`已刪除 ${n} 筆`, 'info')
  ui.stopSelect()
}
</script>

<template>
  <div
    v-if="ui.selecting"
    class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
  >
    <div class="mx-auto flex max-w-xl items-center gap-2">
      <button class="icon-btn size-10 shrink-0" aria-label="結束選取" @click="ui.stopSelect()"><X :size="20" /></button>
      <p class="min-w-0 flex-1 text-sm font-semibold">已選 {{ ui.selectedIds.length }} 筆</p>
      <button class="btn btn-primary btn-sm" :disabled="!ui.selectedIds.length" @click="actionSheet = true"><Pencil :size="16" />編輯</button>
      <button class="icon-btn size-10 shrink-0 text-danger" aria-label="刪除" :disabled="!ui.selectedIds.length" @click="destroy">
        <Trash2 :size="19" />
      </button>
    </div>
  </div>

  <BottomSheet v-model="actionSheet" :title="`編輯 ${ui.selectedIds.length} 筆記錄`">
    <ul class="card divide-y divide-line p-0">
      <li v-for="a in actions" :key="a.label">
        <button class="flex w-full items-center gap-3 px-4 py-3.5 text-left" @click="choose(a.run)">
          <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><component :is="a.icon" :size="18" /></span>
          <span class="min-w-0 flex-1">
            <span class="block font-medium">{{ a.label }}</span>
            <span class="block text-xs text-muted">{{ a.sub }}</span>
          </span>
          <ChevronRight :size="18" class="text-muted" />
        </button>
      </li>
    </ul>
  </BottomSheet>

  <CategoryPickerSheet v-model:open="categorySheet" v-model="pickedCategory" :kind="kind" />
  <PickSheet v-model:open="ledgerSheet" v-model="pickedLedger" title="改成哪個帳本" :items="ledgerItems" />
  <MerchantPickerSheet v-model:open="merchantSheet" v-model="pickedMerchant" v-model:new-name="newMerchant" />
</template>
