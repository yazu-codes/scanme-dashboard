<script setup>
import Button from 'primevue/button'

defineProps({
  saving: Boolean,
})

const emit = defineEmits(['save', 'discard'])
</script>

<template>
  <div class="save-bar">
    <span>You have unsaved menu changes.</span>

    <div class="save-bar-actions">
      <Button label="Discard" text :disabled="saving" @click="emit('discard')" />
      <Button label="Save changes" icon="pi pi-check" :loading="saving" @click="emit('save')" />
    </div>
  </div>
</template>
