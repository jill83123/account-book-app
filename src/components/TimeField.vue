<script setup lang="ts">
import { ref } from 'vue'
import { Clock } from '@/lib/uiIcons'
import TimePickerSheet from './TimePickerSheet.vue'

// two roots (the field and its sheet), so class and the like go to the field by hand
defineOptions({ inheritAttrs: false })

const props = defineProps<{ title?: string; placeholder?: string; clearable?: boolean }>()
/** HH:mm, or '' when empty */
const model = defineModel<string>({ required: true })
const open = ref(false)
</script>

<template>
  <button v-bind="$attrs" type="button" class="input flex items-center justify-between gap-2 text-left" @click="open = true">
    <span class="tabular-nums" :class="!model && 'text-muted'">{{ model || props.placeholder || '--:--' }}</span>
    <Clock :size="18" class="shrink-0 text-muted" />
  </button>
  <TimePickerSheet v-model:open="open" v-model="model" :title="title" :clearable="clearable" />
</template>
