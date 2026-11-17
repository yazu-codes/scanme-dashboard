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
  'import',
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
      @import="
        emit(
          'import',
          $event
        )
      "
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
  /*
   * dvh accounts for mobile browser chrome. With 100vh the dialog is
   * taller than the visible area, so the sticky export bar sits below
   * the fold and can't be reached.
   */
  height: 100dvh;
  max-height: 100dvh;
  margin: 0;
  border-radius: 0;
  display: flex;
  flex-direction: column;
}

.menu-to-csv-dialog .p-dialog-header {
  flex: 0 0 auto;
  padding: 12px 16px;
  border-bottom: 1px solid #d4dce4;
}

/* A full-screen dialog has no visible edge, so the close control has to be
   unmistakable rather than a faint glyph in the corner. */
.menu-to-csv-dialog .p-dialog-header-icons .p-dialog-header-icon {
  width: 44px;
  height: 44px;
}

/*
 * The content is the only scrolling area, so the header stays put and the
 * sticky review/export bars inside the tool anchor to it.
 */
.menu-to-csv-dialog .p-dialog-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0;
  /* Tinted, so the white cards read as cards instead of merging with the page */
  background: #eef2f6;
  /* Clears the iPhone home indicator under the sticky export bar */
  padding-bottom: env(safe-area-inset-bottom);
}

/*
 * Stays a readable column instead of stretching form fields across a 27"
 * monitor. The sticky bars need the same background as the content behind
 * them, or rows show through while scrolling.
 */
.menu-to-csv-dialog .wrap {
  --page-bg: #eef2f6;
  max-width: 1100px;
  padding: 16px 20px 24px;
}

/*
 * Needed here as well as in the component: this selector is two classes
 * and the component's own mobile rule is one, so without a matching
 * media query here the padding never shrinks on a phone.
 */
@media (max-width: 480px) {
  .menu-to-csv-dialog .wrap {
    padding: 12px 12px 20px;
  }

  .menu-to-csv-dialog .p-dialog-header {
    padding: 10px 12px;
  }
}
</style>