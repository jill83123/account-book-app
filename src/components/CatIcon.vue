<script setup lang="ts">
import { computed } from 'vue'
import { bankCode, bankLogo } from '@/lib/banks'
import { iconOf } from '@/lib/icons'

const props = withDefaults(
  defineProps<{ icon?: string; color?: string; size?: number; ring?: boolean }>(),
  { size: 44, color: '#8b8a87' },
)
const logo = computed(() => { const c = bankCode(props.icon); return c ? bankLogo(c) : undefined })
const def = computed(() => iconOf(props.icon))
const box = computed(() => Math.round(props.size * 0.5))
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center text-white"
    :class="[ring ? 'ring-2 ring-primary ring-offset-2 ring-offset-bg' : logo ? 'ring-1 ring-line' : '', logo && 'overflow-hidden']"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${Math.round(size * 0.3)}px`,
      background: logo ? '#fff' : color,
    }"
  >
    <img v-if="logo" :src="logo" alt="" class="size-full object-cover" loading="lazy" />
    <svg v-else :width="box" :height="box" :viewBox="`0 0 ${def[0]} ${def[1]}`" fill="currentColor" aria-hidden="true">
      <path :d="def[4] as string" />
    </svg>
  </span>
</template>
