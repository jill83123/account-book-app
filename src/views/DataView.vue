<script setup lang="ts">
import { ref } from 'vue'
import { Download, Trash2, Upload } from '@/lib/uiIcons'
import { db } from '@/db'
import { TABLES } from '@/db/types'
import { download, exportBackup, importBackup } from '@/lib/backup'
import { exportAllCsv } from '@/lib/csv'
import { today } from '@/lib/date'
import { hasDemo, loadDemo } from '@/lib/demo'
import { useUi } from '@/stores/ui'
import PageHeader from '@/components/PageHeader.vue'

const ui = useUi()

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

async function wipe() {
  if (!(await ui.confirm('清除這台裝置的所有資料？', { message: '只會清除這台裝置上的資料與設定。\n已同步的 Google 試算表不會被刪除，重新登入後可以取回。', danger: true, confirmText: '清除' }))) return
  await db.transaction('rw', db.tables, async () => {
    for (const t of TABLES) await db[t].clear()
    await db.images.clear()
  })
  localStorage.clear()
  location.reload()
}
</script>

<template>
  <div>
    <PageHeader title="備份與資料" />

    <h2 class="section-title">備份</h2>
    <section class="card mb-5 space-y-3">
      <p class="text-xs text-muted">把所有記錄存成一個檔案，換手機或重裝時可以匯入回來。</p>
      <div class="grid grid-cols-2 gap-3">
        <button class="btn btn-soft" @click="exportData"><Download :size="16" />匯出 JSON</button>
        <label class="btn btn-soft"><Upload :size="16" />匯入<input type="file" accept="application/json,.json" class="hidden" @change="onImport" /></label>
      </div>
    </section>

    <h2 class="section-title">匯出成表格</h2>
    <section class="card mb-5 space-y-3">
      <p class="text-xs text-muted">所有記帳與借款存成一個 CSV，可以用 Excel 或試算表開啟，用「類型」欄分辨。</p>
      <button class="btn btn-soft w-full" @click="exportCsvFile"><Download :size="16" />匯出 CSV</button>
    </section>

    <h2 class="section-title">範例資料</h2>
    <section class="card mb-5 space-y-3">
      <p class="text-xs text-muted">
        放進約兩個月的假記錄：飲食、交通、購物、股票、保險攤提，還有分期、借款與一個旅行帳本，用來看每個畫面長什麼樣子。
      </p>
      <button class="btn btn-soft w-full" :disabled="loadingDemo" @click="addDemo">載入範例資料</button>
    </section>

    <h2 class="section-title">清除</h2>
    <section class="card space-y-3">
      <p class="text-xs text-muted">只會清除這台裝置上的資料，已同步的 Google 試算表不會被刪除。</p>
      <button class="btn btn-ghost w-full text-danger" @click="wipe"><Trash2 :size="16" />清除這台裝置的資料</button>
    </section>
  </div>
</template>
