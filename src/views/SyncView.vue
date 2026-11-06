<script setup lang="ts">
import { computed, ref } from 'vue'
import { ExternalLink, LoaderCircle, LogIn, LogOut, RefreshCw } from '@/lib/uiIcons'
import { setWorkerUrl } from '@/lib/google/gis'
import { useSettings } from '@/stores/settings'
import { useSync } from '@/stores/sync'
import { useUi } from '@/stores/ui'
import PageHeader from '@/components/PageHeader.vue'

const { s } = useSettings()
const sync = useSync()
const ui = useUi()

const sheetUrl = computed(() => sync.url || (s.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${s.spreadsheetId}/edit` : ''))
const lastSync = computed(() => (s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString('zh-TW', { hour12: false }) : '尚未同步'))

async function connect() {
  if (!s.workerUrl.trim()) return ui.toast('請先填入同步服務網址', 'error')
  s.workerUrl = s.workerUrl.trim().replace(/\/+$/, '')
  setWorkerUrl(s.workerUrl)
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
</script>

<template>
  <div>
    <PageHeader title="Google 試算表同步" />

    <section class="card mb-4 space-y-3">
      <!-- who is connected and when it last synced; the sheet itself opens from the corner -->
      <div class="flex items-center gap-3">
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2.5 font-semibold">
            <span class="size-2 rounded-full" :class="sync.signedIn && s.workerUrl ? 'bg-success' : 'bg-muted/50'" />
            {{ sync.signedIn && s.workerUrl ? '已連線' : '尚未連線' }}
          </p>
          <p class="pl-[1.125rem] text-xs text-muted">上次同步：{{ lastSync }}{{ sync.unsynced && sync.signedIn ? '（有尚未同步的變更）' : '' }}</p>
        </div>
        <a
          v-if="sync.signedIn && s.workerUrl && sheetUrl"
          :href="sheetUrl"
          target="_blank"
          rel="noopener"
          class="circle-btn text-muted"
          aria-label="開啟試算表"
          title="開啟試算表"
        >
          <ExternalLink :size="20" />
        </a>
      </div>
      <p v-if="sync.error" class="rounded-2xl bg-danger/10 p-3 text-sm text-danger">{{ sync.error }}</p>

      <div class="flex gap-2">
        <button v-if="sync.signedIn && s.workerUrl" class="btn btn-primary flex-1" :disabled="sync.syncing" @click="sync.sync({ loud: true })">
          <LoaderCircle v-if="sync.syncing" :size="16" class="animate-spin" /><RefreshCw v-else :size="16" />立即同步
        </button>
        <button v-else class="btn btn-primary flex-1" @click="connect"><LogIn :size="16" />登入 Google 並建立試算表</button>
        <button v-if="sync.signedIn" class="btn btn-ghost shrink-0" @click="disconnect"><LogOut :size="16" />中斷連線</button>
      </div>

      <!-- rarely needed, so quiet text rather than a button -->
      <button v-if="sync.signedIn" class="mt-4 block w-full border-t border-line pt-3 -mb-1 text-center text-sm text-danger disabled:opacity-40" :disabled="sync.syncing" @click="sync.sync({ loud: true, forceViews: true })">
        重建試算表分頁
      </button>
    </section>

    <section class="card mb-4">
      <label class="label !mb-2.5" for="worker">同步服務網址（Cloudflare Worker）</label>
      <input id="worker" v-model="s.workerUrl" class="input" placeholder="https://account-book-auth.xxx.workers.dev" inputmode="url" autocapitalize="off" />
    </section>

    <section class="card space-y-3 text-[13px] leading-6">
      <h2 class="label">一次性的設定（約 10 分鐘）</h2>
      <ol class="list-decimal space-y-2 pl-5 text-muted marker:text-muted">
        <li>到 Google Cloud Console 建立一個專案（名稱自訂，個人專案即可）。</li>
        <li>在 <b>API 和服務 → 程式庫</b>中啟用 <b class="text-primary-strong">Google Sheets API</b> 與 <b class="text-primary-strong">Google Drive API</b>。</li>
        <li>
          <b>OAuth 同意畫面</b>選<b>外部</b>，把你自己的 Google 帳號加入<b>測試使用者</b>。若想避免授權每 7 天過期，把發布狀態改成<b>正式版</b>（個人使用不需要審核，登入時會看到未驗證的提醒，選<b>進階</b>繼續即可）。
        </li>
        <li>
          在<b>憑證</b>頁建立 OAuth 用戶端 ID，類型選<b>網頁應用程式</b>，<b>已授權的 JavaScript 來源</b>填這個網站的網址（例如
          <code class="rounded bg-surface-2 px-1">https://你的帳號.github.io</code>，開發時再加
          <code class="rounded bg-surface-2 px-1">http://localhost:5173</code>）。
        </li>
        <li>
          部署 <code class="rounded bg-surface-2 px-1">worker/</code> 資料夾裡的 Cloudflare Worker：填入用戶端 ID 與允許的網址，並用
          <code class="rounded bg-surface-2 px-1">wrangler secret put GOOGLE_CLIENT_SECRET</code> 設定用戶端密鑰。它只負責換發長效授權，不會儲存任何資料。
        </li>
        <li>把 Worker 網址貼到上面，按<b>登入 Google 並建立試算表</b>按鈕，授權時要勾選這項權限：<b>查看</b>、編輯、建立及刪除這個應用程式的 Google 雲端硬碟檔案。</li>
      </ol>
      <p class="text-muted">
        （App 只能存取它自己建立的那份試算表，看不到你雲端硬碟裡的其他檔案。）
      </p>
    </section>
  </div>
</template>
