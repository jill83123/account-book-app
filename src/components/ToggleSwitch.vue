<script setup lang="ts">
defineProps<{ label?: string }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="model"
    :aria-label="label"
    class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-40"
    :class="model ? 'bg-primary' : 'bg-line'"
    @click="model = !model"
  >
    <span
      class="inline-block size-5 rounded-full bg-white shadow transition-transform"
      :class="model ? 'translate-x-6' : 'translate-x-1'"
    />
  </button>
</template>
