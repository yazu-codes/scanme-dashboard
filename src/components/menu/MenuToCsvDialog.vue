<script setup>
import Dialog from 'primevue/dialog'

import MenuToCsv
  from './MenuToCsv.vue'

defineProps({
  visible: Boolean,

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
})

const emit = defineEmits([
  'update:visible',
])
</script>

<template>
  <Dialog
    :visible="visible"
    header="Меню → CSV"
    modal
    :draggable="false"
    class="menu-dialog menu-to-csv-dialog"
    @update:visible="
      emit(
        'update:visible',
        $event
      )
    "
  >
    <!--
      The tool keeps its own heading, so it's hidden here
      to avoid printing the title twice.
    -->
    <MenuToCsv
      class="in-dialog"
      :menus="menus"
      :current-menu-id="currentMenuId"
    />
  </Dialog>
</template>

<style scoped>
.in-dialog :deep(h2) {
  display: none;
}
</style>

<!--
  Unscoped: PrimeVue teleports the dialog to <body>, so scoped selectors
  never reach it. Keyed to the custom class so no other dialog is affected.
-->
<style>
.menu-to-csv-dialog.p-dialog {
  width: 100vw;
  max-width: 100vw;
  height: 100vh;
  max-height: 100vh;
  margin: 0;
  border-radius: 0;
  display: flex;
  flex-direction: column;
}

.menu-to-csv-dialog .p-dialog-header {
  flex: 0 0 auto;
}

/*
 * The content is the only scrolling area, so the header stays put while
 * a long row grid scrolls underneath it.
 */
.menu-to-csv-dialog .p-dialog-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0;
}

/* The tool centres itself at 1040px on its own page; in here it fills. */
.menu-to-csv-dialog .wrap {
  max-width: none;
  padding: 16px 20px 24px;
}
</style>