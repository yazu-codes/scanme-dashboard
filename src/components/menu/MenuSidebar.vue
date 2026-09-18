<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'

import Button from 'primevue/button'
import Dialog from 'primevue/dialog'

import AnalyticsEvents from './AnalyticsEvents.vue'

const props = defineProps({
  isAdmin: {
    type: Boolean,
    default: false,
  },
  menus: {
    type: Array,
    default: () => [],
  },

  currentMenuId: {
    type: [
      Number,
      String,
    ],
    default: null,
  },

  loggedIn: {
    type: Boolean,
    default: false,
  },

  currentUser: {
    type: Object,
    default: null,
  },

  apiBase: {
    type: String,
    default: '',
  },

  /*
   * Bearer token for the analytics service. Kept apart
   * from apiBase because the analytics server is its
   * own deployment.
   */
  token: {
    type: String,
    default: null,
  },

  analyticsBase: {
    type: String,
    default:
      import.meta.env.VITE_ANALYTICS_BASE ||
      'https://scanme-analytics-production.up.railway.app',
  },

  /*
   * Leave this alone and the sidebar manages its own
   * drawer. Pass it (v-model:open) and the parent takes
   * over, which is what you want if the hamburger lives
   * in MenuHeader instead.
   */
  open: {
    type: [
      Boolean,
      null,
    ],
    default: null,
  },

  /*
   * Turn off when something else already renders a
   * hamburger, so you don't end up with two.
   */
  showToggle: {
    type: Boolean,
    default: true,
  },

  /*
   * Whether the drawer starts open. Only affects narrow
   * screens; the sidebar is always visible above the
   * breakpoint either way.
   */
  defaultOpen: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits([
  'select',
  'new-menu',
  'toggle-yumm',

  'login',
  'logout',

  'save-api-base',

  'open-codes',
  'open-images',
  'open-users',
  'open-menu-associations',

  'update:open',
])

const showApi =
  ref(false)

const localBase =
  ref(
    props.apiBase
  )

watch(
  () => props.apiBase,
  value => {
    localBase.value =
      value
  }
)

/*
|--------------------------------------------------------------------------
| Drawer
|--------------------------------------------------------------------------
|
| Only does anything below the breakpoint in the style
| block. On wide screens the sidebar is always visible
| and these flags are ignored.
|
*/

const internalOpen =
  ref(
    props.defaultOpen
  )

const isOpen =
  computed(() =>
    props.open === null
      ? internalOpen.value
      : props.open
  )

function setOpen(
  value
) {
  internalOpen.value =
    value

  emit(
    'update:open',
    value
  )
}

function closeDrawer() {
  setOpen(false)
}

function toggleDrawer() {
  setOpen(
    !isOpen.value
  )
}

/*
 * Stops the page behind the drawer from scrolling
 * under your finger.
 *
 * Guarded by the viewport width because the drawer can
 * start open, and above the breakpoint the sidebar is
 * just a column - locking the page there would be a bug.
 *
 * Keep this width in step with the media query below.
 */
function isDrawerLayout() {
  return window
    .matchMedia(
      '(max-width: 900px)'
    )
    .matches
}

watch(
  isOpen,
  value => {
    document
      .body
      .classList
      .toggle(
        'sidebar-drawer-open',
        value &&
        isDrawerLayout()
      )
  },
  {
    immediate: true,
  }
)

function handleKeydown(
  event
) {
  if (
    event.key === 'Escape' &&
    isOpen.value
  ) {
    closeDrawer()
  }
}

onMounted(() => {
  document
    .addEventListener(
      'keydown',
      handleKeydown
    )
})

onBeforeUnmount(() => {
  document
    .removeEventListener(
      'keydown',
      handleKeydown
    )

  document
    .body
    .classList
    .remove(
      'sidebar-drawer-open'
    )
})

/*
|--------------------------------------------------------------------------
| Analytics dialog
|--------------------------------------------------------------------------
|
| Hosted here rather than emitted to the parent, so the
| sidebar owns both the button and the modal.
|
| The drawer is closed first: otherwise it sits behind
| the dialog on narrow screens with the page scroll
| still locked.
|
| PrimeVue teleports the dialog to <body>, so the
| drawer's z-index and overflow-y don't clip it.
|
*/

const showAnalytics =
  ref(false)

function openAnalytics() {
  closeDrawer()

  showAnalytics.value =
    true
}

/*
|--------------------------------------------------------------------------
| Emitting + closing
|--------------------------------------------------------------------------
|
| Every action in the drawer navigates somewhere or
| opens a dialog, so the drawer should get out of the
| way afterwards.
|
*/

function emitAndClose(
  event,
  payload
) {
  if (
    payload === undefined
  ) {
    emit(event)
  } else {
    emit(event, payload)
  }

  closeDrawer()
}

const ownerName =
  menu =>
    menu
      ?.menu_owner
      ?.menu_owner_name ||
    `Menu #${menu.id}`

const userPrimaryLabel =
  () => {
    return (
      props.currentUser?.name ||
      props.currentUser?.email ||
      'Authenticated user'
    )
  }

const userSecondaryLabel =
  () => {
    if (
      props.currentUser?.name &&
      props.currentUser?.email
    ) {
      return props.currentUser.email
    }

    return 'Logged in'
  }

/*
|--------------------------------------------------------------------------
| Mobile top bar
|--------------------------------------------------------------------------
*/

const currentMenu =
  computed(() =>
    props.menus.find(
      menu =>
        String(menu.id) ===
        String(props.currentMenuId)
    )
  )

const currentMenuLabel =
  computed(() => {
    if (
      currentMenu.value
    ) {
      return ownerName(
        currentMenu.value
      )
    }

    return props.loggedIn
      ? 'No menu selected'
      : 'Not logged in'
  })
</script>

<template>
  <!--
    Small screens only. The toggle is its own button so
    the bar can hold other controls beside it.
  -->
  <div
    v-if="showToggle"
    class="sidebar-topbar"
    :class="{
      'is-hidden': isOpen,
    }"
  >
    <button
      type="button"
      class="sidebar-topbar-toggle"
      aria-label="Show menus"
      :aria-expanded="isOpen"
      aria-controls="menu-sidebar"
      @click="toggleDrawer"
    >
      <i
        class="pi pi-bars"
        aria-hidden="true"
      />

      <span class="sidebar-topbar-title">
        {{ currentMenuLabel }}
      </span>

      <span
        v-if="isAdmin && currentMenu"
        class="sidebar-topbar-id"
      >
        #{{ currentMenu.id }}
      </span>
    </button>

    <div
      v-if="$slots['topbar-actions']"
      class="sidebar-topbar-actions"
    >
      <slot name="topbar-actions" />
    </div>
  </div>

  <!-- Tap-anywhere-else to close -->
  <div
    class="sidebar-backdrop"
    :class="{
      'is-visible': isOpen,
    }"
    @click="closeDrawer"
  />

  <aside
    id="menu-sidebar"
    class="menu-sidebar"
    :class="{
      'is-open': isOpen,
    }"
  >
    <Button
      class="sidebar-close"
      icon="pi pi-times"
      text
      rounded
      aria-label="Hide menus"
      @click="closeDrawer"
    />

    <!-- Brand -->
    <div class="sidebar-brand">
      <strong>
        TapMyMenu
      </strong>

      <span>
        Dashboard
      </span>
    </div>

    <!-- Create -->
    <Button
      v-if="loggedIn && isAdmin"
      label="New menu"
      icon="pi pi-plus"
      class="w-full"
      @click="
        emitAndClose(
          'new-menu'
        )
      "
    />

    <!-- Menus -->
    <div class="sidebar-menu-list">
      <div
        v-for="menu in menus"
        :key="menu.id"
        role="button"
        tabindex="0"
        class="sidebar-menu-item"
        :class="{
          active:
            String(menu.id) ===
            String(currentMenuId)
        }"
        @click="
          emitAndClose(
            'select',
            menu.id
          )
        "
        @keydown.enter="
          emitAndClose(
            'select',
            menu.id
          )
        "
      >
        <div class="sidebar-menu-main">
          <strong>
            {{ ownerName(menu) }}
          </strong>

          <small v-if="isAdmin">
            #{{ menu.id }}

            ·

            {{
              menu.menu_items?.length ||
              0
            }}
            items
          </small>

          <span
            v-if="menu.suspended"
            class="status-badge danger"
          >
            Suspended
          </span>
        </div>

        <button
          v-if="isAdmin"
          type="button"
          class="yumm-chip"
          :class="{
            active:
              menu.yumm_eligible
          }"
          @click.stop="
            emit(
              'toggle-yumm',
              menu.id
            )
          "
        >
          Yumm
        </button>
      </div>

      <div
        v-if="
          loggedIn &&
          !menus.length
        "
        class="sidebar-empty"
      >
        No menus available for this account.
      </div>

      <div
        v-if="!loggedIn"
        class="sidebar-empty"
      >
        Log in to view your menus.
      </div>
    </div>

    <!-- Footer -->
    <div class="sidebar-footer">
      <!-- Management -->
      <template v-if="loggedIn && isAdmin">
        <Button
          label="Analytics"
          icon="pi pi-chart-bar"
          text
          class="w-full justify-start"
          @click="openAnalytics"
        />

        <Button
          label="Manage images"
          icon="pi pi-images"
          text
          class="w-full justify-start"
          @click="
            emitAndClose(
              'open-images'
            )
          "
        />

        <Button
          label="Manage codes"
          icon="pi pi-tag"
          text
          class="w-full justify-start"
          @click="
            emitAndClose(
              'open-codes'
            )
          "
        />

        <Button
          label="Create user"
          icon="pi pi-user-plus"
          text
          class="w-full justify-start"
          @click="
            emitAndClose(
              'open-users'
            )
          "
        />

        <Button
          label="Menu associations"
          icon="pi pi-link"
          text
          class="w-full justify-start"
          @click="
            emitAndClose(
              'open-menu-associations'
            )
          "
        />
      </template>

      <!-- Authentication -->
      <div class="auth-section">
        <div
          v-if="loggedIn"
          class="logged-user"
        >
          <i class="pi pi-user" />

          <div>
            <strong>
              {{
                userPrimaryLabel()
              }}
            </strong>

            <small>
              {{
                userSecondaryLabel()
              }}
            </small>

            <span
              v-if="currentUser?.role"
              class="user-role"
            >
              {{ currentUser.role }}
            </span>
          </div>
        </div>

        <div
          v-else
          class="logged-user"
        >
          <i class="pi pi-user" />

          <div>
            <strong>
              Not logged in
            </strong>

            <small>
              Authentication required
            </small>
          </div>
        </div>

        <Button
          :label="
            loggedIn
              ? 'Log out'
              : 'Log in'
          "
          :icon="
            loggedIn
              ? 'pi pi-sign-out'
              : 'pi pi-sign-in'
          "
          text
          size="small"
          @click="
            emitAndClose(
              loggedIn
                ? 'logout'
                : 'login'
            )
          "
        />
      </div>
    </div>
  </aside>

  <!--
    Outside <aside> so it isn't inside the drawer's
    stacking context. The body only mounts while
    visible, so no request is made until it's opened -
    and it reloads on each open rather than going stale.
  -->
  <Dialog
    v-model:visible="showAnalytics"
    modal
    dismissable-mask
    header="Analytics"
    class="analytics-dialog"
    :style="{
      width: 'min(76rem, 95vw)',
    }"
    :breakpoints="{
      '900px': '95vw',
    }"
  >
    <AnalyticsEvents
      :api-base="analyticsBase"
      :token="token"
    />
  </Dialog>
</template>

<style scoped>
/*
 * Wide screens keep the sidebar exactly as it was:
 * the drawer controls are hidden and .menu-sidebar
 * is left entirely to your global stylesheet.
 */
.sidebar-topbar,
.sidebar-close,
.sidebar-backdrop {
  display: none;
}

/*
 * AnalyticsEvents renders its own dashboard-card, which
 * would otherwise sit as a boxed panel inside the
 * dialog's own padded body. Flatten it.
 *
 * :deep because the dialog is teleported and the card
 * belongs to a child component.
 */
.analytics-dialog :deep(.dashboard-card) {
  padding: 0;
  border: 0;
  box-shadow: none;
  background: transparent;
}

@media (max-width: 900px) {
  .sidebar-topbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 41;
    min-height: 3rem;
    padding: 0.5rem 0.85rem;
    /*
     * A bar over scrolling content can't be
     * transparent. These two are the only colours the
     * component sets - swap them for your own tokens
     * if they don't match.
     */
    background: var(--p-content-background, #fff);
    border-bottom: 1px solid
      var(--p-content-border-color, rgba(0, 0, 0, 0.12));
    transition:
      opacity 0.16s ease,
      visibility 0.16s ease;
  }

  .sidebar-topbar-toggle {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex: 1 1 auto;
    min-width: 0;
    padding: 0;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .sidebar-topbar-actions {
    display: flex;
    align-items: center;
    gap: 0;
    flex: 0 0 auto;
  }

  .sidebar-topbar-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  /*
   * Never shrinks, so the id stays readable while a
   * long name truncates beside it.
   */
  .sidebar-topbar-id {
    flex: 0 0 auto;
    font-size: 0.85rem;
    opacity: 0.65;
  }

  /*
   * Out of sight and out of the tab order once the
   * drawer takes over; the close button replaces it.
   */
  .sidebar-topbar.is-hidden {
    opacity: 0;
    visibility: hidden;
  }

  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 39;
    background: rgba(0, 0, 0, 0.45);
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 0.24s ease,
      visibility 0.24s ease;
  }

  .sidebar-backdrop.is-visible {
    opacity: 1;
    visibility: visible;
  }

  .menu-sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 40;
    width: min(86vw, 20rem);
    max-width: 100%;
    overflow-y: auto;
    box-shadow: 0 0 2rem rgba(0, 0, 0, 0.25);
    transform: translateX(-100%);
    visibility: hidden;
    transition:
      transform 0.24s ease,
      visibility 0.24s ease;
  }

  .menu-sidebar.is-open {
    transform: none;
    visibility: visible;
  }

  .sidebar-close {
    display: inline-flex;
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .menu-sidebar,
  .sidebar-backdrop,
  .sidebar-topbar {
    transition: none;
  }
}
</style>

<!--
  Unscoped on purpose: the fixed hamburger is taken out
  of the flow, so the main column has to reserve room for
  it or the button lands on top of the menu title.

  Move this into menu-dashboard.css if you'd rather keep
  layout rules in one place.
-->
<style>
@media (max-width: 900px) {
  .menu-dashboard-shell .menu-dashboard-main {
    padding-top: 3.5rem;
  }
}
</style>