<script setup lang="ts">
import { ref, watch } from 'vue'
import { Delete } from '@/lib/uiIcons'
import { evalExpr } from '@/lib/money'
import BottomSheet from './BottomSheet.vue'

const open = defineModel<boolean>('open', { required: true })
const model = defineModel<number>({ required: true })
const expr = ref('')

watch(open, (o) => {
  if (o) expr.value = model.value ? String(model.value) : ''
})

const keys = ['7', '8', '9', 'back', '4', '5', '6', '+', '1', '2', '3', '-', '0', '00', '×', '÷']

function press(k: string) {
  if (k === 'back') expr.value = expr.value.slice(0, -1)
  else expr.value += k
}

const preview = () => evalExpr(expr.value)

function done() {
  const v = evalExpr(expr.value)
  if (v == null) return
  model.value = v
  open.value = false
}
</script>

<template>
  <BottomSheet v-model="open" title="輸入金額">
    <div class="card mb-3 flex min-h-16 flex-col items-end justify-center">
      <span class="text-3xl font-semibold break-all">{{ expr || '0' }}</span>
      <span v-if="expr && /[+\-×÷]/.test(expr)" class="text-sm text-muted">
        = {{ preview() ?? '格式不正確' }}
      </span>
    </div>
    <div class="grid grid-cols-4 gap-2">
      <button
        v-for="k in keys"
        :key="k"
        class="grid h-14 place-items-center rounded-2xl text-xl font-medium transition active:scale-95"
        :class="/[+\-×÷]/.test(k) ? 'bg-primary-soft text-primary-strong' : 'bg-surface'"
        style="box-shadow: var(--shadow)"
        @click="press(k)"
      >
        <Delete v-if="k === 'back'" :size="22" />
        <template v-else>{{ k }}</template>
      </button>
    </div>
    <div class="mt-3 flex gap-2">
      <button class="btn btn-ghost flex-1" @click="expr = ''">清除</button>
      <button class="btn btn-primary flex-[2]" :disabled="preview() == null" @click="done">完成</button>
    </div>
  </BottomSheet>
</template>
