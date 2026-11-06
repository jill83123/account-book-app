<script setup lang="ts">
import { computed, ref } from 'vue'
import { Store, Trash2 } from '@/lib/uiIcons'
import { remove, save } from '@/db'
import { fmt } from '@/lib/money'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import BottomSheet from '@/components/BottomSheet.vue'
import CatPath from '@/components/CatPath.vue'
import PageHeader from '@/components/PageHeader.vue'

const data = useData()
const ui = useUi()

const q = ref('')
const list = computed(() => {
  const s = q.value.trim().toLowerCase()
  return [...data.merchants]
    .filter((m) => !s || m.name.toLowerCase().includes(s) || m.items.some((i) => i.name.toLowerCase().includes(s)))
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
const open = computed({ get: () => Boolean(openId.value), set: (v: boolean) => !v && (openId.value = '') })
const current = computed(() => data.merchantMap.get(openId.value))

async function rename() {
  const m = current.value
  if (!m) return
  const name = await ui.prompt('商家名稱', { value: m.name })
  if (!name || name === m.name) return
  if (data.merchants.some((x) => x.id !== m.id && x.name === name)) return ui.toast('已經有同名的商家', 'error')
  await save('merchants', { ...m, name })
}

async function dropItem(name: string) {
  const m = current.value
  if (!m) return
  await save('merchants', { ...m, items: m.items.filter((i) => i.name !== name) })
}

async function destroy() {
  const m = current.value
  if (!m) return
  if (!(await ui.confirm(`刪除商家${m.name}？`, { message: '已記錄的帳目不會被刪除，只是不再顯示商家名稱。', danger: true, confirmText: '刪除' }))) return
  await remove('merchants', m.id)
  open.value = false
}

</script>

<template>
  <div>
    <PageHeader title="商家與品項" />
    <p class="mb-3 px-1 text-sm text-muted">
      每次記帳時選了商家，買過的品項會自動記住。下次選到同一個商家，輸入品項時就能直接點選。
    </p>
    <input v-model="q" class="input mb-3" placeholder="搜尋商家或品項" />
    <div v-if="list.length" class="card divide-y divide-line p-0">
      <button v-for="m in list" :key="m.id" class="flex w-full items-center gap-3 px-4 py-3.5 text-left" @click="openId = m.id">
        <Store :size="20" class="text-muted" />
        <span class="min-w-0 flex-1">
          <span class="block font-medium">{{ m.name }}</span>
          <span class="block truncate text-xs text-muted">{{ m.items.map((i) => i.name).join('、') || '還沒有品項' }}</span>
        </span>
        <span class="text-xs text-muted">{{ m.items.length }} 項</span>
      </button>
    </div>
    <p v-else class="card py-12 text-center text-sm text-muted">記帳時輸入商家名稱就會出現在這裡</p>

    <BottomSheet v-model="open" :title="current?.name ?? ''">
      <template v-if="current">
        <ul v-if="current.items.length" class="card mb-4 divide-y divide-line p-0">
          <li v-for="i in [...current.items].sort((a, b) => used(b.name) - used(a.name))" :key="i.name" class="flex items-center gap-3 px-4 py-3">
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs text-muted"><CatPath :id="i.categoryId" /></span>
              <span class="block truncate font-medium">{{ i.name }}</span>
            </span>
            <span class="shrink-0 text-right">
              <span class="block text-sm">${{ fmt(i.price) }}</span>
              <span class="block text-xs text-muted">{{ used(i.name) }} 次</span>
            </span>
            <button class="icon-btn size-9 text-muted" :aria-label="`移除 ${i.name}`" @click="dropItem(i.name)"><Trash2 :size="16" /></button>
          </li>
        </ul>
        <div class="mt-6 flex gap-2">
          <button class="btn btn-ghost text-danger" @click="destroy">刪除商家</button>
          <button class="btn btn-primary flex-1" @click="rename">重新命名</button>
        </div>
      </template>
    </BottomSheet>
  </div>
</template>
