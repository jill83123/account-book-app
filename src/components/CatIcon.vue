<script setup lang="ts">
import { computed } from 'vue'
import { iconOf } from '@/lib/icons'

const props = withDefaults(
  defineProps<{ icon?: string; color?: string; size?: number; ring?: boolean }>(),
  { size: 44, color: '#8b8a87' },
)
const def = computed(() => iconOf(props.icon))
const box = computed(() => Math.round(props.size * 0.5))
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center text-white"
    :class="ring ? 'ring-2 ring-primary ring-offset-2 ring-offset-bg' : ''"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${Math.round(size * 0.3)}px`,
      background: color,
    }"
  >
    <svg :width="box" :height="box" :viewBox="`0 0 ${def[0]} ${def[1]}`" fill="currentColor" aria-hidden="true">
      <path :d="def[4] as string" />
    </svg>
  </span>
</template>
