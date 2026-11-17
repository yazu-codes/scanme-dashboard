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
    class="menu-dialog wide"
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

.in-dialog :deep(.wrap) {
  padding: 0;
}
</style>