<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { X } from '@/lib/uiIcons'

defineProps<{ title?: string }>()
const open = defineModel<boolean>({ required: true })

/** the fades above and below the pinned bars only make sense while the list actually scrolls */
const scrolls = ref(false)
let watcher: ResizeObserver | undefined
function watchScroll(el: unknown) {
  watcher?.disconnect()
  if (!(el instanceof HTMLElement)) return
  const check = () => (scrolls.value = el.scrollHeight > el.clientHeight + 1)
  watcher = new ResizeObserver(check)
  watcher.observe(el)
  for (const c of Array.from(el.children)) watcher.observe(c)
  check()
}
onBeforeUnmount(() => watcher?.disconnect())
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-40 bg-black/30" @click="open = false" />
    </Transition>
    <Transition name="sheet">
      <!-- the title stays put and only the content below it scrolls, so a scrollbar never runs along the rounded corners -->
      <div
        v-if="open"
        class="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border-t border-line bg-bg shadow-2xl"
        @keydown.esc="open = false"
      >
        <div class="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-4">
          <h2 class="text-lg font-bold">{{ title }}</h2>
          <div class="ml-auto flex items-center gap-2">
            <slot name="actions" />
            <button class="icon-btn border-0 bg-transparent" aria-label="關閉" @click="open = false">
              <X :size="18" />
            </button>
          </div>
        </div>
        <div
          :ref="watchScroll"
          class="min-h-0 flex-1 overflow-y-auto px-5 [scrollbar-gutter:stable_both-edges]"
          :class="!$slots.footer && 'pb-[max(1.25rem,env(safe-area-inset-bottom))]'"
        >
          <!-- pinned to the top of the scroll area, with a fade under it -->
          <div v-if="$slots.search" class="sticky top-0 z-10 bg-bg pb-3 "
            :class="scrolls && 'after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-gradient-to-b after:from-bg after:to-transparent'">
            <slot name="search" />
          </div>
          <slot />
          <!-- pinned to the bottom, with a fade above it -->
          <div v-if="$slots.footer" class="sticky bottom-0 z-10 bg-bg pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] "
            :class="scrolls && 'before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-gradient-to-t before:from-bg before:to-transparent'"
          >
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
