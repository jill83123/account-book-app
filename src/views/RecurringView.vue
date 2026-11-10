<script setup lang="ts">
import MoneyText from '@/components/MoneyText.vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, Repeat, Trash2 } from '@/lib/uiIcons'
import { remove, save } from '@/db'
import type { Recurring } from '@/db/types'
import { fmt } from '@/lib/money'
import { isFinished, nextDue, repeatLabel } from '@/lib/recurrence'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import BottomSheet from '@/components/BottomSheet.vue'
import DateField from '@/components/DateField.vue'
import CatIcon from '@/components/CatIcon.vue'
import PageHeader from '@/components/PageHeader.vue'
import PillTabs from '@/components/PillTabs.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'

const router = useRouter()
const route = useRoute()
const data = useData()
const ui = useUi()

const tab = ref<'recurring' | 'installment'>('recurring')
const list = computed(() => data.recurrings.filter((r) => r.kind === tab.value).sort((a, b) => a.name.localeCompare(b.name)))

const per = (r: Recurring) =>
  r.installment
    ? Math.round(r.installment.total / r.installment.periods) + r.installment.fee
    : r.template.lines.reduce((s, l) => s + l.amount, 0)

const openId = ref('')
const open = computed({ get: () => Boolean(openId.value), set: (v: boolean) => !v && (openId.value = '') })
const cur = computed(() => data.recurrings.find((r) => r.id === openId.value))

const name = ref('')
const active = ref(true)
const autoPost = ref(true)
const endDate = ref('')

function edit(r: Recurring) {
  openId.value = r.id
  name.value = r.name
  active.value = r.active
  autoPost.value = r.autoPost
  endDate.value = r.endDate ?? ''
}

async function submit() {
  const r = cur.value
  if (!r) return
  await save('recurrings', {
    ...r,
    name: name.value.trim() || r.name,
    active: active.value,
    autoPost: autoPost.value,
    endDate: endDate.value || undefined,
  })
  open.value = false
}

async function destroy() {
  const r = cur.value
  if (!r) return
  if (!(await ui.confirm(`刪除${r.name}？`, { message: '之後不會再產生新記錄，已經入帳的記錄會保留。', danger: true, confirmText: '刪除' }))) return
  await remove('recurrings', r.id)
  open.value = false
}

// coming from a record: show the tab it belongs to and open it (once)
let shownFromRecord = ''
watch(
  [() => route.query.id, () => data.recurrings],
  ([id]) => {
    const r = typeof id === 'string' ? data.recurrings.find((x) => x.id === id) : undefined
    if (!r || shownFromRecord === r.id) return
    shownFromRecord = r.id
    tab.value = r.kind
    edit(r)
  },
  { immediate: true },
)

const status = (r: Recurring) => (isFinished(r) ? '已完成' : r.active ? `下次 ${nextDue(r) ?? '—'}` : '已暫停')
const catOf = (r: Recurring) => data.catMap.get(r.template.lines[0]?.categoryId ?? '')
</script>

<template>
  <div>
    <PageHeader title="週期與分期">
      <template #right>
        <button class="circle-btn" aria-label="新增" @click="router.push({ path: '/record/new', query: { repeat: tab } })"><Plus :size="22" /></button>
      </template>
    </PageHeader>
    <PillTabs
      v-model="tab"
      class="mb-3"
      :options="[
        { value: 'recurring', label: '週期交易' },
        { value: 'installment', label: '分期付款' },
      ]"
    />
    <p class="mb-3 px-1 text-sm text-muted">
      <template v-if="tab === 'recurring'">
        房租、訂閱、薪資這類固定發生的交易。在新增記錄時，把<b>商家</b>旁邊的<b>單次</b>改成<b>週期</b>就會建立。
      </template>
      <template v-else>
        信用卡分期等每月固定攤付的消費。新增記錄時選<b>分期</b>，會把總額拆成每月一期，自動入帳。
      </template>
    </p>

    <div v-if="list.length" class="card divide-y divide-line p-0">
      <button v-for="r in list" :key="r.id" class="flex w-full items-center gap-3 px-4 py-3.5 text-left" @click="edit(r)">
        <CatIcon :icon="catOf(r)?.icon ?? 'tag'" :color="catOf(r)?.color" :size="40" />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium">{{ r.name }}</span>
          <span class="block truncate text-xs text-muted">
            {{ r.kind === 'installment' ? `${r.generated} / ${r.count} 期` : repeatLabel(r) }}｜{{ status(r) }}
          </span>
        </span>
        <span class="text-right">
          <span class="block font-semibold"><MoneyText :n="per(r)" /></span>
          <span v-if="r.kind === 'installment' && r.installment" class="block text-xs text-muted">
            剩 <MoneyText :n="r.installment.total - Math.round((r.installment.total / r.installment.periods) * r.generated)" />
          </span>
          <Repeat v-else :size="13" class="ml-auto text-muted" />
        </span>
      </button>
    </div>
    <p v-else class="card py-12 text-center text-sm text-muted">還沒有{{ tab === 'recurring' ? '週期交易' : '分期付款' }}</p>

    <BottomSheet v-model="open" title="編輯排程">
      <template v-if="cur" #actions>
        <button class="icon-btn border-0 bg-transparent text-danger" aria-label="刪除" @click="destroy"><Trash2 :size="18" /></button>
      </template>
      <div v-if="cur" class="space-y-4">
        <div>
          <label class="label">名稱</label>
          <input v-model="name" class="input" />
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm">啟用</span>
          <ToggleSwitch v-model="active" label="啟用" />
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm">
            自動入帳
            <span class="block text-xs text-muted">關閉時到期會出現在提醒，由你確認</span>
          </span>
          <ToggleSwitch v-model="autoPost" label="自動入帳" />
        </div>
        <div v-if="cur.kind === 'recurring'">
          <label class="label">結束日期（選填）</label>
          <DateField v-model="endDate" title="結束日期" placeholder="不設定" clearable />
        </div>
        <p class="text-xs text-muted">開始於 {{ cur.startDate }}，已處理 {{ cur.generated }} 次。</p>
        <button class="btn btn-primary w-full" @click="submit">儲存</button>
      </div>
    </BottomSheet>
  </div>
</template>
