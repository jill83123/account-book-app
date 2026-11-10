<script setup lang="ts">
import { ref } from 'vue'
import { Plus, X } from '@/lib/uiIcons'
import { useMembers } from '@/stores/members'
import { useUi } from '@/stores/ui'
import PageHeader from '@/components/PageHeader.vue'

const members = useMembers()
const ui = useUi()

const adding = ref(false)
const typed = ref('')
function openAdd() {
  typed.value = ''
  adding.value = true
}
async function add() {
  const name = typed.value.trim()
  if (!name) return
  if (members.taken(name)) return ui.toast(members.takenHint(name), 'error')
  await members.add(name)
  adding.value = false
}

// rename or delete
/** the id of the member being edited */
const editing = ref('')
const name = ref('')
const open = ref(false)
function edit(id: string, current: string) {
  editing.value = id
  name.value = current
  open.value = true
}
async function rename() {
  if (members.taken(name.value, editing.value)) return ui.toast(members.takenHint(name.value), 'error')
  if (!(await members.rename(editing.value, name.value))) return ui.toast('名字是空的', 'error')
  open.value = false
}
async function destroy() {
  const id = editing.value
  const label = members.nameOf(id)
  if (members.hasLoans(id)) return ui.toast(`${label}還有借款記錄，不能刪除`, 'error')
  const n = members.usage.get(id) ?? 0
  const text = n ? `${n} 筆記錄上的${label}也會一併移除，記錄本身會保留。` : undefined
  if (!(await ui.confirm(`刪除成員${label}？`, { danger: true, confirmText: '刪除', ...(text ? { message: text } : {}) }))) return
  await members.remove(id)
  open.value = false
}
</script>

<template>
  <div>
    <PageHeader title="成員">
      <template #right>
        <button class="circle-btn" aria-label="新增成員" @click="openAdd"><Plus :size="22" /></button>
      </template>
    </PageHeader>

    <p class="mb-3 px-1 text-sm text-muted">新增常一起花錢的人，記帳時就能用「和誰一起」欄位選他們。</p>

    <div v-if="members.list.length" class="card divide-y divide-line p-0">
      <button v-for="m in members.list" :key="m.id" class="flex w-full items-center gap-3 px-4 py-3.5 text-left" @click="edit(m.id, m.name)">
        <span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-base font-semibold text-primary-strong">
          {{ m.name.slice(0, 1) }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium">{{ members.nameOf(m.id) }}</span>
          <span class="block text-xs text-muted">{{ members.usage.get(m.id) ? `${members.usage.get(m.id)} 筆記錄` : '還沒有記錄' }}</span>
        </span>
      </button>
    </div>
    <p v-else class="card py-10 text-center text-sm text-muted">還沒有成員</p>

    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="adding"
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          @click.self="adding = false"
          @keydown.esc="adding = false"
        >
          <form class="card w-full max-w-[21rem] space-y-5 p-5 shadow-xl" @submit.prevent="add">
            <div class="flex items-center justify-between gap-2">
            <h2 class="min-w-0 text-lg leading-snug font-bold">新增成員</h2>
            <button type="button" class="icon-btn -my-2 -mr-2 size-9 border-0 bg-transparent text-muted" aria-label="關閉" @click="adding = false">
              <X :size="18" />
            </button>
          </div>
            <input v-model="typed" class="input" maxlength="12" placeholder="成員的名字" />
            <div class="grid grid-cols-2 gap-2">
              <button type="button" class="btn btn-soft" @click="adding = false">取消</button>
              <button type="submit" class="btn btn-primary" :disabled="!typed.trim()">新增</button>
            </div>
          </form>
        </div>
      </Transition>
      <Transition name="fade">
        <div
          v-if="open"
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          @click.self="open = false"
          @keydown.esc="open = false"
        >
          <form class="card w-full max-w-[21rem] space-y-5 p-5 shadow-xl" @submit.prevent="rename">
            <div class="flex items-center justify-between gap-2">
              <h2 class="min-w-0 text-lg leading-snug font-bold">編輯成員</h2>
              <button type="button" class="icon-btn -my-2 -mr-2 size-9 border-0 bg-transparent text-muted" aria-label="關閉" @click="open = false">
                <X :size="18" />
              </button>
            </div>
            <div class="space-y-3">
              <input v-model="name" class="input" maxlength="12" placeholder="成員的名字" />
              <p class="px-1 text-xs text-muted">改名時，已經記在記錄上的名字也會一起改。</p>
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn btn-delete" @click="destroy">刪除</button>
              <button type="submit" class="btn btn-primary flex-1" :disabled="!name.trim()">儲存</button>
            </div>
          </form>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
