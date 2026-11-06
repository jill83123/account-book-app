<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, ExternalLink, LoaderCircle, LogIn, LogOut, RefreshCw, Sparkles, TableProperties, Trash2, Upload } from '@/lib/uiIcons'
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

const sheetUrl = computed(() => sync.url || (settings.s.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${settings.s.spreadsheetId}/edit` : ''))
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
  if (!(await ui.confirm('中斷 Google 連線？', { message: '這台裝置會登出並忘記試算表。試算表本身和裡面的資料不會被刪除，之後重新登入會自動找回。', confirmText: '中斷連線' }))) return
  await sync.disconnect()
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
    if (!(await ui.confirm('連同 Google 雲端一起重置？', { message: '會把這台裝置的資料，以及 Google 雲端硬碟裡這個 App 建立的試算表和照片移到垃圾桶，其他裝置同步後也會變空。\n垃圾桶可保留 30 天，期間可以從 Google 雲端硬碟救回。', danger: true, confirmText: '全部重置' }))) return
    wiping.value = true
    try {
      await sync.wipeCloud()
    } catch (err) {
      ui.toast(err instanceof Error ? err.message : String(err), 'error')
      wiping.value = false
      return
    }
  } else if (!(await ui.confirm('重置這台裝置的所有資料與設定？', { message: '資料與設定全部清掉，回到初始狀態。\n已同步的 Google 試算表不會被刪除，重新登入後可以取回。', danger: true, confirmText: '重置' }))) return
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

    <h2 class="section-title">Google 試算表同步</h2>
    <section class="card mb-5 space-y-3">
      <!-- who is connected and when it last synced; the sheet itself opens from the corner -->
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
        <a
          v-if="sync.signedIn && settings.s.workerUrl && sheetUrl"
          :href="sheetUrl"
          target="_blank"
          rel="noopener"
          class="circle-btn text-muted"
          aria-label="開啟試算表"
          title="開啟試算表"
        >
          <ExternalLink :size="20" />
        </a>
        <button v-else-if="!(sync.signedIn && settings.s.workerUrl)" class="btn btn-primary shrink-0 whitespace-nowrap px-4 py-2" :disabled="!settings.s.workerUrl.trim()" @click="connect"><LogIn :size="16" />登入 Google</button>
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
      <div v-if="sync.signedIn && settings.s.workerUrl" class="flex items-center gap-3 px-4 py-3.5">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-white"><RefreshCw :size="20" :stroke-width="2.3" /></span>
        <span class="min-w-0 flex-1"><span class="block font-medium">重建試算表分頁</span><span class="block text-xs text-muted">把雲端試算表的分頁重新整理</span></span>
        <button class="btn btn-soft shrink-0 whitespace-nowrap px-4 py-2" :disabled="sync.syncing" @click="sync.sync({ loud: true, forceViews: true })">重建</button>
      </div>
      <div class="flex items-center gap-3 px-4 py-3.5">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-danger text-white"><Trash2 :size="20" :stroke-width="2.3" /></span>
        <template v-if="sync.signedIn && settings.s.workerUrl">
          <span class="min-w-0 flex-1"><span class="block font-medium">重置所有資料與設定</span><span class="block text-xs text-muted">含 Google 雲端，雲端資料先移到垃圾桶</span></span>
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
