<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ChevronDown, Download, LoaderCircle, RotateCcw, LogIn, LogOut, RefreshCw, Sparkles, TableProperties, Trash2, Upload } from '@/lib/uiIcons'
import { db } from '@/db'
import { TABLES } from '@/db/types'
import { download, exportBackup, importBackup } from '@/lib/backup'
import { exportAllCsv } from '@/lib/csv'
import { today } from '@/lib/date'
import { hasDemo, loadDemo } from '@/lib/demo'
import { setWorkerUrl } from '@/lib/google/gis'
import { stopSavingSettings, useSettings } from '@/stores/settings'
import { useSync } from '@/stores/sync'
import { useUi } from '@/stores/ui'
import PageHeader from '@/components/PageHeader.vue'

const ui = useUi()
const settings = useSettings()
const sync = useSync()

const lastSync = computed(() => (settings.s.lastSyncAt ? new Date(settings.s.lastSyncAt).toLocaleString('zh-TW', { hour12: false }) : '尚未同步'))

const syncHint = computed(() => {
  if (!settings.s.workerUrl.trim()) return '設定方式請參考 README'
  return `上次同步：${lastSync.value}${sync.unsynced && sync.signedIn ? '（有尚未同步的變更）' : ''}`
})

async function connect() {
  if (!settings.s.workerUrl.trim()) return ui.toast('請先填入同步服務網址', 'error')
  settings.s.workerUrl = settings.s.workerUrl.trim().replace(/\/+$/, '')
  setWorkerUrl(settings.s.workerUrl)
  try {
    await sync.connect(true)
    await sync.sync({ loud: true })
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : String(e), 'error')
  }
}

async function disconnect() {
  if (!(await ui.confirm('中斷 Google 連線？', { message: '這台裝置會登出 Google。雲端的資料不會被刪除，之後重新登入會自動找回。', confirmText: '中斷連線' }))) return
  await sync.disconnect()
}

const backupsOpen = ref(false)
const backupGroups = computed(() =>
  (['auto', 'manual'] as const)
    .map((kind) => ({ kind, label: kind === 'auto' ? '自動備份' : '手動備份', rows: sync.backups.filter((b) => b.kind === kind) }))
    .filter((g) => g.rows.length),
)
const backupsOn = computed(() => sync.signedIn && Boolean(settings.s.workerUrl))
const when = (t: number) => new Date(t).toLocaleString('zh-TW', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

function loadBackups() {
  if (backupsOn.value) sync.refreshBackups().catch((e) => ui.toast(e instanceof Error ? e.message : String(e), 'error'))
}
onMounted(loadBackups)
watch(backupsOn, loadBackups)

async function backupNow() {
  try {
    await sync.backupNow()
    ui.toast('已備份', 'success')
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : String(e), 'error')
  }
}

async function restore(id: string) {
  if (!(await ui.confirm('還原這份備份？', { message: '目前的資料會被備份的內容取代，還原前會先自動備份目前的資料。', danger: true, confirmText: '還原' }))) return
  try {
    await sync.restoreBackup(id)
    ui.toast('已還原', 'success')
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : String(e), 'error')
  }
}

async function exportData() {
  download(`記帳本備份-${today()}.json`, await exportBackup())
}

async function exportCsvFile() {
  download(`記帳本-${today()}.csv`, await exportAllCsv(), 'text/csv;charset=utf-8')
}

async function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!(await ui.confirm('用備份檔取代目前的資料？', { message: '這台裝置現有的記錄會被備份檔的內容取代。如果已連線 Google，下次同步也會同步過去。', danger: true, confirmText: '取代' }))) return
  try {
    const n = await importBackup(await file.text())
    ui.toast(`已匯入 ${n} 筆資料`, 'success')
  } catch (err) {
    ui.toast(err instanceof Error ? err.message : String(err), 'error')
  }
}

const loadingDemo = ref(false)

async function addDemo() {
  if (
    (await hasDemo()) &&
    !(await ui.confirm('重新載入範例資料？', {
      message: '會用新的範例記錄覆蓋之前載入的那一批，你自己記的資料不受影響。',
      confirmText: '重新載入',
    }))
  )
    return
  loadingDemo.value = true
  try {
    const n = await loadDemo()
    ui.toast(`已加入 ${n} 筆範例記錄`, 'success')
  } catch (err) {
    ui.toast(err instanceof Error ? err.message : String(err), 'error')
  } finally {
    loadingDemo.value = false
  }
}

const wiping = ref(false)

async function wipe(withCloud = false) {
  if (withCloud) {
    if (!(await ui.confirm('連同 Google 雲端一起重置？', { message: '會把這台裝置的資料，以及存在 Google 雲端的資料和照片刪除，其他裝置同步後也會變空。\n雲端備份會保留，重置後登入就能從備份還原。', danger: true, confirmText: '全部重置' }))) return
    wiping.value = true
    try {
      await sync.wipeCloud()
    } catch (err) {
      ui.toast(err instanceof Error ? err.message : String(err), 'error')
      wiping.value = false
      return
    }
  } else if (!(await ui.confirm('重置這台裝置的所有資料與設定？', { message: '資料與設定全部清掉，回到初始狀態。\n已同步的雲端資料不會被刪除，重新登入後可以取回。', danger: true, confirmText: '重置' }))) return
  await db.transaction('rw', db.tables, async () => {
    for (const t of TABLES) await db[t].clear()
    await db.images.clear()
  })
  // resetting the cloud too should not log this device out of Google: keep the sign-in and the worker address it needs
  const keep = withCloud
    ? {
        token: localStorage.getItem('ab.google.token'),
        refresh: localStorage.getItem('ab.google.refresh'),
        workerUrl: sync.signedIn ? settings.s.workerUrl : '',
      }
    : null
  stopSavingSettings()
  localStorage.clear()
  if (keep) {
    if (keep.token) localStorage.setItem('ab.google.token', keep.token)
    if (keep.refresh) localStorage.setItem('ab.google.refresh', keep.refresh)
    if (keep.workerUrl) localStorage.setItem('ab.settings', JSON.stringify({ workerUrl: keep.workerUrl }))
  }
  location.reload()
}
</script>

<template>
  <div>
    <PageHeader title="同步與備份" />

    <h2 class="section-title">Google 雲端同步</h2>
    <section class="card mb-5 space-y-3">
      <!-- who is connected and when it last synced -->
      <div class="flex items-center gap-3">
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2.5 font-semibold">
            <span class="size-2 rounded-full" :class="sync.signedIn && settings.s.workerUrl ? 'bg-success' : 'bg-muted/50'" />
            {{ sync.signedIn && settings.s.workerUrl ? '已連線' : '尚未連線' }}
          </p>
          <p class="pl-[1.125rem] text-xs text-muted">
            {{ syncHint }}
          </p>
        </div>
        <button v-if="!(sync.signedIn && settings.s.workerUrl)" class="btn btn-primary shrink-0 whitespace-nowrap px-4 py-2" :disabled="!settings.s.workerUrl.trim()" @click="connect"><LogIn :size="16" />登入 Google</button>
      </div>
      <p v-if="sync.error" class="rounded-2xl bg-danger/10 p-3 text-sm text-danger">{{ sync.error }}</p>

      <!-- only needed to connect; disconnecting keeps the address so signing in again is one tap -->
      <input v-if="!(sync.signedIn && settings.s.workerUrl)" v-model="settings.s.workerUrl" class="input" placeholder="https://account-book-auth.xxx.workers.dev" aria-label="同步服務網址（Cloudflare Worker）" inputmode="url" autocapitalize="off" />

      <div v-if="sync.signedIn" class="flex gap-2">
        <button class="btn btn-ghost shrink-0" @click="disconnect"><LogOut :size="16" />中斷連線</button>
        <button v-if="settings.s.workerUrl" class="btn btn-primary flex-1" :disabled="sync.syncing" @click="sync.sync({ loud: true })">
          <LoaderCircle v-if="sync.syncing" :size="16" class="animate-spin" /><RefreshCw v-else :size="16" />立即同步
        </button>
      </div>

      <div v-if="backupsOn" class="mt-4 border-t border-line pt-3" :class="!backupsOpen && 'pb-[3px]'">
        <button class="flex w-full items-center gap-2 text-left" :aria-expanded="backupsOpen" @click="backupsOpen = !backupsOpen">
          <span class="min-w-0 flex-1"><span class="block font-medium">歷史備份</span><span class="block text-xs text-muted">每天自動備份，各留最近 3 份</span></span>
          <ChevronDown :size="18" class="shrink-0 text-muted transition-transform" :class="backupsOpen && 'rotate-180'" />
        </button>
        <div v-if="backupsOpen" class="mt-3 -mb-[5px] space-y-1">
          <button class="btn btn-soft w-full" :disabled="sync.backingUp" @click="backupNow">立即備份</button>
          <template v-for="g in backupGroups" :key="g.kind">
            <p class="-mb-1! pt-3 text-xs font-medium text-muted">{{ g.label }}</p>
            <div class="divide-y divide-line">
              <div v-for="b in g.rows" :key="b.id" class="flex items-center gap-2 py-2">
                <span class="min-w-0 flex-1"><span class="block text-sm font-medium">{{ when(b.time) }}</span><span class="block text-xs text-muted">{{ b.records }} 筆記錄</span></span>
                <button class="icon-btn size-9 border-0 bg-transparent text-muted" :disabled="sync.backingUp" aria-label="還原" title="還原" @click="restore(b.id)"><RotateCcw :size="18" /></button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </section>

    <h2 class="section-title">備份</h2>
    <div class="card mb-5 divide-y divide-line p-0">
      <div class="flex items-center gap-3 px-4 py-3.5">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-white"><Download :size="20" :stroke-width="2.3" /></span>
        <span class="min-w-0 flex-1"><span class="block font-medium">匯出備份</span><span class="block text-xs text-muted">存成一個 JSON 檔，換手機或重裝時用</span></span>
        <button class="btn btn-soft shrink-0 whitespace-nowrap px-4 py-2" @click="exportData">匯出</button>
      </div>
      <div class="flex items-center gap-3 px-4 py-3.5">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-white"><Upload :size="20" :stroke-width="2.3" /></span>
        <span class="min-w-0 flex-1"><span class="block font-medium">匯入備份</span><span class="block text-xs text-muted">用備份檔取代目前的資料</span></span>
        <label class="btn btn-soft shrink-0 cursor-pointer whitespace-nowrap px-4 py-2">匯入<input type="file" accept="application/json,.json" class="hidden" @change="onImport" /></label>
      </div>
    </div>

    <h2 class="section-title">匯出成表格</h2>
    <div class="card mb-5 p-0">
      <div class="flex items-center gap-3 px-4 py-3.5">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-white"><TableProperties :size="20" :stroke-width="2.3" /></span>
        <span class="min-w-0 flex-1"><span class="block font-medium">匯出 CSV</span><span class="block text-xs text-muted">記帳與借款，可用 Excel 開啟</span></span>
        <button class="btn btn-soft shrink-0 whitespace-nowrap px-4 py-2" @click="exportCsvFile">匯出</button>
      </div>
    </div>

    <h2 class="section-title">其他</h2>
    <div class="card mb-5 p-0">
      <div class="flex items-center gap-3 px-4 py-3.5">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-white"><Sparkles :size="20" :stroke-width="2.3" /></span>
        <span class="min-w-0 flex-1"><span class="block font-medium">載入範例資料</span><span class="block text-xs text-muted">約兩個月的假記錄，看各畫面的樣子</span></span>
        <button class="btn btn-soft shrink-0 whitespace-nowrap px-4 py-2" :disabled="loadingDemo" @click="addDemo">載入</button>
      </div>
    </div>

    <h2 class="section-title">重置</h2>
    <div class="card divide-y divide-line p-0">
      <div class="flex items-center gap-3 px-4 py-3.5">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-danger text-white"><Trash2 :size="20" :stroke-width="2.3" /></span>
        <template v-if="sync.signedIn && settings.s.workerUrl">
          <span class="min-w-0 flex-1"><span class="block font-medium">重置所有資料與設定</span><span class="block text-xs text-muted">含 Google 雲端的資料，雲端備份會保留</span></span>
          <button class="btn btn-ghost shrink-0 whitespace-nowrap px-4 py-2 text-danger" :disabled="wiping" @click="wipe(true)">
            <LoaderCircle v-if="wiping" :size="16" class="animate-spin" />{{ wiping ? '重置中…' : '重置' }}
          </button>
        </template>
        <template v-else>
          <span class="min-w-0 flex-1"><span class="block font-medium">重置所有資料與設定</span><span class="block text-xs text-muted">資料與設定全部清掉，回到初始狀態</span></span>
          <button class="btn btn-ghost shrink-0 whitespace-nowrap px-4 py-2 text-danger" @click="wipe()">重置</button>
        </template>
      </div>
    </div>
  </div>
</template>
