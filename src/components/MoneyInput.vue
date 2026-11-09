<script setup lang="ts">
import { ref } from 'vue'
import { groupDigits } from '@/lib/money'

/** A text box for amounts: shows thousands separators while typing, but the model keeps the plain text. */
const model = defineModel<string>({ default: '' })
const el = ref<HTMLInputElement>()

function onInput() {
  const i = el.value
  if (!i) return
  const raw = i.value
  const caret = i.selectionStart ?? raw.length
  const digitsBefore = raw.slice(0, caret).replace(/,/g, '').length
  const plain = raw.replace(/,/g, '')
  model.value = plain
  const shown = groupDigits(plain)
  if (shown === raw) return
  i.value = shown
  let seen = 0
  let pos = 0
  while (pos < shown.length && seen < digitsBefore) {
    if (shown[pos] !== ',') seen++
    pos++
  }
  i.setSelectionRange(pos, pos)
}
/** the thousands commas are only decoration: keep the caret or a selection from sitting on one */
function snap() {
  const i = el.value
  if (!i || i.selectionStart == null || i.selectionEnd == null) return
  let a = i.selectionStart
  let b = i.selectionEnd
  if (a === b) return
  while (a < b && i.value[a] === ',') a++
  while (b > a && i.value[b - 1] === ',') b--
  if (a === b) b = a = i.selectionDirection === 'backward' ? i.selectionStart : i.selectionEnd
  if (a !== i.selectionStart || b !== i.selectionEnd) i.setSelectionRange(a, b)
}

defineExpose({ focus: () => el.value?.focus() })
</script>

<template>
  <input ref="el" :value="groupDigits(model)" @input="onInput" @select="snap" @mouseup="snap" @keyup="snap" />
</template>
