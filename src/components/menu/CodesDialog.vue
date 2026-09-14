<script setup>
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'

const props = defineProps({
  visible: Boolean,
  menus: { type: Array, default: () => [] },
  api: { type: Object, required: true },
})

const emit = defineEmits(['update:visible'])
const codes = ref([])
const loading = ref(false)
const creating = ref(false)
const error = ref(null)

/*
 * Value each custom URL had when its field was focused,
 * so a failed save can be rolled back the same way the
 * dropdown rolls back.
 */
const editStartValues = new Map()

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

/*
 * The endpoint returns the row it created, but shapes
 * vary ({ code: {...} } or the row itself), so anything
 * without an id falls back to reloading the table.
 */
function createdRow(data) {
  const payload = data?.code ?? data

  if (
    payload &&
    typeof payload === 'object' &&
    payload.id !== undefined
  ) {
    return payload
  }

  return null
}

async function createCode() {
  creating.value = true

  try {
    const data = await props.api.createCode()
    const created = createdRow(data)

    if (created) {
      codes.value.unshift(created)
    } else {
      await load()
    }
  } catch (err) {
    window.alert(err.message)
  } finally {
    creating.value = false
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
      custom_url: code.custom_url || '',
    })
  } catch (err) {
    code.menu_id = previous
    window.alert(err.message)
  }
}

function startEditingUrl(code) {
  editStartValues.set(code.id, code.custom_url || '')
}

/*
 * Saved on blur rather than on input, so typing a URL
 * isn't one request per keystroke.
 */
async function saveCustomUrl(code) {
  const previous = editStartValues.get(code.id) ?? ''
  const next = String(code.custom_url || '').trim()

  editStartValues.delete(code.id)

  if (next === previous) return

  code.custom_url = next

  try {
    await props.api.updateCode({
      id: code.id,
      menu_id: code.menu_id,
      code: code.code,
      custom_url: next,
    })
  } catch (err) {
    code.custom_url = previous
    window.alert(err.message)
  }
}

watch(() => props.visible, value => {
  if (value) {
    editStartValues.clear()
    load()
  }
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
        <tr><th>ID</th><th>Code</th><th>Menu</th><th>Custom URL</th></tr>
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
          <td>
            <InputText
              :modelValue="code.custom_url || ''"
              class="w-full"
              placeholder="—"
              @update:modelValue="code.custom_url = $event"
              @focus="startEditingUrl(code)"
              @blur="saveCustomUrl(code)"
              @keyup.enter="$event.target.blur()"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <template #footer>
      <Button
        label="Create code"
        icon="pi pi-plus"
        :loading="creating"
        :disabled="loading"
        @click="createCode"
      />

      <Button label="Close" text @click="emit('update:visible', false)" />
    </template>
  </Dialog>
</template>