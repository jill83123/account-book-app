<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Plus } from '@/lib/uiIcons'
import { useMembers } from '@/stores/members'
import { useUi } from '@/stores/ui'
import BottomSheet from './BottomSheet.vue'

const open = defineModel<boolean>('open', { required: true })
/** the ids of the members the money was spent with */
const model = defineModel<string[]>({ required: true })
const members = useMembers()
const ui = useUi()

const draft = ref<string[]>([])
const adding = ref(false)
const typed = ref('')
const inputEl = ref<HTMLInputElement>()

watch(
  open,
  (o) => {
    if (!o) return
    draft.value = [...model.value]
    adding.value = false
    typed.value = ''
  },
  { immediate: true },
)

const choices = computed(() => members.list)

const has = (id: string) => draft.value.includes(id)
function toggle(id: string) {
  draft.value = has(id) ? draft.value.filter((d) => d !== id) : [...draft.value, id]
}

async function startAdd() {
  adding.value = true
  await nextTick()
  inputEl.value?.focus()
}

/** a new member joins the list (under 更多 → 成員) and is picked for this record right away */
async function add() {
  const name = typed.value.trim()
  if (!name) {
    adding.value = false
    return
  }
  if (members.taken(name)) return ui.toast(members.takenHint(name), 'error')
  const id = await members.add(name)
  if (!id) return ui.toast('名字不能是空的', 'error')
  draft.value = [...draft.value, id]
  typed.value = ''
  adding.value = false
}

async function done() {
  if (typed.value.trim()) await add()
  model.value = [...draft.value]
  open.value = false
}
</script>

<template>
  <BottomSheet v-model="open" title="和誰一起">
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <button v-for="m in choices" :key="m.id" class="chip" :class="has(m.id) && 'chip-on'" @click="toggle(m.id)">{{ members.nameOf(m.id) }}</button>
        <button v-if="!adding" class="chip text-muted" aria-label="新增成員" @click="startAdd"><Plus :size="16" /></button>
      </div>

      <!-- quick add: type a name, and it is saved as a member and picked -->
      <div v-if="adding" class="flex gap-2">
        <input
          ref="inputEl"
          v-model="typed"
          class="input min-w-0 flex-1"
          maxlength="12"
          placeholder="成員的名字"
          @keyup.enter="add"
        />
        <button class="btn btn-soft shrink-0" :disabled="!typed.trim()" @click="add">加入</button>
      </div>
      <p v-else-if="!choices.length" class="text-center text-sm text-muted">還沒有成員，點上面的 ＋ 新增。</p>

      <button class="btn btn-primary w-full" @click="done">完成</button>
    </div>
  </BottomSheet>
</template>
