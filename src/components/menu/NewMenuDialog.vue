<script setup>
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { slugify } from '@/utils/menuUtils'

const props = defineProps({ visible: Boolean, saving: Boolean })
const emit = defineEmits(['update:visible', 'create'])

const name = ref('')
const urlName = ref('')
const touched = ref(false)

watch(() => props.visible, value => {
  if (value) {
    name.value = ''
    urlName.value = ''
    touched.value = false
  }
})

watch(name, value => {
  if (!touched.value) urlName.value = slugify(value)
})

function submit() {
  if (!name.value.trim() || !urlName.value.trim()) {
    window.alert('Name and URL name are required.')
    return
  }
  emit('create', name.value.trim(), urlName.value.trim())
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="New menu"
    modal
    class="menu-dialog"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="form-grid one-column">
      <label class="field">
        <span>Owner name</span>
        <InputText v-model="name" />
      </label>

      <label class="field">
        <span>URL name</span>
        <InputText v-model="urlName" @input="touched = true" />
      </label>
    </div>

    <template #footer>
      <Button label="Cancel" text :disabled="saving" @click="emit('update:visible', false)" />
      <Button label="Create menu" icon="pi pi-plus" :loading="saving" @click="submit" />
    </template>
  </Dialog>
</template>
