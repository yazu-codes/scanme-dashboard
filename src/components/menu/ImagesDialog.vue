<script setup>
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import Button from 'primevue/button'
import { ITEM_IMAGES_PUBLIC_BASE, listImages, uploadImage } from '@/services/filesApi'

const props = defineProps({
  visible: Boolean,
  menus: { type: Array, default: () => [] },
  token: { type: String, default: null },
  currentMenuId: { type: [Number, String], default: null },
})

const emit = defineEmits(['update:visible'])

const menuId = ref(null)
const images = ref([])
const files = ref([])
const loading = ref(false)
const uploading = ref(false)
const error = ref(null)

const options = () =>
  props.menus.map(menu => ({
    label: `${menu.menu_owner?.menu_owner_name || `Menu #${menu.id}`} (#${menu.id})`,
    value: menu.id,
  }))

const publicUrl = url => {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `${ITEM_IMAGES_PUBLIC_BASE}${url.startsWith('/') ? '' : '/'}${url}`
}

async function load() {
  if (!menuId.value) {
    images.value = []
    return
  }

  loading.value = true
  error.value = null
  try {
    images.value = await listImages(menuId.value)
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function uploadSelected() {
  if (!files.value.length || !menuId.value) return

  uploading.value = true
  try {
    for (const file of files.value) {
      await uploadImage(file, menuId.value, props.token)
    }
    files.value = []
    await load()
  } finally {
    uploading.value = false
  }
}

async function copy(url) {
  await navigator.clipboard.writeText(publicUrl(url))
}

watch(() => props.visible, value => {
  if (value) {
    menuId.value = props.currentMenuId || props.menus[0]?.id || null
    load()
  }
})

watch(menuId, load)
</script>

<template>
  <Dialog
    :visible="visible"
    header="Manage images"
    modal
    class="menu-dialog huge"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="images-toolbar">
      <Dropdown
        v-model="menuId"
        :options="options()"
        optionLabel="label"
        optionValue="value"
        placeholder="Select menu"
      />

      <input
        type="file"
        accept="image/*"
        multiple
        @change="files = Array.from($event.target.files || [])"
      >

      <Button
        label="Upload"
        icon="pi pi-upload"
        :loading="uploading"
        :disabled="!files.length || !menuId"
        @click="uploadSelected"
      />
    </div>

    <div v-if="loading" class="empty-panel">Loading...</div>
    <div v-else-if="error" class="empty-panel">{{ error }}</div>

    <div v-else class="images-grid">
      <article v-for="(image, index) in images" :key="`${image.url}-${index}`" class="image-card">
        <img :src="publicUrl(image.url)" alt="">
        <code>{{ publicUrl(image.url) }}</code>
        <Button label="Copy URL" icon="pi pi-copy" size="small" text @click="copy(image.url)" />
      </article>

      <div v-if="!images.length" class="empty-panel">
        No images for this menu.
      </div>
    </div>

    <template #footer>
      <Button label="Close" @click="emit('update:visible', false)" />
    </template>
  </Dialog>
</template>
