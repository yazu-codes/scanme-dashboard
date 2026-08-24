<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { groupItemsByCategory, uid } from '@/utils/menuUtils'
import MenuItemDialog from './MenuItemDialog.vue'

const props = defineProps({
  items: { type: Array, required: true },
  menuId: { type: [Number, String], required: true },
  token: { type: String, default: null },
})

const dialogVisible = ref(false)
const editingKey = ref(null)
const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.items

  return props.items.filter(item =>
    [item.name, item.name_en, item.category, item.description, item.allergens]
      .some(value => String(value || '').toLowerCase().includes(q))
  )
})

const groups = computed(() => groupItemsByCategory(filtered.value))

const editingItem = computed(() =>
  props.items.find(item => item._key === editingKey.value) || null
)

function openNew() {
  editingKey.value = null
  dialogVisible.value = true
}

function openEdit(item) {
  editingKey.value = item._key
  dialogVisible.value = true
}

function saveItem(values) {
  if (editingKey.value) {
    const item = props.items.find(row => row._key === editingKey.value)
    if (item) Object.assign(item, values)
  } else {
    props.items.push({
      _key: uid(),
      menu_id: props.menuId,
      ...values,
    })
  }

  dialogVisible.value = false
}

function removeItem(item) {
  if (!window.confirm(`Remove "${item.name}" from this menu draft?`)) return
  const index = props.items.findIndex(row => row._key === item._key)
  if (index >= 0) props.items.splice(index, 1)
}
</script>

<template>
  <section class="dashboard-card">
    <div class="card-heading with-action">
      <div>
        <h2>Menu items</h2>
        <span>{{ items.length }} total</span>
      </div>

      <Button label="Add item" icon="pi pi-plus" size="small" @click="openNew" />
    </div>

    <InputText v-model="search" placeholder="Search items..." class="item-search" />

    <div v-for="group in groups" :key="group.name" class="item-group">
      <h3>{{ group.name }} <small>{{ group.items.length }}</small></h3>

      <div v-for="item in group.items" :key="item._key" class="item-row">
        <div class="item-copy">
          <div class="item-title-line">
            <strong>{{ item.name }}</strong>
            <span v-if="!item.id" class="status-badge success">New</span>
            <span class="item-price">{{ Number(item.price || 0).toFixed(2) }}</span>
          </div>
          <p v-if="item.description">{{ item.description }}</p>
        </div>

        <div class="item-actions">
          <Button icon="pi pi-pencil" text rounded @click="openEdit(item)" />
          <Button icon="pi pi-trash" severity="danger" text rounded @click="removeItem(item)" />
        </div>
      </div>
    </div>

    <div v-if="!groups.length" class="empty-panel">
      No items found.
    </div>

    <MenuItemDialog
      v-model:visible="dialogVisible"
      :item="editingItem"
      :menu-id="menuId"
      :token="token"
      @save="saveItem"
    />
  </section>
</template>
