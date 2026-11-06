<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Rec } from '@/db/types'
import { evalExpr, fmt } from '@/lib/money'
import { sharesFor } from '@/lib/split'
import { useMembers } from '@/stores/members'
import BottomSheet from './BottomSheet.vue'
import PillTabs from './PillTabs.vue'

type Split = NonNullable<Rec['split']>
type Mode = Split['mode'] | 'none'

/** `people` are member ids */
const props = defineProps<{ total: number; people: string[] }>()
const members = useMembers()
const open = defineModel<boolean>('open', { required: true })
/** how the bill is shared; missing when it is not */
const model = defineModel<Split | undefined>({ required: true })

const mode = ref<Mode>('none')
const typed = ref<Record<string, string>>({})
/** somebody else paid: who, and what this person's own part is */
const payer = ref('')
const mineText = ref('')

watch(
  open,
  (o) => {
    if (!o) return
    const m = model.value
    mode.value = m?.mode ?? 'none'
    typed.value = m && m.mode !== 'other' ? Object.fromEntries(m.shares.map((s) => [s.memberId, String(s.amount)])) : {}
    payer.value = m?.payer && props.people.includes(m.payer) ? m.payer : (props.people[0] ?? '')
    mineText.value = String(m?.mode === 'other' && m.mine != null ? m.mine : Math.round(props.total / (props.people.length + 1)))
  },
  { immediate: true },
)

const custom = computed(() => Object.fromEntries(props.people.map((p) => [p, evalExpr(typed.value[p] ?? '') ?? 0])))
const shares = computed(() => (mode.value === 'none' || mode.value === 'other' ? [] : sharesFor(mode.value, props.total, props.people, custom.value)))
const others = computed(() => shares.value.reduce((n, s) => n + s.amount, 0))
const mineOther = computed(() => Math.round(evalExpr(mineText.value) ?? 0))
const mine = computed(() => (mode.value === 'other' ? mineOther.value : props.total - others.value))
const amountOf = (id: string) => shares.value.find((s) => s.memberId === id)?.amount ?? 0
const tooMuch = computed(() => (mode.value === 'custom' && others.value > props.total) || (mode.value === 'other' && (mineOther.value > props.total || mineOther.value < 0)))

function done() {
  if (tooMuch.value) return
  if (mode.value === 'none') model.value = undefined
  else if (mode.value === 'other') model.value = payer.value ? { mode: 'other', shares: [], payer: payer.value, mine: mineOther.value } : undefined
  else model.value = shares.value.length ? { mode: mode.value, shares: shares.value } : undefined
  open.value = false
}
</script>

<template>
  <BottomSheet v-model="open" title="分帳">
    <div class="space-y-4">
      <PillTabs
        v-model="mode"
        size="sm"
        :options="[
          { value: 'none', label: '不分' },
          { value: 'even', label: '平均分' },
          { value: 'custom', label: '自訂' },
          { value: 'advance', label: '代墊' },
          { value: 'other', label: '別人付' },
        ]"
      />

      <p class="text-sm text-muted">
        <template v-if="mode === 'none'">整筆都算你自己的花費。</template>
        <template v-else-if="mode === 'even'">你和同行的人平均分，你先付，其他人的部分記成他們欠你。</template>
        <template v-else-if="mode === 'custom'">自己填每個人的部分，剩下的是你的。</template>
        <template v-else-if="mode === 'advance'">全部是幫他們付的，你自己沒有花費，他們的部分記成欠你。</template>
        <template v-else>是別人先付的，帳戶不會減少。你只算自己的部分，記成你欠他。</template>
      </p>

      <!-- somebody else paid -->
      <template v-if="mode === 'other'">
        <div>
          <p class="label">誰付的</p>
          <div class="flex flex-wrap gap-2">
            <button v-for="p in people" :key="p" class="chip" :class="payer === p && 'chip-on'" @click="payer = p">{{ members.nameOf(p) }}</button>
          </div>
        </div>
        <div>
          <label class="label" for="split-mine">我的部分（這筆一共 ${{ fmt(total) }}）</label>
          <input id="split-mine" v-model="mineText" class="input" inputmode="decimal" placeholder="0" />
          <p v-if="payer && mineOther > 0 && !tooMuch" class="mt-1.5 px-1 text-xs text-muted">你欠{{ members.nameOf(payer) }} ${{ fmt(mineOther) }}，之後在<b>借款</b>頁還給他。</p>
        </div>
      </template>

      <!-- who carries what: me on top in the theme colour, then each person who owes me -->
      <div v-else-if="mode !== 'none'" class="space-y-2">
        <div class="flex items-center gap-3 rounded-2xl bg-primary-soft px-4 py-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-white">我</span>
          <span class="min-w-0 flex-1">
            <span class="block font-medium">我的花費</span>
          </span>
          <span class="text-lg font-bold text-primary-strong tabular-nums">{{ total > 0 ? `$${fmt(mine)}` : '—' }}</span>
        </div>
        <div v-for="p in people" :key="p" class="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-2.5">
          <span class="grid size-9 shrink-0 place-items-center rounded-full bg-line text-sm font-semibold text-ink">{{ members.nameOf(p).slice(0, 1) }}</span>
          <span class="min-w-0 flex-1 truncate font-medium">{{ members.nameOf(p) }}</span>
          <span class="shrink-0 text-xs text-muted">欠我</span>
          <span v-if="mode === 'custom'" class="relative w-28 shrink-0">
            <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">$</span>
            <input v-model="typed[p]" class="input w-full !min-h-0 !py-2 !pl-6 text-right" inputmode="decimal" placeholder="0" />
          </span>
          <span v-else class="text-lg font-semibold tabular-nums">{{ total > 0 ? `$${fmt(amountOf(p))}` : '—' }}</span>
        </div>
      </div>
      <p v-if="tooMuch" class="text-sm text-danger">金額超過這筆的總額 ${{ fmt(total) }}。</p>

      <button class="btn btn-primary w-full" :disabled="tooMuch" @click="done">完成</button>
    </div>
  </BottomSheet>
</template>
