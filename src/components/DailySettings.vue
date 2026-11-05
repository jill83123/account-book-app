<script setup lang="ts">
import { computed, ref } from 'vue'
import { notify } from '@/lib/reminders'
import { usePush } from '@/stores/push'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import TimeField from '@/components/TimeField.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'

const { s } = useSettings()
const ui = useUi()
const push = usePush()

// background push needs the Worker address, the same one the sheet sync uses
const pushOn = computed({
  get: () => s.pushEnabled,
  set: (on: boolean) => {
    if (on && !s.workerUrl.trim()) return ui.toast('請先在「Google 試算表同步」填入同步服務網址', 'error')
    const job = on ? push.enable() : push.disable()
    job.then(
      () => ui.toast(on ? '已開啟背景推播' : '已關閉背景推播'),
      (e: unknown) => ui.toast(e instanceof Error ? e.message : String(e), 'error'),
    )
  },
})

async function sendTest() {
  try {
    await push.test()
    ui.toast('已送出測試通知')
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : String(e), 'error')
  }
}

const permission = ref('Notification' in window ? Notification.permission : 'unsupported')

async function allow() {
  if (!('Notification' in window)) return ui.toast('這個瀏覽器不支援通知', 'error')
  permission.value = await Notification.requestPermission()
  if (permission.value === 'granted') void notify('通知已開啟', '到了每日提醒時間，打開 App 時會提醒你記帳')
}
</script>

<template>
  <div class="space-y-3 pb-4">
    <div class="mx-4 h-px bg-line" />
    <div class="flex items-center justify-between gap-3 px-4">
      <span class="text-sm">每日提醒</span>
      <ToggleSwitch v-model="s.remindEnabled" label="每日提醒" />
    </div>
    <div class="flex items-center justify-between gap-3 px-4">
      <span class="text-sm">提醒時間</span>
      <TimeField v-model="s.remindTime" class="w-28 disabled:opacity-50" title="提醒時間" :disabled="!s.remindEnabled" />
    </div>
    <div v-if="push.supported" class="flex items-center justify-between gap-3 px-4">
      <div class="min-w-0">
        <p class="text-sm">背景推播</p>
        <p class="text-xs text-muted">App 關閉時也會收到</p>
      </div>
      <ToggleSwitch v-model="pushOn" label="背景推播" :disabled="push.busy || !s.remindEnabled" />
    </div>
    <p v-if="permission === 'denied' || permission === 'unsupported'" class="px-4 text-xs text-danger">
      {{ permission === 'denied' ? '通知已被封鎖，請到瀏覽器設定開啟' : '這個瀏覽器不支援通知' }}
    </p>
    <div v-else-if="permission !== 'granted'" class="px-4">
      <button class="btn btn-soft w-full" :disabled="!s.remindEnabled" @click="allow">允許通知</button>
    </div>
    <div v-if="s.pushEnabled" class="px-4">
      <button class="btn btn-soft w-full" :disabled="push.busy || !s.remindEnabled" @click="sendTest">傳一則測試通知</button>
    </div>
    <p v-if="push.error" class="px-4 text-xs text-danger">{{ push.error }}</p>
  </div>
</template>
