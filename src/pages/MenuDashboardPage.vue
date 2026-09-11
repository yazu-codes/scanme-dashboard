<script setup>
import {
  computed,
  onMounted,
  ref,
} from 'vue'

import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'

import MenuAssociationsDialog
  from '@/components/menu/MenuAssociationsDialog.vue'

import SignupUserDialog
  from '@/components/menu/SignupUserDialog.vue'

import {
  useMenuDashboard,
} from '@/composables/useMenuDashboard'

import MenuSidebar
  from '@/components/menu/MenuSidebar.vue'

import SaveBar
  from '@/components/menu/SaveBar.vue'

import MenuHeader
  from '@/components/menu/MenuHeader.vue'

import MenuOwnerForm
  from '@/components/menu/MenuOwnerForm.vue'

import MenuConfigurationForm
  from '@/components/menu/MenuConfigurationForm.vue'

import CategoryTreeEditor
  from '@/components/menu/CategoryTreeEditor.vue'

import MenuItemsSection
  from '@/components/menu/MenuItemsSection.vue'

import NewMenuDialog
  from '@/components/menu/NewMenuDialog.vue'

import LoginDialog
  from '@/components/menu/LoginDialog.vue'

import CodesDialog
  from '@/components/menu/CodesDialog.vue'

import ImagesDialog
  from '@/components/menu/ImagesDialog.vue'

import '@/styles/menu-dashboard.css'
import '@/styles/menu-forms.css'
import '@/styles/menu-dialogs.css'

/*
|--------------------------------------------------------------------------
| Dashboard state
|--------------------------------------------------------------------------
*/

const dashboard =
  useMenuDashboard()

/*
|--------------------------------------------------------------------------
| Dialogs
|--------------------------------------------------------------------------
*/

const showSignupUser =
  ref(false)

const showNewMenu =
  ref(false)

const showLogin =
  ref(false)

const showCodes =
  ref(false)

const showImages =
  ref(false)

const authBusy =
  ref(false)

const showMenuAssociations =
  ref(false)

/*
|--------------------------------------------------------------------------
| Draft shortcuts
|--------------------------------------------------------------------------
*/

const owner =
  computed(
    () =>
      dashboard
        .draftMenu
        .value
        ?.menu_owner
  )

const config =
  computed(
    () =>
      dashboard
        .draftMenu
        .value
        ?.menu_configuration
  )

const items =
  computed(
    () =>
      dashboard
        .draftMenu
        .value
        ?.menu_items ||
      []
  )

const isAdmin = computed(
  () => dashboard.currentUser.value?.role === 'admin'
)

/*
|--------------------------------------------------------------------------
| Login
|--------------------------------------------------------------------------
*/

async function handleLogin(
  email,
  password
) {
  authBusy.value = true

  try {
    await dashboard.login(
      email,
      password
    )

    showLogin.value =
      false
  } catch (err) {
    window.alert(
      err.message
    )
  } finally {
    authBusy.value =
      false
  }
}

/*
|--------------------------------------------------------------------------
| Logout
|--------------------------------------------------------------------------
*/

function handleLogout() {
  if (
    dashboard.dirty.value &&
    !window.confirm(
      'You have unsaved changes. Log out anyway?'
    )
  ) {
    return
  }

  dashboard.logout()
}

/*
|--------------------------------------------------------------------------
| Create menu
|--------------------------------------------------------------------------
*/

async function handleCreate(
  name,
  urlName
) {
  try {
    await dashboard
      .createMenu(
        name,
        urlName
      )

    showNewMenu.value =
      false
  } catch (err) {
    window.alert(
      err.message
    )
  }
}

/*
|--------------------------------------------------------------------------
| Delete menu
|--------------------------------------------------------------------------
*/

async function handleDelete() {
  if (
    !window.confirm(
      'Delete this menu and everything in it? This cannot be undone.'
    )
  ) {
    return
  }

  try {
    await dashboard
      .deleteCurrentMenu()
  } catch (err) {
    window.alert(
      err.message
    )
  }
}

/*
|--------------------------------------------------------------------------
| Suspend / enable
|--------------------------------------------------------------------------
*/

async function handleSuspend() {
  try {
    const success =
      await dashboard
        .toggleSuspended()

    if (
      !success &&
      dashboard.dirty.value
    ) {
      window.alert(
        'Save or discard your changes before changing menu status.'
      )
    }
  } catch (err) {
    window.alert(
      err.message
    )
  }
}

/*
|--------------------------------------------------------------------------
| Yumm
|--------------------------------------------------------------------------
*/

async function handleYumm(
  menuId
) {
  try {
    const success =
      await dashboard
        .toggleYumm(
          menuId
        )

    if (
      !success &&
      dashboard.dirty.value
    ) {
      window.alert(
        'Save or discard your changes before changing Yumm status.'
      )
    }
  } catch (err) {
    window.alert(
      err.message
    )
  }
}

/*
|--------------------------------------------------------------------------
| Change API base
|--------------------------------------------------------------------------
*/

async function handleApiBase(
  value
) {
  if (
    dashboard.dirty.value &&
    !window.confirm(
      'Changing the API connection will discard your current menu changes. Continue?'
    )
  ) {
    return
  }

  dashboard.updateApiBase(
    value
  )

  /*
   * Only reload if authenticated.
   */
  if (
    dashboard.loggedIn.value
  ) {
    try {
      await dashboard.loadMenus({
        preserveSelection:
          false,
      })
    } catch {
      // Error is already exposed through dashboard.error.
    }
  }
}

/*
|--------------------------------------------------------------------------
| Initial load
|--------------------------------------------------------------------------
*/

onMounted(
  async () => {
    /*
     * If a token was restored from localStorage,
     * immediately try loading the user's menus.
     *
     * If the token has expired, menuApi.js will receive
     * the 401 and clear the session automatically.
     */
    if (
      dashboard.loggedIn.value
    ) {
      try {
        await dashboard.loadMenus({
          preserveSelection:
            false,
        })
      } catch {
        // dashboard.error already contains the error.
      }
    }
  }
)
</script>

<template>
  <div class="menu-dashboard-shell">
    <!-- Sidebar -->
    <MenuSidebar
      :menus="dashboard.menus.value"
      :current-menu-id="
        dashboard.currentMenu.value?.id
      "
      :logged-in="dashboard.loggedIn.value"
      :current-user="dashboard.currentUser.value"
      :is-admin="isAdmin"
      :api-base="dashboard.apiBase.value"

      @select="dashboard.selectMenu"
      @new-menu="showNewMenu = true"
      @toggle-yumm="handleYumm"
      @login="showLogin = true"
      @logout="handleLogout"
      @save-api-base="handleApiBase"
      @open-codes="showCodes = true"
      @open-images="showImages = true"
      @open-users="showSignupUser = true"
      @open-menu-associations="
        showMenuAssociations = true
      "
    />

    <!-- Main -->
    <main class="menu-dashboard-main">
      <!-- Initial loading -->
      <div
        v-if="
          dashboard.loading.value &&
          !dashboard.menus.value.length
        "
        class="dashboard-loading"
      >
        <ProgressSpinner
          style="
            width: 42px;
            height: 42px;
          "
        />
      </div>

      <!-- Error -->
      <Message
        v-if="
          dashboard.error.value
        "
        severity="error"
        closable
        @close="
          dashboard.error.value =
            null
        "
      >
        {{
          dashboard.error.value
        }}
      </Message>

      <!-- Logged out -->
      <div
        v-if="
          !dashboard.loggedIn.value
        "
        class="dashboard-placeholder"
      >
        <h2>
          Log in
        </h2>

        <p>
          Log in to access your menus.
        </p>

        <br>

        <button
          type="button"
          class="p-button p-component"
          @click="
            showLogin = true
          "
        >
          <span
            class="
              p-button-icon
              pi
              pi-sign-in
            "
          />

          <span
            class="
              p-button-label
            "
          >
            Log in
          </span>
        </button>
      </div>

      <!-- Authenticated dashboard -->
      <template
        v-else
      >
        <!-- Selected menu -->
        <template
          v-if="
            dashboard
              .draftMenu
              .value
          "
        >
          <!-- Unsaved changes -->
          <SaveBar
            v-if="
              dashboard
                .dirty
                .value
            "
            :saving="
              dashboard
                .saving
                .value
            "
            @save="
              dashboard.saveMenu
            "
            @discard="
              dashboard.discardDraft
            "
          />

          <!-- Menu heading -->
          <MenuHeader
            :menu="
              dashboard
                .draftMenu
                .value
            "
            :dirty="
              dashboard
                .dirty
                .value
            "
            :is-admin="isAdmin"
            @toggle-suspended="
              handleSuspend
            "
            @delete="
              handleDelete
            "
          />

          <!-- Owner -->
          <MenuOwnerForm
            v-if="owner"
            :owner="owner"
            :is-admin="isAdmin"
          />

          <!-- Configuration -->
          <MenuConfigurationForm
            v-if="config"
            :config="config"
            :owner-name="
              owner
                ?.menu_owner_name ||
              ''
            "
            :is-admin="isAdmin"
          />

          <!-- Category order -->
          <CategoryTreeEditor
            v-if="config"
            v-model="
              config.category_order
            "
          />

          <!-- Items -->
          <MenuItemsSection
            :items="items"
            :menu-id="
              dashboard
                .draftMenu
                .value
                .id
            "
            :menu-name="
              dashboard
                .draftMenu
                .value
                ?.menu_owner
                ?.menu_owner_name ||
              ''
            "
            :menu-slug="
              dashboard
                .draftMenu
                .value
                ?.menu_owner
                ?.menu_owner_url_name ||
              ''
            "
            :token="
              dashboard
                .authToken
                .value
            "
            :is-admin="isAdmin"
          />
        </template>

        <!-- No menu selected -->
        <div
          v-else-if="
            !dashboard.loading.value
          "
          class="dashboard-placeholder"
        >
          <template
            v-if="
              dashboard
                .menus
                .value
                .length
            "
          >
            <h2>
              Select a menu
            </h2>

            <p>
              Choose a menu from the sidebar.
            </p>
          </template>

          <template
            v-else
          >
            <h2>
              No menus available
            </h2>

            <p>
              This account currently has no menus.
            </p>
          </template>
        </div>
      </template>
    </main>

    <!-- Create menu -->
    <NewMenuDialog
      v-model:visible="
        showNewMenu
      "
      :saving="
        dashboard
          .saving
          .value
      "
      @create="
        handleCreate
      "
    />

    <!-- Login -->
    <LoginDialog
      v-model:visible="
        showLogin
      "
      :loading="
        authBusy
      "
      @submit="
        handleLogin
      "
    />

    <!-- Codes -->
    <CodesDialog
      v-model:visible="
        showCodes
      "
      :menus="
        dashboard
          .menus
          .value
      "
      :api="
        dashboard
          .api
          .value
      "
    />

    <!-- Images -->
    <ImagesDialog
      v-model:visible="
        showImages
      "
      :menus="
        dashboard
          .menus
          .value
      "
      :token="
        dashboard
          .authToken
          .value
      "
      :current-menu-id="
        dashboard
          .currentMenu
          .value
          ?.id
      "
    />

    <SignupUserDialog
      v-model:visible="
        showSignupUser
      "
      :token="
        dashboard
          .authToken
          .value
      "
    />

    <MenuAssociationsDialog
      v-model:visible="
        showMenuAssociations
      "
      :token="
        dashboard
          .authToken
          .value
      "
      :menus="
        dashboard
          .menus
          .value
      "
      :users="
        users
      "
    />
  </div>
</template>