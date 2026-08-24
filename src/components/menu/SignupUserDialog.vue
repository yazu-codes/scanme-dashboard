<script setup>
import {
  ref,
  watch,
} from 'vue'

import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'

import {
  signup,
} from '@/services/authApi'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },

  token: {
    type: String,
    default: null,
  },
})

const emit = defineEmits([
  'update:visible',
  'created',
])

const name =
  ref('')

const email =
  ref('')

const password =
  ref('')

const confirmPassword =
  ref('')

const loading =
  ref(false)

const error =
  ref(null)

const success =
  ref(null)

/*
|--------------------------------------------------------------------------
| Reset dialog when opened
|--------------------------------------------------------------------------
*/

watch(
  () => props.visible,
  value => {
    if (!value) {
      return
    }

    name.value = ''
    email.value = ''
    password.value = ''
    confirmPassword.value = ''

    error.value = null
    success.value = null
  }
)

/*
|--------------------------------------------------------------------------
| Close
|--------------------------------------------------------------------------
*/

function close() {
  if (loading.value) {
    return
  }

  emit(
    'update:visible',
    false
  )
}

/*
|--------------------------------------------------------------------------
| Signup
|--------------------------------------------------------------------------
*/

async function submit() {
  error.value = null
  success.value = null

  const normalizedName =
    name.value.trim()

  const normalizedEmail =
    email.value
      .trim()
      .toLowerCase()

  if (!normalizedName) {
    error.value =
      'Name is required.'

    return
  }

  if (!normalizedEmail) {
    error.value =
      'Email is required.'

    return
  }

  if (!password.value) {
    error.value =
      'Password is required.'

    return
  }

  if (
    password.value !==
    confirmPassword.value
  ) {
    error.value =
      'Passwords do not match.'

    return
  }

  try {
    loading.value = true

    const result =
      await signup(
        normalizedName,
        normalizedEmail,
        password.value,
        props.token
      )

    success.value =
      `User ${normalizedName} (${normalizedEmail}) was created successfully.`

    emit(
      'created',
      result
    )

    /*
     * Clear sensitive fields after success.
     */
    password.value = ''
    confirmPassword.value = ''
  } catch (err) {
    error.value =
      err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Create User"
    modal
    class="menu-dialog"
    @update:visible="
      emit(
        'update:visible',
        $event
      )
    "
  >
    <div class="signup-user-content">
      <p class="dialog-description">
        Create a user account for the application.
      </p>

      <Message
        v-if="error"
        severity="error"
        :closable="false"
      >
        {{ error }}
      </Message>

      <Message
        v-if="success"
        severity="success"
        :closable="false"
      >
        {{ success }}
      </Message>

      <div class="form-grid one-column">
        <label class="field">
          <span>
            Name
          </span>

          <InputText
            v-model="name"
            autocomplete="name"
            placeholder="John Smith"
            :disabled="loading"
          />
        </label>

        <label class="field">
          <span>
            Email
          </span>

          <InputText
            v-model="email"
            type="email"
            autocomplete="off"
            placeholder="user@example.com"
            :disabled="loading"
          />
        </label>

        <label class="field">
          <span>
            Password
          </span>

          <Password
            v-model="password"
            :feedback="false"
            toggleMask
            autocomplete="new-password"
            :disabled="loading"
          />
        </label>

        <label class="field">
          <span>
            Confirm password
          </span>

          <Password
            v-model="confirmPassword"
            :feedback="false"
            toggleMask
            autocomplete="new-password"
            :disabled="loading"
            @keyup.enter="submit"
          />
        </label>
      </div>
    </div>

    <template #footer>
      <Button
        label="Close"
        text
        :disabled="loading"
        @click="close"
      />

      <Button
        label="Create User"
        icon="pi pi-user-plus"
        :loading="loading"
        @click="submit"
      />
    </template>
  </Dialog>
</template>