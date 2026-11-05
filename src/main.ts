import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { groupStarterIncome, moveOtherLast, recolorStarterLedger, refreshStarterCategories, seedIfEmpty, splitInterestIncome, STARTER_VERSION } from './lib/seed'
import { migratePalette, PALETTE_VERSION } from './lib/palette'
import { autoPostDue } from './lib/recurrence'
import { useSettings } from './stores/settings'
import { useData } from './stores/data'
import { useSync } from './stores/sync'
import { usePush } from './stores/push'

const app = createApp(App)
app.use(createPinia())

const settings = useSettings()
if (await seedIfEmpty()) settings.s.seeded = true
if (settings.s.palette < PALETTE_VERSION) {
  await migratePalette()
  settings.s.palette = PALETTE_VERSION
}
if (!settings.s.otherLast) {
  await moveOtherLast()
  settings.s.otherLast = true
}
if (!settings.s.ledgerTeal) {
  await recolorStarterLedger()
  settings.s.ledgerTeal = true
}
// an earlier build stored `true` here, which counts as version 1
if (Number(settings.s.catRefresh) < STARTER_VERSION) {
  await refreshStarterCategories()
  settings.s.catRefresh = STARTER_VERSION
}
if (!settings.s.incomeGroups) {
  await groupStarterIncome()
  settings.s.incomeGroups = true
}
if (!settings.s.incomeInterest) {
  await splitInterestIncome()
  settings.s.incomeInterest = true
}
await autoPostDue()
useData().start()
useSync().init()
usePush().init()

app.use(router)
app.mount('#app')
