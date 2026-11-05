<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { BellRing, CalendarClock, ChevronDown, CreditCard, HandCoins, PencilLine, X } from '@/lib/uiIcons'
import { ARCHIVE_DAYS, daysLeft, type Reminder, type ReminderKind } from '@/lib/reminders'
import { useUi } from '@/stores/ui'
import { P } from '@/lib/colors'
import { resolveOccurrence } from '@/lib/recurrence'
import { fmt } from '@/lib/money'
import { useReminders } from '@/stores/reminders'
import PageHeader from '@/components/PageHeader.vue'

const router = useRouter()
const reminders = useReminders()
const ui = useUi()
const showOpen = ref(true)
const showArchive = ref(false)
const looks: Record<ReminderKind, { icon: typeof BellRing; color: string }> = {
  daily: { icon: PencilLine, color: P.blue },
  pending: { icon: BellRing, color: P.orange },
  upcoming: { icon: CalendarClock, color: P.teal },
  card: { icon: CreditCard, color: P.indigo },
  loan: { icon: HandCoins, color: P.red },
}

async function archive(r: Reminder) {
  if (!(await ui.confirm('封存這則提醒？', { confirmText: '封存' }))) return
  reminders.archiveNow(r)
}

const dayLabel =(ms: number) => {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<template>
  <div>
    <PageHeader title="提醒" />
    <button class="mb-2 flex w-full items-center justify-between px-1 text-sm font-semibold text-muted" @click="showOpen = !showOpen">
      <span>待處理的提醒（{{ reminders.list.length }}）</span>
      <ChevronDown :size="16" class="transition-transform" :class="showOpen && 'rotate-180'" />
    </button>
    <ul v-if="showOpen && reminders.list.length" class="space-y-3">
      <li v-for="r in reminders.list" :key="r.key" class="card">
        <div class="flex items-center gap-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl text-white" :style="{ background: looks[r.kind].color }">
            <component :is="looks[r.kind].icon" :size="20" :stroke-width="2.2" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold">{{ r.title }}</p>
            <p class="truncate text-xs text-muted">{{ r.detail }}</p>
          </div>
          <span v-if="r.amount != null" class="font-semibold">${{ fmt(r.amount) }}</span>
          <button v-if="r.kind === 'upcoming'" class="icon-btn size-9" aria-label="封存" title="封存" @click="archive(r)">
            <X :size="16" />
          </button>
        </div>
        <div v-if="r.pending" class="mt-3 flex gap-2">
          <button class="btn btn-ghost btn-sm flex-1" @click="resolveOccurrence(r.pending, false)">略過這次</button>
          <button class="btn btn-primary btn-sm flex-1" @click="resolveOccurrence(r.pending, true)">入帳</button>
        </div>
        <div v-else-if="r.link" class="mt-3 flex gap-2">
          <button class="btn btn-soft btn-sm flex-1" @click="router.push(r.link)">
            {{ r.kind === 'daily' ? '現在記一筆' : '查看' }}
          </button>
          <button v-if="r.kind === 'card' || r.kind === 'loan'" class="icon-btn size-9" aria-label="封存" title="封存" @click="archive(r)">
            <X :size="16" />
          </button>
        </div>
      </li>
    </ul>
    <div v-else-if="showOpen" class="card py-12 text-center text-sm text-muted">
      目前沒有需要處理的事項
      <p class="mt-2 text-xs">這裡會出現待確認的週期交易、信用卡繳款與借款到期日</p>
    </div>

    <section class="mt-6">
      <button class="flex w-full items-center justify-between px-1 text-sm font-semibold text-muted" @click="showArchive = !showArchive">
        <span>已結束的提醒（{{ reminders.archive.length }}）</span>
        <ChevronDown :size="16" class="transition-transform" :class="showArchive && 'rotate-180'" />
      </button>
      <template v-if="showArchive">
        <p class="mt-1 px-1 text-xs text-muted">處理完或封存的提醒會留在這裡 {{ ARCHIVE_DAYS }} 天，之後自動清掉。</p>
        <ul v-if="reminders.archive.length" class="card mt-3 divide-y divide-line p-0">
          <li v-for="a in reminders.archive" :key="`${a.key}-${a.endedAt}`" class="flex items-center gap-3 px-4 py-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-xl text-white opacity-70" :style="{ background: looks[a.kind].color }">
              <component :is="looks[a.kind].icon" :size="18" :stroke-width="2.2" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ a.title }}</p>
              <p class="truncate text-xs text-muted">
                {{ dayLabel(a.endedAt) }} {{ a.how === 'archived' ? '封存' : '已結束' }}，還保留 {{ daysLeft(a) }} 天
              </p>
            </div>
            <span v-if="a.amount != null" class="text-sm text-muted">${{ fmt(a.amount) }}</span>
            <button v-if="a.how === 'archived'" class="text-xs font-medium text-primary" @click="reminders.restore(a)">復原</button>
            <button class="text-xs text-muted" @click="reminders.forget(a.endedAt, a.key)">刪除</button>
          </li>
        </ul>
        <p v-else class="card mt-3 py-8 text-center text-sm text-muted">沒有已結束的提醒</p>
      </template>
    </section>

  </div>
</template>
