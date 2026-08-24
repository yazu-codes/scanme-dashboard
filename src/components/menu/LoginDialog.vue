<script setup>
import {
  ref,
  watch,
} from 'vue'

import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'

const props = defineProps({
  visible: Boolean,
  loading: Boolean,
})

const emit = defineEmits([
  'update:visible',
  'submit',
])

const email = ref('')
const password = ref('')

watch(
  () => props.visible,
  value => {
    if (value) {
      email.value = ''
      password.value = ''
    }
  }
)

function submit() {
  if (
    !email.value.trim() ||
    !password.value
  ) {
    window.alert(
      'Email and password are required.'
    )

    return
  }

  emit(
    'submit',
    email.value.trim(),
    password.value
  )
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Log in"
    modal
    class="menu-dialog"
    @update:visible="
      emit(
        'update:visible',
        $event
      )
    "
  >
    <div class="form-grid one-column">
      <label class="field">
        <span>Email</span>

        <InputText
          v-model="email"
          type="email"
          autocomplete="email"
        />
      </label>

      <label class="field">
        <span>Password</span>

        <Password
          v-model="password"
          :feedback="false"
          toggleMask
          autocomplete="current-password"
          @keyup.enter="submit"
        />
      </label>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        text
        :disabled="loading"
        @click="
          emit(
            'update:visible',
            false
          )
        "
      />

      <Button
        label="Log in"
        icon="pi pi-sign-in"
        :loading="loading"
        @click="submit"
      />
    </template>
  </Dialog>
</template>