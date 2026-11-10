<script setup lang="ts">
import { fmt } from '@/lib/money'

defineProps<{ n: number }>()
</script>

<template>
  <!-- the dollar sign always sits 1px away from the digits -->
  <span class="mr-px">$</span>{{ fmt(n) }}
</template>
