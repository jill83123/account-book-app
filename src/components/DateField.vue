<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarDays } from '@/lib/uiIcons'
import { weekday, WEEKDAYS } from '@/lib/date'
import DatePickerSheet from './DatePickerSheet.vue'

// two roots (the field and its sheet), so class and the like go to the field by hand
defineOptions({ inheritAttrs: false })

const props = defineProps<{ title?: string; placeholder?: string; clearable?: boolean; compact?: boolean }>()
/** YYYY-MM-DD, or '' for no date */
const model = defineModel<string>({ required: true })
const open = ref(false)

const label = computed(() =>
  model.value
    ? `${model.value.replaceAll('-', '/')}${props.compact ? '' : `（週${WEEKDAYS[weekday(model.value)]}）`}`
    : (props.placeholder ?? '選擇日期'),
)
</script>

<template>
  <button v-bind="$attrs" type="button" class="input flex items-center justify-between gap-2 text-left" @click="open = true">
    <span class="min-w-0 truncate" :class="!model && 'text-muted'">{{ label }}</span>
    <CalendarDays v-if="!compact" :size="18" class="shrink-0 text-muted" />
  </button>
  <DatePickerSheet v-model:open="open" v-model="model" :title="title" :clearable="clearable" />
</template>
