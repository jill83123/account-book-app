<script setup lang="ts">
import { Check, MonitorSmartphone, Moon, Sun } from '@/lib/uiIcons'
import { THEMES } from '@/lib/themes'
import { useSettings } from '@/stores/settings'

const { s } = useSettings()
const modes = [
  { value: 'system', label: '跟隨系統', icon: MonitorSmartphone },
  { value: 'light', label: '淺色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
] as const
</script>

<template>
  <div class="space-y-4 pb-4">
    <div class="mx-4 h-px bg-line" />
    <div class="space-y-4 px-4">
    <div class="space-y-2">
      <h3 class="text-sm font-semibold">深淺色</h3>
      <!-- three choices, each with its own icon; the picked one is outlined in the theme colour -->
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="m in modes"
          :key="m.value"
          type="button"
          class="flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-sm transition"
          :class="s.theme === m.value ? 'border-primary bg-primary-soft font-semibold text-primary-strong' : 'border-line bg-surface text-muted'"
          :aria-pressed="s.theme === m.value"
          @click="s.theme = m.value"
        >
          <component :is="m.icon" :size="16" />
          {{ m.label }}
        </button>
      </div>
    </div>

    <div class="space-y-1">
      <h3 class="text-sm font-semibold">主題色</h3>
      <div class="flex flex-wrap gap-x-1 gap-y-1">
        <button
          v-for="t in THEMES"
          :key="t.id"
          class="flex min-w-14 flex-col items-center gap-2 rounded-2xl px-2 py-2"
          :aria-label="`主題色 ${t.name}`"
          :aria-pressed="s.themeColor === t.id"
          @click="s.themeColor = t.id"
        >
          <span
            class="grid size-9 place-items-center rounded-full text-white transition"
            :class="s.themeColor === t.id && 'ring-2 ring-offset-2 ring-offset-surface'"
            :style="{ background: t.color, '--tw-ring-color': t.color }"
          >
            <Check v-if="s.themeColor === t.id" :size="16" :stroke-width="2.8" />
          </span>
          <span class="text-xs" :class="s.themeColor === t.id ? 'font-semibold' : 'text-muted'">{{ t.name }}</span>
        </button>
      </div>
    </div>
    </div>
  </div>
</template>
