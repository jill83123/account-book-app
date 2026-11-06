<script setup lang="ts">
import { useSettings } from '@/stores/settings'
import PageHeader from '@/components/PageHeader.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'

const { s } = useSettings()
</script>

<template>
  <div>
    <PageHeader title="統計設定" />

    <div class="card flex items-center justify-between gap-3 px-4 py-3.5">
      <span class="font-semibold">報表分月計算</span>
      <ToggleSwitch v-model="s.amortize" label="報表分月計算" />
    </div>
    <p class="mt-3 px-1 text-sm text-muted">
      開啟後，設定了攤提的支出會平均分到之後每個月，統計和試算表的月報都會這樣算。現金還是在付款那天扣。
    </p>
  </div>
</template>
