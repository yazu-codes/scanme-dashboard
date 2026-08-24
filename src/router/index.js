import { createRouter, createWebHistory } from 'vue-router'
import LoginPage from '../pages/LoginPage.vue'
import CallbackPage from '../pages/CallbackPage.vue'
import TicketsPage from '../pages/TicketsPage.vue'
import { authService } from '@/api/auth'
import MenuDashboardPage from '../pages/MenuDashboardPage.vue'

const routes = [
  { path: '/login', name: 'Login', component: LoginPage },
  { path: '/callback', name: 'Callback', component: CallbackPage },
  {
    path: '/',
    name: 'Dashboard',
    component: MenuDashboardPage,
    meta: { requiresAuth: false, navLabel: 'Dashboard', navIcon: 'pi pi-ticket' }
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  if (to.meta.requiresAuth && !authService.isAuthenticated()) {
    next('/login')
  } else {
    next()
  }
})

// Expose routes that should appear in the nav menu
export const navRoutes = routes.filter(r => r.meta?.navLabel)

export default router