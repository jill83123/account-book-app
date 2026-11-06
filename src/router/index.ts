import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { nav: true } },
    {
      path: '/accounts',
      name: 'accounts',
      component: () => import('@/views/AccountsView.vue'),
      meta: { nav: true },
    },
    {
      path: '/stats',
      name: 'stats',
      component: () => import('@/views/StatsView.vue'),
      meta: { nav: true },
    },
    {
      path: '/more',
      name: 'more',
      component: () => import('@/views/MoreView.vue'),
      meta: { nav: true },
    },
    { path: '/more/ledgers', component: () => import('@/views/LedgersView.vue') },
    { path: '/more/categories', component: () => import('@/views/CategoriesView.vue') },
    { path: '/more/merchants', component: () => import('@/views/MerchantsView.vue') },
    { path: '/more/currencies', component: () => import('@/views/CurrenciesView.vue') },
    { path: '/more/members', component: () => import('@/views/MembersView.vue') },
    { path: '/more/recurring', component: () => import('@/views/RecurringView.vue') },
    { path: '/more/loans', component: () => import('@/views/LoansView.vue') },
    { path: '/more/amort', component: () => import('@/views/AmortView.vue') },
    { path: '/more/sync', component: () => import('@/views/SyncView.vue') },
    { path: '/more/ai', component: () => import('@/views/AiView.vue') },
    { path: '/more/daily', redirect: '/more' },
    { path: '/more/appearance', redirect: '/more' },
    { path: '/more/data', component: () => import('@/views/DataView.vue') },
    { path: '/more/about', redirect: '/more' },
    { path: '/more/general', redirect: '/more' },
    { path: '/reminders', component: () => import('@/views/RemindersView.vue') },
    { path: '/search', component: () => import('@/views/SearchView.vue') },
    { path: '/account/:id', component: () => import('@/views/AccountDetailView.vue') },
    { path: '/record/:id', component: () => import('@/views/RecordEditView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(_to, _from, saved) {
    return saved ?? { top: 0 }
  },
})

export default router
