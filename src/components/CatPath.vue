<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight } from '@/lib/uiIcons'
import { useData } from '@/stores/data'

/** A category as its path (飲食, then 午餐) with a small arrow icon between the names. */
const props = defineProps<{ id: string; chip?: boolean }>()
const data = useData()

const names = computed(() => {
  const c = data.catMap.get(props.id)
  if (!c) return ['未分類']
  const p = c.parentId ? data.catMap.get(c.parentId) : undefined
  return p ? [p.name, c.name] : [c.name]
})
</script>

<template>
  <span class="inline-flex max-w-full items-center gap-0.5 align-middle" :class="chip && 'rounded-lg bg-surface-2 px-2 py-1 text-ink/80'">
    <template v-for="(n, i) in names" :key="i">
      <ChevronRight v-if="i > 0" :size="12" :stroke-width="2.4" class="shrink-0 opacity-60" />
      <span class="truncate">{{ n }}</span>
    </template>
  </span>
</template>
