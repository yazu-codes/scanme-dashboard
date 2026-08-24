<script setup>
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import Button from 'primevue/button'

const props = defineProps({
  visible: Boolean,
  menus: { type: Array, default: () => [] },
  api: { type: Object, required: true },
})

const emit = defineEmits(['update:visible'])
const codes = ref([])
const loading = ref(false)
const error = ref(null)

const menuOptions = () => [
  { label: '— unassigned —', value: 0 },
  ...props.menus.map(menu => ({
    label: `${menu.menu_owner?.menu_owner_name || `Menu #${menu.id}`} (#${menu.id})`,
    value: menu.id,
  })),
]

async function load() {
  loading.value = true
  error.value = null
  try {
    const data = await props.api.listCodes()
    codes.value = data?.codes || []
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function reassign(code, value) {
  const previous = code.menu_id
  code.menu_id = value
  try {
    await props.api.updateCode({
      id: code.id,
      menu_id: value,
      code: code.code,
    })
  } catch (err) {
    code.menu_id = previous
    window.alert(err.message)
  }
}

watch(() => props.visible, value => {
  if (value) load()
})
</script>

<template>
  <Dialog
    :visible="visible"
    header="Manage codes"
    modal
    class="menu-dialog wide"
    @update:visible="emit('update:visible', $event)"
  >
    <div v-if="loading" class="empty-panel">Loading...</div>
    <div v-else-if="error" class="empty-panel">{{ error }}</div>

    <table v-else class="simple-table">
      <thead>
        <tr><th>ID</th><th>Code</th><th>Menu</th></tr>
      </thead>
      <tbody>
        <tr v-for="code in codes" :key="code.id">
          <td>#{{ code.id }}</td>
          <td class="mono">{{ code.code }}</td>
          <td>
            <Dropdown
              :modelValue="code.menu_id"
              :options="menuOptions()"
              optionLabel="label"
              optionValue="value"
              class="w-full"
              @update:modelValue="reassign(code, $event)"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <template #footer>
      <Button label="Close" @click="emit('update:visible', false)" />
    </template>
  </Dialog>
</template>
