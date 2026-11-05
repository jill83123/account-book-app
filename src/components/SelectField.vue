<script setup lang="ts" generic="T extends string | number">
import { computed, ref } from 'vue'
import { ChevronDown } from '@/lib/uiIcons'
import PickSheet, { type PickItem } from './PickSheet.vue'

// two roots (the field and its sheet), so class and the like go to the field by hand
defineOptions({ inheritAttrs: false })

const props = defineProps<{ title: string; items: PickItem<T>[]; placeholder?: string }>()
const model = defineModel<T>({ required: true })
const open = ref(false)

const current = computed(() => props.items.find((i) => i.value === model.value))
</script>

<template>
  <button v-bind="$attrs" type="button" class="input flex items-center justify-between gap-2 text-left" :aria-label="title" @click="open = true">
    <span class="min-w-0 flex-1 truncate" :class="!current && 'text-muted'">{{ current?.label ?? placeholder ?? '請選擇' }}</span>
    <ChevronDown :size="16" class="shrink-0 text-muted" />
  </button>
  <PickSheet v-model:open="open" :model-value="model" :title="title" :items="items" @pick="model = $event" />
</template>
