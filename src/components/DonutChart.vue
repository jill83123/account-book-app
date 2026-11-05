<script setup lang="ts">
import { computed } from 'vue'

export interface Slice {
  id: string
  value: number
  color: string
  /** named in the legend beside the ring */
  label?: string
}

const props = withDefaults(defineProps<{ slices: Slice[]; size?: number; thickness?: number; activeId?: string }>(), {
  size: 150,
  thickness: 26,
  activeId: '',
})
/** tapping a slice, or its row in the legend */
const emit = defineEmits<{ pick: [id: string] }>()

const radius = computed(() => (props.size - props.thickness) / 2)
const circ = computed(() => 2 * Math.PI * radius.value)
const total = computed(() => props.slices.reduce((s, x) => s + Math.max(0, x.value), 0))
const c = computed(() => props.size / 2)

const arcs = computed(() => {
  let offset = 0
  return props.slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const share = s.value / total.value
      const arc = { id: s.id, color: s.color, len: share * circ.value, offset, label: s.label, share }
      offset += arc.len
      return arc
    })
})

const pct = (share: number) => (share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`)
</script>

<template>
  <div class="mx-auto flex max-w-sm items-center justify-center gap-10">
    <!-- the ring takes the room the legend leaves (up to a limit), so a wide card does not end up with empty sides -->
    <div class="@container relative aspect-square min-w-0 max-w-56 flex-1">
      <svg :viewBox="`0 0 ${size} ${size}`" class="size-full -rotate-90">
        <circle :cx="c" :cy="c" :r="radius" fill="none" stroke="var(--line)" :stroke-width="thickness" />
        <circle
          v-for="a in arcs"
          :key="a.id"
          :cx="c"
          :cy="c"
          :r="radius"
          fill="none"
          :stroke="a.color"
          :stroke-width="thickness"
          :stroke-dasharray="`${Math.max(a.len - (arcs.length > 1 ? 2 : 0), 1.5)} ${circ}`"
          :stroke-dashoffset="-a.offset"
          class="cursor-pointer transition-opacity"
          :opacity="activeId && activeId !== a.id ? 0.3 : 1"
          @click="emit('pick', a.id)"
        />
      </svg>
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-[14%] text-center">
        <slot />
      </div>
    </div>

    <!-- who is who: a dot in the slice's colour, the name and the share -->
    <!-- three columns (dot, name, share) so the shares line up right after the longest name -->
    <ul class="grid shrink-0 grid-cols-[auto_auto_auto] items-center gap-x-1.5 gap-y-2.5 text-xs">
      <li v-for="a in arcs" :key="a.id" class="contents">
        <button
          class="contents text-left"
          @click="emit('pick', a.id)"
        >
          <span class="size-2.5 rounded-full transition-opacity" :class="activeId && activeId !== a.id && 'opacity-40'" :style="{ background: a.color }" />
          <span class="truncate transition-opacity" :class="[activeId === a.id && 'font-semibold', activeId && activeId !== a.id && 'opacity-40']">{{ a.label }}</span>
          <span class="ml-1 text-right text-muted tabular-nums transition-opacity" :class="activeId && activeId !== a.id && 'opacity-40'">{{ pct(a.share) }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
