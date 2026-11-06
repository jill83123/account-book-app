<script setup lang="ts">
import { ref } from 'vue'
import { Plus } from '@/lib/uiIcons'
import { useMembers } from '@/stores/members'
import { useUi } from '@/stores/ui'
import BottomSheet from '@/components/BottomSheet.vue'
import PageHeader from '@/components/PageHeader.vue'

const members = useMembers()
const ui = useUi()

const typed = ref('')
async function add() {
  const name = typed.value.trim()
  if (!name) return
  if (members.taken(name)) return ui.toast(members.takenHint(name), 'error')
  await members.add(name)
  typed.value = ''
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
    <PageHeader title="成員" />

    <p class="mb-3 px-1 text-sm text-muted">新增常一起花錢的人，記帳時就能用<b>和誰一起</b>欄位選他們。</p>

    <div class="mb-4 flex gap-2">
      <input v-model="typed" class="input min-w-0 flex-1" maxlength="12" placeholder="新增成員的名字" @keyup.enter="add" />
      <button class="btn btn-soft shrink-0" :disabled="!typed.trim()" @click="add"><Plus :size="16" />新增</button>
    </div>

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

    <BottomSheet v-model="open" title="編輯成員">
      <div class="space-y-4">
        <div>
          <label class="label" for="member-name">名字</label>
          <input id="member-name" v-model="name" class="input" maxlength="12" @keyup.enter="rename" />
          <p class="mt-1.5 px-1 text-xs text-muted">改名時，已經記在記錄上的名字也會一起改。</p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-ghost text-danger" @click="destroy">刪除</button>
          <button class="btn btn-primary flex-1" @click="rename">儲存</button>
        </div>
      </div>
    </BottomSheet>
  </div>
</template>
