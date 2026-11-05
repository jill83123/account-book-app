<script setup lang="ts" generic="T extends string | number">
import type { Component } from 'vue'
defineProps<{
  options: { value: T; label: string; icon?: Component }[]
  size?: 'sm' | 'md'
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <!-- one segmented bar: the chosen option is a raised white tab on a grey track -->
  <div class="flex w-full gap-0.5 rounded-2xl bg-line/50 p-0.5" role="tablist">
    <button
      v-for="o in options"
      :key="String(o.value)"
      type="button"
      role="tab"
      :aria-selected="model === o.value"
      class="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[14px] px-1.5 font-medium transition-all"
      :class="[
        model === o.value ? 'bg-surface font-bold text-ink shadow-sm' : 'text-muted hover:text-ink',
        size === 'sm' ? 'min-h-8 py-1 text-xs' : 'min-h-9 py-1.5 text-sm',
      ]"
      @click="model = o.value"
    >
      <component :is="o.icon" v-if="o.icon" :size="size === 'sm' ? 14 : 16" class="shrink-0" />
      <span class="truncate">{{ o.label }}</span>
    </button>
  </div>
</template>
