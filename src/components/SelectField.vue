<script setup lang="ts" generic="T extends string | number">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Check, ChevronDown } from '@/lib/uiIcons'
import PickSheet, { type PickItem } from './PickSheet.vue'

// class and the like go to the field by hand, not to the wrapper
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  title: string
  items: PickItem<T>[]
  placeholder?: string
  inline?: boolean
}>()
const model = defineModel<T>({ required: true })
const open = ref(false)
const root = ref<HTMLElement>()

// an inline list floats over the content, so a tap anywhere else puts it away
function away(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}
watch(open, (o) => {
  if (!props.inline) return
  if (o) document.addEventListener('pointerdown', away)
  else document.removeEventListener('pointerdown', away)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', away))

const current = computed(() => props.items.find((i) => i.value === model.value))
</script>

<template>
  <div ref="root" :class="inline && 'relative'">
    <button
      v-bind="$attrs"
      type="button"
      class="input flex items-center justify-between gap-2 text-left"
      :aria-label="title"
      @click="open = inline ? !open : true"
    >
      <span class="min-w-0 flex-1 truncate" :class="!current && 'text-muted'">{{
        current?.label ?? placeholder ?? '請選擇'
      }}</span>
      <ChevronDown :size="16" class="shrink-0 text-muted" />
    </button>
    <!-- inline: the choices unfold under the field, for a field that already sits inside a sheet -->
    <div v-if="inline && open" class="absolute inset-x-0 top-full z-30 mt-2">
      <ul
        class="max-h-[16.5rem] touch-pan-y overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-4px_rgb(0_0_0/0.10)]"
      >
        <li v-for="it in items" :key="String(it.value)">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left"
            :class="
              it.value === model ? 'bg-primary/10 font-semibold text-primary' : 'active:bg-line/60'
            "
            @click="((model = it.value), (open = false))"
          >
            <span class="min-w-0 flex-1 truncate"
              >{{ it.label
              }}<span v-if="it.sub" class="ml-2 text-xs font-normal text-muted">{{
                it.sub
              }}</span></span
            >
            <Check v-if="it.value === model" :size="18" class="shrink-0" />
          </button>
        </li>
      </ul>
      <div
        class="pointer-events-none absolute inset-x-1.5 bottom-px h-6 rounded-b-2xl bg-gradient-to-t from-surface to-transparent"
      />
    </div>
    <PickSheet
      v-else-if="!inline"
      v-model:open="open"
      :model-value="model"
      :title="title"
      :items="items"
      @pick="model = $event"
    />
  </div>
</template>
