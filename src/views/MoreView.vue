<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Bell,
  BookMarked,
  CalendarClock,
  Cloud,
  Coins,
  HandCoins,
  Hourglass,
  Layers,
  DatabaseBackup,
  Download,
  RefreshCw,
  Palette,
  ScanLine,
  Store,
  Users,
} from '@/lib/uiIcons'
import { useCurrencyEntries } from '@/lib/customCurrency'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useMembers } from '@/stores/members'
import { usePwa } from '@/stores/pwa'
import { useSync } from '@/stores/sync'
import { useUi } from '@/stores/ui'
import MenuRow from '@/components/MenuRow.vue'
import DailySettings from '@/components/DailySettings.vue'
import AppearanceSettings from '@/components/AppearanceSettings.vue'

const version = __APP_VERSION__
const router = useRouter()
const data = useData()
const currencies = useCurrencyEntries()
const { s } = useSettings()
const sync = useSync()
const pwa = usePwa()
const members = useMembers()
const ui = useUi()

async function checkUpdate() {
  try {
    if (!(await pwa.checkNow())) ui.toast('已經是最新版本', 'success')
  } catch (err) {
    ui.toast(err instanceof Error ? err.message : '檢查更新失敗', 'error')
  }
}

const installSub = computed(() =>
  pwa.installed ? '已安裝，現在就是以應用程式開啟' : pwa.installEvent ? '加到主畫面，像一般 App 一樣開啟' : pwa.isIos ? '用 Safari 加到主畫面' : '加到主畫面，像一般 App 一樣開啟',
)

async function install() {
  if (pwa.installEvent) return pwa.install()
  await ui.confirm('安裝為應用程式', {
    message: pwa.isIos
      ? '在 Safari 點下方的分享按鈕，再選加入主畫面。'
      : '在瀏覽器選單裡選安裝應用程式，或加到主畫面。\n如果找不到，請用 Chrome、Edge 或 Safari 開啟。',
    confirmText: '知道了',
  })
}

const amortSub = computed(() => {
  const n = data.records.reduce((c, r) => c + r.lines.filter((l) => (l.amortMonths ?? 1) > 1).length, 0)
  return n ? `${n} 筆攤提中，把大額支出分月計算` : '把大額支出分月計算'
})

const syncSub = computed(() => {
  if (sync.syncing) return '同步中'
  if (!s.workerUrl) return '尚未設定'
  if (!sync.signedIn) return '尚未登入 Google'
  if (sync.error) return sync.error
  return sync.unsynced ? '有尚未同步的變更' : '已同步'
})

const shownCurrencies = computed(() => currencies.value.filter((c) => c.shown).length)

const groups = computed(() => [
  {
    title: '記帳設定',
    rows: [
      { to: '/more/ledgers', icon: BookMarked, title: '帳本', sub: `${data.ledgers.length} 個帳本，設定每月預算` },
      { to: '/more/categories', icon: Layers, title: '分類', sub: '分類、子分類、圖示與預算' },
      { to: '/more/merchants', icon: Store, title: '商家與品項', sub: `${data.merchants.length} 個商家` },
      { to: '/more/currencies', icon: Coins, title: '幣別', sub: `${shownCurrencies.value} 個顯示中，也可以自己新增` },
      { to: '/more/members', icon: Users, title: '成員', sub: members.list.length ? `${members.list.length} 位，記帳時可以選和誰一起` : '記帳時選和誰一起花的' },
    ],
  },
  {
    title: '自動化與借貸',
    rows: [
      { to: '/more/recurring', icon: CalendarClock, title: '週期與分期', sub: `${data.recurrings.length} 個排程` },
      { to: '/more/amort', icon: Hourglass, title: '攤提', sub: amortSub.value },
      { to: '/more/loans', icon: HandCoins, title: '借款', sub: '借出、借入與還款進度' },
    ],
  },
  {
    title: '資料與整合',
    rows: [
      { to: '/more/sync', icon: Cloud, title: 'Google 試算表同步', sub: syncSub.value },
      { to: '/more/data', icon: DatabaseBackup, title: '備份與資料', sub: '匯出、匯入、範例資料' },
      { to: '/more/ai', icon: ScanLine, title: 'AI 發票辨識', sub: s.geminiKey || s.workerUrl ? `Gemini：${s.geminiModel}` : '設定 Gemini 金鑰，或使用提詞' },
    ],
  },
  {
    title: 'App 相關',
    rows: [],
  },
])

// these two open in place instead of on a page of their own
const openKey = ref<'daily' | 'look' | ''>('')
const toggle = (k: 'daily' | 'look') => (openKey.value = openKey.value === k ? '' : k)
const dailySub = computed(() => (s.remindEnabled ? `每天 ${s.remindTime} 提醒` : '尚未開啟'))
const themeLabel = computed(() => ({ system: '跟隨系統', light: '淺色', dark: '深色' })[s.theme])
</script>

<template>
  <div>
    <header class="sticky top-0 z-20 -mx-4 bg-bg/85 px-4 backdrop-blur mb-3 flex min-h-14 items-center justify-center py-2">
      <h1 class="text-xl font-bold">更多</h1>
    </header>
    <section v-for="g in groups" :key="g.title" class="mb-5 last:mb-0">
      <h2 class="section-title">{{ g.title }}</h2>
      <div class="card divide-y divide-line p-0">
        <MenuRow
          v-for="r in g.rows"
          :key="r.to"
          :icon="r.icon"
          :title="r.title"
          :sub="r.sub"
         
          @click="router.push(r.to)"
        />
        <template v-if="g.title === 'App 相關'">
          <div>
            <!-- the switch is the first line inside the fold -->
            <MenuRow :icon="Bell" title="每日記帳提醒" :sub="dailySub" :open="openKey === 'daily'" @click="toggle('daily')" />
            <div class="grid transition-[grid-template-rows] duration-200" :class="openKey === 'daily' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'" :inert="openKey !== 'daily'">
              <div class="overflow-hidden"><DailySettings /></div>
            </div>
          </div>
          <div>
            <MenuRow :icon="Palette" title="外觀" :sub="`${themeLabel}・主題色`" :open="openKey === 'look'" @click="toggle('look')" />
            <div class="grid transition-[grid-template-rows] duration-200" :class="openKey === 'look' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'" :inert="openKey !== 'look'">
              <div class="overflow-hidden"><AppearanceSettings /></div>
            </div>
          </div>
          <div v-if="!pwa.installed" class="flex items-center gap-3 px-4 py-3.5">
            <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-white">
              <Download :size="20" :stroke-width="2.3" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-medium">安裝為應用程式</span>
              <span class="block truncate text-xs text-muted">{{ installSub }}</span>
            </span>
            <button class="btn btn-soft shrink-0 whitespace-nowrap px-4 py-2" @click="install">安裝</button>
          </div>
          <div class="flex items-center gap-3 px-4 py-3.5">
            <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-white">
              <RefreshCw :size="20" :stroke-width="2.3" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-medium">版本更新</span>
              <span class="block truncate text-xs text-muted">{{ pwa.needRefresh ? '新版本已下載' : version }}</span>
            </span>
            <button v-if="pwa.needRefresh" class="btn btn-primary shrink-0 whitespace-nowrap px-4 py-2" @click="pwa.update()">更新</button>
            <button v-else class="btn btn-soft shrink-0 whitespace-nowrap px-4 py-2" :disabled="pwa.checking" @click="checkUpdate">
              {{ pwa.checking ? '檢查中…' : '檢查' }}
            </button>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>
