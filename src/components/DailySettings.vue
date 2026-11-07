<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { markLocalChange } from '@/db'
import { LoaderCircle } from '@/lib/uiIcons'
import { usePush } from '@/stores/push'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import TimeField from '@/components/TimeField.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'

const { s } = useSettings()
const ui = useUi()
const push = usePush()
const router = useRouter()

const permissionDenied = ref('Notification' in window && Notification.permission === 'denied')

// the reminder is a background push, so turning it on subscribes this device
async function toggle(on: boolean) {
  if (on && !s.workerUrl.trim()) {
    const go = await ui.confirm('尚未設定同步服務網址', {
      message: '每日提醒由同步服務（Cloudflare Worker）送出，請先到 Google 試算表同步頁填入網址。',
      confirmText: '前往設定',
    })
    if (go) router.push('/more/data')
    return
  }
  try {
    if (on) await push.enable()
    else await push.disable()
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : String(e), 'error')
  }
  permissionDenied.value = 'Notification' in window && Notification.permission === 'denied'
}

// the reminder time is shared through the sheet, so changing it counts as a change to sync
const remindTime = computed({
  get: () => s.remindTime,
  set: (t: string) => {
    s.remindTime = t
    s.remindTimeAt = Date.now()
    markLocalChange()
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
</script>

<template>
  <div class="space-y-4 pb-4">
    <div class="mx-4 h-px bg-line" />
    <p v-if="!push.supported" class="px-4 text-xs text-danger">這個瀏覽器不支援推播通知，iPhone 請先加入主畫面再開啟</p>
    <div class="flex items-center justify-between gap-3 px-4">
      <div class="min-w-0">
        <p class="text-sm">每日提醒</p>
        <p v-if="permissionDenied" class="text-xs text-danger">通知已被封鎖，請到瀏覽器設定開啟</p>
        <p v-else-if="push.error" class="text-xs text-danger">{{ push.error }}</p>
      </div>
      <ToggleSwitch :model-value="s.remindEnabled" label="每日提醒" :disabled="push.busy" @update:model-value="toggle" />
    </div>
    <div class="flex items-center justify-between gap-3 px-4">
      <span class="text-sm">提醒時間</span>
      <TimeField v-model="remindTime" class="w-28 disabled:opacity-50" title="提醒時間" :disabled="!s.remindEnabled" />
    </div>
    <div v-if="s.remindEnabled" class="px-4">
      <button class="btn btn-soft w-full" :disabled="push.busy" @click="sendTest"><LoaderCircle v-if="push.busy" :size="16" class="animate-spin" />傳一則測試通知</button>
    </div>
  </div>
</template>
