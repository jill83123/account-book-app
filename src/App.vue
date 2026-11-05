<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { NavAssets, NavBills, NavMore, NavStats, Plus, RefreshCw } from '@/lib/uiIcons'
import BatchBar from '@/components/BatchBar.vue'
import RecordSheet from '@/components/RecordSheet.vue'
import UiLayer from '@/components/UiLayer.vue'
import { usePwa } from '@/stores/pwa'
import { useReminders } from '@/stores/reminders'
import { useUi } from '@/stores/ui'
import { today } from '@/lib/date'

const route = useRoute()
const router = useRouter()
const ui = useUi()
const pwa = usePwa()
// created up here so finished reminders get archived on every page, not only on the reminders page
useReminders()
const showNav = computed(() => route.meta.nav === true)

const left = [
  { to: '/', label: '帳單', icon: NavBills },
  { to: '/accounts', label: '資產', icon: NavAssets },
]
const right = [
  { to: '/stats', label: '統計', icon: NavStats },
  { to: '/more', label: '更多', icon: NavMore },
]

const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path === to)

function add() {
  const date = route.path === '/' && ui.selectedDate ? ui.selectedDate : today()
  void router.push({ path: '/record/new', query: { date } })
}
</script>

<template>
  <div
    class="mx-auto min-h-dvh w-full max-w-xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
    :class="
      showNav
        ? 'pb-[calc(6.5rem+env(safe-area-inset-bottom))]'
        : 'pb-[calc(2.5rem+env(safe-area-inset-bottom))]'
    "
  >
    <RouterView />
  </div>

  <nav
    v-if="showNav"
    class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
  >
    <div class="mx-auto flex max-w-xl items-center px-2">
      <RouterLink
        v-for="t in left"
        :key="t.to"
        :to="t.to"
        :aria-label="t.label"
        class="flex flex-1 flex-col items-center gap-0.5 py-3 transition-colors"
        :class="isActive(t.to) ? 'text-primary' : 'text-ink/70 hover:text-ink'"
      >
        <component :is="t.icon" :size="27" :stroke-width="isActive(t.to) ? 2.1 : 1.6" />
      </RouterLink>
      <div class="flex flex-1 justify-center">
        <button
          class="-mt-4 grid size-[52px] place-items-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition active:scale-95"
          aria-label="新增記錄"
          @click="add"
        >
          <Plus :size="26" :stroke-width="2.4" />
        </button>
      </div>
      <RouterLink
        v-for="t in right"
        :key="t.to"
        :to="t.to"
        :aria-label="t.label"
        class="flex flex-1 flex-col items-center gap-0.5 py-3 transition-colors"
        :class="isActive(t.to) ? 'text-primary' : 'text-ink/70 hover:text-ink'"
      >
        <component :is="t.icon" :size="27" :stroke-width="isActive(t.to) ? 2.1 : 1.6" />
      </RouterLink>
    </div>
  </nav>

  <div
    v-if="pwa.needRefresh"
    class="fixed inset-x-0 bottom-32 z-40 mx-auto flex max-w-md items-center gap-3 px-4"
    role="status"
  >
    <div class="card flex w-full items-center gap-3 py-3">
      <RefreshCw :size="18" class="shrink-0 text-primary" />
      <span class="flex-1 text-sm font-semibold">有新版本可用</span>
      <button class="text-sm text-muted" @click="pwa.needRefresh = false">稍後</button>
      <button class="btn btn-sm btn-primary" @click="pwa.update()">重新整理</button>
    </div>
  </div>

  <BatchBar />
  <RecordSheet />
  <UiLayer />
</template>
