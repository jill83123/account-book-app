<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Pencil, Plus, Store, X } from '@/lib/uiIcons'
import { save } from '@/db'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import BottomSheet from './BottomSheet.vue'

const open = defineModel<boolean>('open', { required: true })
/** merchant id, or '' for none */
const model = defineModel<string>({ required: true })
/** a name typed for a merchant that does not exist yet */
const newName = defineModel<string>('newName', { default: '' })
const data = useData()
const ui = useUi()
const q = ref('')

// a name typed earlier comes back in the box, so a typo can be fixed right here
watch(open, (o) => {
  if (o) q.value = newName.value
})

async function rename(id: string) {
  const m = data.merchantMap.get(id)
  if (!m) return
  const name = (await ui.prompt('商家名稱', { value: m.name }))?.trim()
  if (!name || name === m.name) return
  if (data.merchants.some((x) => x.id !== m.id && x.name === name)) return ui.toast('已經有同名的商家', 'error')
  await save('merchants', { ...m, name })
}

const list = computed(() => {
  const s = q.value.trim().toLowerCase()
  return [...data.merchants]
    .filter((m) => !s || m.name.toLowerCase().includes(s))
    .sort((a, b) => b.items.reduce((n, i) => n + i.count, 0) - a.items.reduce((n, i) => n + i.count, 0))
})
const canCreate = computed(() => {
  const s = q.value.trim()
  return s && !data.merchants.some((m) => m.name === s)
})

function pick(id: string) {
  model.value = id
  newName.value = ''
  open.value = false
}
function create() {
  model.value = ''
  newName.value = q.value.trim()
  open.value = false
}
function clear() {
  model.value = ''
  newName.value = ''
  open.value = false
}
</script>

<template>
  <BottomSheet v-model="open" title="商家">
    <input v-model="q" class="input mb-3" placeholder="搜尋或輸入新商家名稱" />
    <button
      v-if="canCreate"
      class="card mb-3 flex w-full items-center gap-3 text-left"
      @click="create"
    >
      <Plus :size="20" class="text-primary" />
      <span>新增商家{{ q.trim() }}</span>
    </button>
    <ul v-if="list.length" class="card divide-y divide-line p-0">
      <li v-for="m in list" :key="m.id" class="flex items-center gap-2 pr-3">
        <button class="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left" @click="pick(m.id)">
          <Store :size="20" class="shrink-0 text-muted" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium" :class="m.id === model && 'text-primary'">{{ m.name }}</span>
            <span class="block text-xs text-muted">{{ m.items.length }} 個品項</span>
          </span>
        </button>
        <button class="icon-btn size-9 shrink-0 border-0 bg-transparent text-muted" :aria-label="`重新命名 ${m.name}`" @click="rename(m.id)">
          <Pencil :size="18" />
        </button>
      </li>
    </ul>
    <p v-else-if="!canCreate" class="py-6 text-center text-sm text-muted">
      還沒有商家，輸入名稱就能新增，下次會自動記住。
    </p>
    <button v-if="model || newName" class="btn btn-ghost mt-3 w-full" @click="clear">
      <X :size="16" />不指定商家
    </button>
  </BottomSheet>
</template>
