<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronLeft } from '@/lib/uiIcons'
import type { CategoryKind } from '@/db/types'
import { useData } from '@/stores/data'
import BottomSheet from './BottomSheet.vue'
import CatIcon from './CatIcon.vue'

const props = defineProps<{ kind: CategoryKind }>()
const open = defineModel<boolean>('open', { required: true })
const model = defineModel<string>({ required: true })
const data = useData()

/** '' while looking at the top level, otherwise the category whose sub-categories are shown */
const level = ref('')
const parent = computed(() => data.catMap.get(level.value))
const items = computed(() => data.childrenOf(level.value || null, props.kind))
const hasKids = (id: string) => data.childrenOf(id, props.kind).length > 0

// open on the level the current choice lives in
watch(open, (o) => {
  if (!o) return
  const c = data.catMap.get(model.value)
  level.value = c ? (c.parentId ?? (hasKids(c.id) ? c.id : '')) : ''
})

function pick(id: string) {
  model.value = id
  open.value = false
}

function tap(id: string) {
  // a top-level category with sub-categories opens them; everything else is the answer
  if (!level.value && hasKids(id)) level.value = id
  else pick(id)
}

/** Which tile is the current choice: the top-level group it belongs to, or the exact item inside a group. */
function isCurrent(id: string) {
  const c = data.catMap.get(model.value)
  if (!c) return false
  return level.value ? c.id === id : c.id === id || c.parentId === id
}
</script>

<template>
  <BottomSheet v-model="open" :title="parent ? parent.name : '選擇分類'">
    <Transition name="fade" mode="out-in">
      <div :key="level" class="grid grid-cols-4 gap-x-2 gap-y-4">
        <template v-if="parent">
          <button class="flex flex-col items-center gap-1.5" @click="level = ''">
            <span class="grid size-[52px] place-items-center rounded-[16px] bg-surface-2 text-muted">
              <ChevronLeft :size="24" />
            </span>
            <span class="text-xs">返回</span>
          </button>
          <button class="flex flex-col items-center gap-1.5" @click="pick(parent.id)">
            <CatIcon :icon="parent.icon" :color="parent.color" :size="52" :ring="model === parent.id" />
            <span class="max-w-full truncate text-xs">未細分</span>
          </button>
        </template>
        <button v-for="c in items" :key="c.id" class="flex flex-col items-center gap-1.5" @click="tap(c.id)">
          <CatIcon :icon="c.icon" :color="c.color" :size="52" :ring="isCurrent(c.id)" />
          <span class="max-w-full truncate text-xs">{{ c.name }}</span>
        </button>
      </div>
    </Transition>
  </BottomSheet>
</template>
