<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useUi } from '@/stores/ui'

const ui = useUi()
const inputEl = ref<HTMLInputElement>()

watch(
  () => ui.dialog,
  async (d) => {
    // on touch screens, focusing pops the keyboard over the message before it can be read
    if (d?.input && matchMedia('(pointer: fine)').matches) {
      await nextTick()
      inputEl.value?.focus()
      inputEl.value?.select()
    }
  },
)

function submit() {
  const d = ui.dialog
  if (!d) return
  if (d.input) {
    const v = d.input.value.trim()
    if (!v) return
    ui.closeDialog(v)
  } else ui.closeDialog(true)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="ui.dialog"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
        @click.self="ui.closeDialog(null)"
        @keydown.esc="ui.closeDialog(null)"
      >
        <form class="card w-full max-w-[21rem] space-y-5 p-5 shadow-xl" @submit.prevent="submit">
          <div class="space-y-2">
            <h2 class="text-lg leading-snug font-bold">{{ ui.dialog.title }}</h2>
            <div v-if="ui.dialog.message" class="space-y-1.5 text-sm leading-relaxed text-muted">
              <p v-for="(line, i) in ui.dialog.message.split('\n')" :key="i">{{ line }}</p>
            </div>
          </div>
          <input
            v-if="ui.dialog.input"
            ref="inputEl"
            v-model="ui.dialog.input.value"
            class="input"
            :placeholder="ui.dialog.input.placeholder"
          />
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="btn btn-ghost" @click="ui.closeDialog(null)">
              {{ ui.dialog.cancelText }}
            </button>
            <button
              type="submit"
              class="btn"
              :class="ui.dialog.danger ? 'btn-danger' : 'btn-primary'"
            >
              {{ ui.dialog.confirmText }}
            </button>
          </div>
        </form>
      </div>
    </Transition>

    <div
      class="pointer-events-none fixed inset-x-0 bottom-28 z-[70] flex flex-col items-center gap-2 px-4"
    >
      <TransitionGroup name="sheet">
        <div
          v-for="t in ui.toasts"
          :key="t.id"
          class="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-2.5 text-sm text-white shadow-lg"
          :class="{
            'bg-neutral-800': t.tone === 'info',
            'bg-danger': t.tone === 'error',
            'bg-success': t.tone === 'success',
          }"
        >
          <span>{{ t.text }}</span>
          <button
            v-if="t.action"
            class="font-bold underline"
            @click="(t.action.run(), ui.dismiss(t.id))"
          >
            {{ t.action.label }}
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
