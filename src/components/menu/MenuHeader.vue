<script setup>
import Button from 'primevue/button'

defineProps({
  menu: { type: Object, required: true },
  dirty: Boolean,
  isAdmin: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle-suspended', 'delete'])
</script>

<template>
  <header class="menu-header">
    <div>
      <h1>{{ menu.menu_owner?.menu_owner_name || 'Unnamed menu' }}</h1>
      <p v-if="isAdmin">Menu #{{ menu.id }}</p>
    </div>

    <div class="menu-header-actions">
      <Button
        v-if="isAdmin"
        :label="menu.suspended ? 'Enable menu' : 'Suspend menu'"
        :icon="menu.suspended ? 'pi pi-play' : 'pi pi-pause'"
        outlined
        :disabled="dirty"
        @click="emit('toggle-suspended')"
      />

      <Button
        v-if="isAdmin"
        label="Delete menu"
        icon="pi pi-trash"
        severity="danger"
        outlined
        @click="emit('delete')"
      />
    </div>
  </header>
</template>
