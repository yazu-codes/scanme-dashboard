<script setup>
import { computed, ref } from 'vue'

import Button from 'primevue/button'
import Menu from 'primevue/menu'

const props = defineProps({
  menu: { type: Object, required: true },
  dirty: Boolean,
  isAdmin: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'toggle-suspended',
  'delete',
])

/*
|--------------------------------------------------------------------------
| Overflow menu
|--------------------------------------------------------------------------
|
| On narrow screens the admin buttons collapse into a
| single popup so they don't wrap onto their own row.
|
*/

const overflowMenu = ref(null)

const overflowItems = computed(() => [
  {
    label: props.menu.suspended
      ? 'Enable menu'
      : 'Suspend menu',
    icon: props.menu.suspended
      ? 'pi pi-play'
      : 'pi pi-pause',
    disabled: props.dirty,
    command: () => emit('toggle-suspended'),
  },
  {
    separator: true,
  },
  {
    label: 'Delete menu',
    icon: 'pi pi-trash',
    command: () => emit('delete'),
  },
])

function toggleOverflow(event) {
  overflowMenu.value?.toggle(event)
}
</script>

<template>
  <header class="menu-header">
    <div class="menu-header-title">
      <!--
        The h1 is hidden below the sidebar breakpoint,
        where the sticky top bar already names the menu.
      -->
      <h1>{{ menu.menu_owner?.menu_owner_name || 'Unnamed menu' }}</h1>
      <p v-if="isAdmin">Menu #{{ menu.id }}</p>
    </div>

    <!-- Wide screens: the buttons as they were -->
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

    <!-- Narrow screens: the same actions in a popup -->
    <template v-if="isAdmin">
      <Button
        class="menu-header-overflow"
        icon="pi pi-ellipsis-v"
        text
        rounded
        aria-label="Menu actions"
        aria-haspopup="true"
        aria-controls="menu-header-overflow-menu"
        @click="toggleOverflow"
      />

      <Menu
        id="menu-header-overflow-menu"
        ref="overflowMenu"
        :model="overflowItems"
        popup
      />
    </template>
  </header>
</template>

<style scoped>
.menu-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.menu-header-title {
  flex: 1 1 auto;
  min-width: 0;
}

.menu-header-title h1 {
  margin: 0;
  font-size: clamp(1.25rem, 5vw, 1.75rem);
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.menu-header-title p {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
  opacity: 0.7;
}

.menu-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.menu-header-overflow {
  display: none;
  flex: 0 0 auto;
}

/*
 * Same breakpoint as the sidebar drawer, so the title
 * disappears exactly when the sticky bar appears.
 */
@media (max-width: 900px) {
  /*
   * Specificity plus !important because
   * menu-dashboard.css also targets this heading, and
   * scoped styles alone would tie and lose on load
   * order.
   */
  .menu-header .menu-header-title h1 {
    display: none !important;
  }

  .menu-header-overflow {
    display: inline-flex;
  }

  .menu-header-actions {
    display: none;
  }
}
</style>