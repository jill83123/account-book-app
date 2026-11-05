<script setup lang="ts">
import type { Component } from 'vue'
import { ChevronDown, ChevronRight } from '@/lib/uiIcons'

/** `open` given (true or false) makes the row an accordion header instead of a link */
withDefaults(defineProps<{ icon: Component; title: string; sub?: string; open?: boolean }>(), { open: undefined })
</script>

<template>
  <button class="flex w-full items-center gap-3 px-4 py-3.5 text-left">
    <!-- one calm look for the whole list: a solid tile in the theme colour with a white icon -->
    <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-white">
      <component :is="icon" :size="20" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block font-medium">{{ title }}</span>
      <span v-if="sub" class="block truncate text-xs text-muted">{{ sub }}</span>
    </span>
    <slot />
    <ChevronDown v-if="open !== undefined" :size="16" class="shrink-0 text-muted transition-transform" :class="open && 'rotate-180'" />
    <ChevronRight v-else :size="16" class="shrink-0 text-muted" />
  </button>
</template>
