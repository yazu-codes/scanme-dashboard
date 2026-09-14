<script setup>
import {
  computed,
  onMounted,
  ref,
  watch,
} from 'vue'

import Button from 'primevue/button'
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

import CollapsibleCard
  from '@/components/menu/CollapsibleCard.vue'

import MenuOwnerForm
  from '@/components/menu/MenuOwnerForm.vue'

import MenuConfigurationForm
  from '@/components/menu/MenuConfigurationForm.vue'

import CategoryTreeEditor
  from '@/components/menu/CategoryTreeEditor.vue'

import MenuItemsSection
  from '@/components/menu/MenuItemsSection.vue'

import MenuReviewLinksSection
  from '@/components/menu/MenuReviewLinksSection.vue'

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
| Review links
|--------------------------------------------------------------------------
|
| They live on menu_owner. The backend may omit the key
| when a menu has none, and the section pushes straight
| into this array, so it has to exist ON the owner - a
| `|| []` fallback alone would hand out a detached array
| and silently drop new rows.
|
*/

watch(
  () => dashboard.draftMenu.value,
  draft => {
    const ownerDraft =
      draft?.menu_owner

    if (
      ownerDraft &&
      !Array.isArray(
        ownerDraft.review_links
      )
    ) {
      ownerDraft.review_links = []
    }
  },
  {
    immediate: true,
  }
)

const reviewLinks =
  computed(
    () =>
      owner
        .value
        ?.review_links ||
      []
  )

const reviewLinksSummary =
  computed(
    () =>
      `${reviewLinks.value.length} link${
        reviewLinks.value.length === 1
          ? ''
          : 's'
      }`
  )

/*
|--------------------------------------------------------------------------
| Section summaries
|--------------------------------------------------------------------------
|
| Shown next to the section title so a collapsed card
| still tells you what's inside it.
|
*/

const ownerSummary =
  computed(
    () =>
      owner.value
        ?.menu_owner_name ||
      ''
  )

const categoryCount =
  computed(
    () =>
      Array.isArray(
        config.value
          ?.category_order
      )
        ? config
          .value
          .category_order
          .length
        : 0
  )

const categorySummary =
  computed(
    () =>
      `${categoryCount.value} categor${
        categoryCount.value === 1
          ? 'y'
          : 'ies'
      }`
  )

const itemsSummary =
  computed(
    () =>
      `${items.value.length} item${
        items.value.length === 1
          ? ''
          : 's'
      }`
  )

/*
|--------------------------------------------------------------------------
| Expand / collapse all
|--------------------------------------------------------------------------
*/

const sectionKeys = [
  'menu-owner',
  'appearance',
  'category-order',
  'menu-items',
  'review-links',
]

/*
 * Bumping this remounts the four cards, which makes
 * them re-read their stored state.
 */
const sectionsVersion =
  ref(0)

function setAllSections(
  open
) {
  for (
    const key
    of sectionKeys
  ) {
    try {
      window.localStorage
        .setItem(
          `menu-dashboard:section:${key}`,
          open ? '1' : '0'
        )
    } catch {
      // Storage disabled, nothing to persist.
    }
  }

  sectionsVersion.value += 1
}

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
    >
      <!--
        Mobile only: the bar is the one thing on screen
        at all times, so the section controls ride along
        with it instead of scrolling away.
      -->
      <template #topbar-actions>
        <template
          v-if="
            dashboard
              .draftMenu
              .value
          "
        >
          <Button
            icon="pi pi-angle-double-down"
            text
            rounded
            aria-label="Expand all sections"
            @click="
              setAllSections(true)
            "
          />

          <Button
            icon="pi pi-angle-double-up"
            text
            rounded
            aria-label="Collapse all sections"
            @click="
              setAllSections(false)
            "
          />
        </template>
      </template>
    </MenuSidebar>

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
          <div
            v-if="
              dashboard
                .dirty
                .value
            "
            class="save-bar-dock"
          >
            <SaveBar
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
          </div>

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

          <!-- Section controls -->
          <div class="section-controls">
            <Button
              label="Expand all"
              icon="pi pi-angle-double-down"
              severity="secondary"
              text
              size="small"
              @click="
                setAllSections(true)
              "
            />

            <Button
              label="Collapse all"
              icon="pi pi-angle-double-up"
              severity="secondary"
              text
              size="small"
              @click="
                setAllSections(false)
              "
            />
          </div>

          <!-- Owner -->
          <CollapsibleCard
            v-if="owner"
            :key="`owner-${sectionsVersion}`"
            title="Menu owner"
            :subtitle="ownerSummary"
            storage-key="menu-owner"
            :default-open="false"
            flush
          >
            <MenuOwnerForm
              :owner="owner"
              :is-admin="isAdmin"
            />
          </CollapsibleCard>

          <!-- Configuration -->
          <CollapsibleCard
            v-if="config"
            :key="`appearance-${sectionsVersion}`"
            title="Appearance"
            storage-key="appearance"
            :default-open="false"
            flush
          >
            <MenuConfigurationForm
              :config="config"
              :owner-name="
                owner
                  ?.menu_owner_name ||
                ''
              "
              :is-admin="isAdmin"
            />
          </CollapsibleCard>

          <!-- Category order -->
          <CollapsibleCard
            v-if="config"
            :key="`categories-${sectionsVersion}`"
            title="Category order"
            :subtitle="categorySummary"
            storage-key="category-order"
            :default-open="false"
            flush
          >
            <CategoryTreeEditor
              v-model="
                config.category_order
              "
            />
          </CollapsibleCard>

          <!-- Items -->
          <CollapsibleCard
            :key="`items-${sectionsVersion}`"
            title="Menu items"
            :subtitle="itemsSummary"
            storage-key="menu-items"
            :default-open="false"
            flush
          >
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
          </CollapsibleCard>

          <!-- Review links -->
          <CollapsibleCard
            v-if="isAdmin"
            :key="`review-links-${sectionsVersion}`"
            title="Review links"
            :subtitle="reviewLinksSummary"
            storage-key="review-links"
            :default-open="false"
            flush
          >
            <MenuReviewLinksSection
              :links="reviewLinks"
              :menu-id="
                dashboard
                  .draftMenu
                  .value
                  .id
              "
            />
          </CollapsibleCard>
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
    />
  </div>
</template>

<style scoped>
.section-controls {
  display: flex;
  justify-content: flex-end;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

/*
 * Same breakpoint as the sidebar drawer: below it these
 * live in the sticky bar instead.
 */
@media (max-width: 900px) {
  .section-controls {
    display: none;
  }

  /*
   * Fixed rather than sticky, so appearing and
   * disappearing doesn't shift everything below it.
   * Not absolute: with no positioned ancestor it would
   * scroll away with the page instead of staying put.
   *
   * The sticky nav is 3rem tall at z-index 41, so this
   * docks below it and outranks it. Keep both numbers in
   * step with MenuSidebar.
   */
  .save-bar-dock {
    position: fixed;
    top: 3rem;
    left: 0;
    right: 0;
    z-index: 42;
    padding: 0 0.85rem;
  }
}
</style>