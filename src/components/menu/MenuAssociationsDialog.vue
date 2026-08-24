<script setup>
import {
  computed,
  ref,
  watch,
} from 'vue'

import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import MultiSelect from 'primevue/multiselect'
import Button from 'primevue/button'
import Message from 'primevue/message'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },

  token: {
    type: String,
    default: null,
  },

  menus: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits([
  'update:visible',
  'saved',
])

/*
|--------------------------------------------------------------------------
| Endpoints
|--------------------------------------------------------------------------
*/

const AUTH_USERS_URL =
  'https://scanme-auth-production.up.railway.app/api/users'

const MENU_ASSOCIATIONS_URL =
  'https://scanme-production.up.railway.app/api/menu-associations'

/*
|--------------------------------------------------------------------------
| State
|--------------------------------------------------------------------------
*/

const users =
  ref([])

const selectedUserId =
  ref(null)

const selectedMenuIds =
  ref([])

const loadingUsers =
  ref(false)

const loadingAssociations =
  ref(false)

const saving =
  ref(false)

const error =
  ref(null)

const success =
  ref(null)

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function getUserId(user) {
  if (!user) {
    return null
  }

  const value =
    user.id ??
    user.ID ??
    user.userId ??
    user.user_id ??
    null

  if (
    value === null ||
    value === undefined
  ) {
    return null
  }

  const id =
    Number(value)

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return null
  }

  return id
}

function getMenuId(menu) {
  if (!menu) {
    return null
  }

  const value =
    menu.id ??
    menu.ID ??
    menu.menuId ??
    menu.menu_id ??
    null

  if (
    value === null ||
    value === undefined
  ) {
    return null
  }

  const id =
    Number(value)

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return null
  }

  return id
}

/*
|--------------------------------------------------------------------------
| User options
|--------------------------------------------------------------------------
*/

const userOptions =
  computed(() =>
    users.value
      .map(user => {
        const id =
          getUserId(user)

        const name =
          user.name ??
          user.Name ??
          ''

        const email =
          user.email ??
          user.Email ??
          ''

        return {
          id,

          name:
            name ||
            email ||
            `User #${id}`,

          email,

          label:
            name && email
              ? `${name} — ${email}`
              : (
                  name ||
                  email ||
                  `User #${id}`
                ),
        }
      })
      .filter(user =>
        user.id !== null
      )
  )

/*
|--------------------------------------------------------------------------
| Menu options
|--------------------------------------------------------------------------
*/

const menuOptions =
  computed(() =>
    props.menus
      .map(menu => {
        const id =
          getMenuId(menu)

        return {
          id,

          label:
            menu
              ?.menu_owner
              ?.menu_owner_name ||
            `Menu #${id}`,
        }
      })
      .filter(menu =>
        menu.id !== null
      )
  )

/*
|--------------------------------------------------------------------------
| Selected user
|--------------------------------------------------------------------------
*/

const selectedUser =
  computed(() => {
    if (!selectedUserId.value) {
      return null
    }

    return (
      userOptions.value.find(
        user =>
          user.id ===
          Number(
            selectedUserId.value
          )
      ) ||
      null
    )
  })

/*
|--------------------------------------------------------------------------
| Generic response parsing
|--------------------------------------------------------------------------
*/

async function parseResponse(
  response
) {
  const text =
    await response.text()

  if (!text.trim()) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function getErrorMessage(
  response,
  fallback
) {
  const body =
    await parseResponse(
      response
    )

  if (
    body &&
    typeof body === 'object'
  ) {
    return (
      body.message ||
      body.error ||
      fallback
    )
  }

  return fallback
}

/*
|--------------------------------------------------------------------------
| Load users
|--------------------------------------------------------------------------
*/

async function loadUsers() {
  if (!props.token) {
    error.value =
      'You must be logged in.'

    return
  }

  loadingUsers.value =
    true

  error.value =
    null

  try {
    const response =
      await fetch(
        AUTH_USERS_URL,
        {
          method: 'GET',

          headers: {
            Accept:
              'application/json',

            Authorization:
              `Bearer ${props.token}`,
          },
        }
      )

    if (
      response.status === 401
    ) {
      throw new Error(
        'Your session has expired. Please log in again.'
      )
    }

    if (
      response.status === 403
    ) {
      throw new Error(
        'You are not authorized to view users.'
      )
    }

    if (!response.ok) {
      throw new Error(
        await getErrorMessage(
          response,
          `Failed to load users (${response.status})`
        )
      )
    }

    const data =
      await parseResponse(
        response
      )

    /*
     * Supports:
     *
     * [
     *   {...},
     *   {...}
     * ]
     *
     * or:
     *
     * {
     *   "users": [...]
     * }
     */

    if (
      Array.isArray(data)
    ) {
      users.value =
        data
    } else if (
      Array.isArray(
        data?.users
      )
    ) {
      users.value =
        data.users
    } else {
      users.value =
        []
    }
  } catch (err) {
    users.value =
      []

    error.value =
      err.message
  } finally {
    loadingUsers.value =
      false
  }
}

/*
|--------------------------------------------------------------------------
| Load associations for selected user
|--------------------------------------------------------------------------
|
| GET:
|
| /api/menu-associations/{userId}
|
| Expected response:
|
| {
|   "menus": [
|     {
|       "id": 1,
|       ...
|     },
|     {
|       "id": 4,
|       ...
|     }
|   ]
| }
|
|--------------------------------------------------------------------------
*/

async function loadAssociations(
  userId
) {
  selectedMenuIds.value =
    []

  if (!userId) {
    return
  }

  if (!props.token) {
    error.value =
      'You must be logged in.'

    return
  }

  loadingAssociations.value =
    true

  error.value =
    null

  try {
    const response =
      await fetch(
        `${MENU_ASSOCIATIONS_URL}/${encodeURIComponent(userId)}`,
        {
          method: 'GET',

          headers: {
            Accept:
              'application/json',

            Authorization:
              `Bearer ${props.token}`,
          },
        }
      )

    if (
      response.status === 401
    ) {
      throw new Error(
        'Your session has expired. Please log in again.'
      )
    }

    if (
      response.status === 403
    ) {
      throw new Error(
        'You are not authorized to view menu associations.'
      )
    }

    if (!response.ok) {
      throw new Error(
        await getErrorMessage(
          response,
          `Failed to load menu associations (${response.status})`
        )
      )
    }

    const data =
      await parseResponse(
        response
      )

    /*
     * Backend currently responds:
     *
     * {
     *   "menus": [...]
     * }
     */

    const associatedMenus =
      Array.isArray(data?.menus)
        ? data.menus
        : []

    selectedMenuIds.value =
      associatedMenus
        .map(menu =>
          getMenuId(menu)
        )
        .filter(id =>
          id !== null
        )
  } catch (err) {
    selectedMenuIds.value =
      []

    error.value =
      err.message
  } finally {
    loadingAssociations.value =
      false
  }
}

/*
|--------------------------------------------------------------------------
| React to selected user
|--------------------------------------------------------------------------
*/

watch(
  selectedUserId,

  async userId => {
    error.value =
      null

    success.value =
      null

    if (!userId) {
      selectedMenuIds.value =
        []

      return
    }

    await loadAssociations(
      Number(userId)
    )
  }
)

/*
|--------------------------------------------------------------------------
| Open dialog
|--------------------------------------------------------------------------
*/

watch(
  () => props.visible,

  async visible => {
    if (!visible) {
      return
    }

    selectedUserId.value =
      null

    selectedMenuIds.value =
      []

    error.value =
      null

    success.value =
      null

    await loadUsers()
  }
)

/*
|--------------------------------------------------------------------------
| Close
|--------------------------------------------------------------------------
*/

function close() {
  if (
    saving.value ||
    loadingAssociations.value
  ) {
    return
  }

  emit(
    'update:visible',
    false
  )
}

/*
|--------------------------------------------------------------------------
| Save associations
|--------------------------------------------------------------------------
*/

async function submit() {
  error.value =
    null

  success.value =
    null

  const userId =
    Number(
      selectedUserId.value
    )

  if (
    !Number.isInteger(userId) ||
    userId <= 0
  ) {
    error.value =
      'Please select a valid user.'

    return
  }

  if (!props.token) {
    error.value =
      'You must be logged in.'

    return
  }

  const menuAssociations =
    selectedMenuIds.value
      .map(id =>
        Number(id)
      )
      .filter(id =>
        Number.isInteger(id) &&
        id > 0
      )

  const payload = {
    userId,
    menuAssociations,
  }

  console.log(
    'Saving menu associations:',
    payload
  )

  try {
    saving.value =
      true

    const response =
      await fetch(
        MENU_ASSOCIATIONS_URL,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            Accept:
              'application/json',

            Authorization:
              `Bearer ${props.token}`,
          },

          body:
            JSON.stringify(
              payload
            ),
        }
      )

    if (
      response.status === 401
    ) {
      throw new Error(
        'Your session has expired. Please log in again.'
      )
    }

    if (
      response.status === 403
    ) {
      throw new Error(
        'You are not authorized to update menu associations.'
      )
    }

    if (!response.ok) {
      throw new Error(
        await getErrorMessage(
          response,
          `Failed to save menu associations (${response.status})`
        )
      )
    }

    const result =
      await parseResponse(
        response
      )

    success.value =
      'Menu associations updated successfully.'

    /*
     * Reload from backend immediately.
     *
     * This means what the UI shows after saving
     * is exactly what the backend actually persisted.
     */
    await loadAssociations(
      userId
    )

    emit(
      'saved',
      result
    )
  } catch (err) {
    error.value =
      err.message
  } finally {
    saving.value =
      false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Menu Associations"
    modal
    :style="{
      width: '540px',
      maxWidth: '95vw',
    }"
    class="menu-dialog associations-dialog"
    @update:visible="
      emit(
        'update:visible',
        $event
      )
    "
  >
    <div class="association-form">
      <p class="dialog-description">
        Assign one or more menus to a user.
      </p>

      <!-- Error -->
      <Message
        v-if="error"
        severity="error"
        :closable="false"
      >
        {{ error }}
      </Message>

      <!-- Success -->
      <Message
        v-if="success"
        severity="success"
        :closable="false"
      >
        {{ success }}
      </Message>

      <!-- User -->
      <div class="association-field">
        <label>
          User
        </label>

        <Dropdown
          v-model="selectedUserId"
          :options="userOptions"
          optionLabel="label"
          optionValue="id"
          filter
          showClear
          placeholder="Select a user"
          class="w-full"
          :loading="loadingUsers"
          :disabled="
            loadingUsers ||
            saving
          "
        >
          <template #option="slotProps">
            <div class="association-option">
              <strong>
                {{ slotProps.option.name }}
              </strong>

              <small
                v-if="
                  slotProps.option.email
                "
              >
                {{ slotProps.option.email }}
              </small>
            </div>
          </template>
        </Dropdown>
      </div>

      <!-- Menus -->
      <div class="association-field">
        <label>
          Menus
        </label>

        <MultiSelect
          v-model="selectedMenuIds"
          :options="menuOptions"
          optionLabel="label"
          optionValue="id"
          filter
          display="chip"
          :maxSelectedLabels="3"
          selectedItemsLabel="{0} menus selected"
          placeholder="Select menus"
          class="w-full"
          :loading="
            loadingAssociations
          "
          :disabled="
            !selectedUserId ||
            loadingAssociations ||
            saving
          "
        >
          <template #option="slotProps">
            <div class="association-option">
              <strong>
                {{ slotProps.option.label }}
              </strong>

              <small>
                Menu ID:
                {{ slotProps.option.id }}
              </small>
            </div>
          </template>
        </MultiSelect>
      </div>

      <!-- Summary -->
      <div
        v-if="selectedUser"
        class="association-summary"
      >
        <span>
          Selected menus
        </span>

        <strong>
          {{ selectedMenuIds.length }}
        </strong>
      </div>
    </div>

    <template #footer>
      <Button
        label="Close"
        text
        :disabled="
          saving ||
          loadingAssociations
        "
        @click="close"
      />

      <Button
        label="Save Associations"
        icon="pi pi-save"
        :loading="saving"
        :disabled="
          !selectedUserId ||
          loadingAssociations
        "
        @click="submit"
      />
    </template>
  </Dialog>
</template>