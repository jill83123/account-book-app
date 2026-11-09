<script setup lang="ts">
import { ref } from 'vue'
import { Clock } from '@/lib/uiIcons'
import TimePickerSheet from './TimePickerSheet.vue'

// two roots (the field and its sheet), so class and the like go to the field by hand
defineOptions({ inheritAttrs: false })

const props = defineProps<{ title?: string; placeholder?: string; clearable?: boolean; lead?: boolean }>()
/** HH:mm, or '' when empty */
const model = defineModel<string>({ required: true })
const open = ref(false)
</script>

<template>
  <button
    v-bind="$attrs"
    type="button"
    class="input flex items-center gap-2 text-left"
    :class="lead ? 'justify-start !pl-3' : 'justify-between'"
    @click="open = true"
  >
    <Clock v-if="lead" :size="17" class="shrink-0 text-muted" />
    <span class="min-w-0 truncate tabular-nums" :class="!model && 'text-muted'">{{ model || props.placeholder || '--:--' }}</span>
    <Clock v-if="!lead" :size="18" class="shrink-0 text-muted" />
  </button>
  <TimePickerSheet v-model:open="open" v-model="model" :title="title" :clearable="clearable" />
</template>
