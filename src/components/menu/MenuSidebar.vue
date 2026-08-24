<script setup>
import {
  ref,
  watch,
} from 'vue'

import Button from 'primevue/button'
import InputText from 'primevue/inputtext'

const props = defineProps({
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
  'open-menu-associations'
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
</script>

<template>
  <aside class="menu-sidebar">
    <!-- Brand -->
    <div class="sidebar-brand">
      <strong>
        Menu Board
      </strong>

      <span>
        Dashboard
      </span>
    </div>

    <!-- Create -->
    <Button
      v-if="loggedIn"
      label="New menu"
      icon="pi pi-plus"
      class="w-full"
      @click="
        emit(
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
          emit(
            'select',
            menu.id
          )
        "
        @keydown.enter="
          emit(
            'select',
            menu.id
          )
        "
      >
        <div class="sidebar-menu-main">
          <strong>
            {{ ownerName(menu) }}
          </strong>

          <small>
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
      <template v-if="loggedIn">
        <Button
          label="Manage images"
          icon="pi pi-images"
          text
          class="w-full justify-start"
          @click="
            emit(
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
            emit(
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
            emit(
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
            emit(
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
            emit(
              loggedIn
                ? 'logout'
                : 'login'
            )
          "
        />
      </div>

      <!-- API configuration -->
      <Button
        label="API connection"
        icon="pi pi-cog"
        text
        class="w-full justify-start"
        @click="
          showApi =
            !showApi
        "
      />

      <div
        v-if="showApi"
        class="api-settings"
      >
        <InputText
          v-model="localBase"
          class="w-full"
        />

        <Button
          label="Apply"
          size="small"
          class="w-full"
          @click="
            emit(
              'save-api-base',
              localBase
            )
          "
        />
      </div>
    </div>
  </aside>
</template>