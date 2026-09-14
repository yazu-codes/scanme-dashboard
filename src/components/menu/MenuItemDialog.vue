<script setup>
import { computed, reactive, watch, ref } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import AutoComplete from 'primevue/autocomplete'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import { uploadImage, storageKeyToPublicUrl } from '@/services/filesApi'

const props = defineProps({
  visible: Boolean,
  item: { type: Object, default: null },
  menuId: { type: [Number, String], required: true },
  token: { type: String, default: null },

  /*
   * Categories already used elsewhere in this menu.
   */
  categories: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:visible', 'save'])

const uploading = ref(false)
const selectedFile = ref(null)

const form = reactive({
  name: '',
  name_en: '',
  price: 0,
  category: '',
  allergens: '',
  description: '',
  description_en: '',
  picture_url: '',
  display_order_position: 0,
  enabled: true,
})

/*
|--------------------------------------------------------------------------
| Category picker
|--------------------------------------------------------------------------
|
| Pick an existing category or type a new one - a closed
| list would make the first item of a new category
| impossible to create.
|
*/

const categorySuggestions = ref([])

/*
 * Accepts plain strings or { name, path } entries, so
 * the dialog still works if a caller passes a bare list.
 */
const knownCategories = computed(() =>
  props.categories
    .map((entry) =>
      typeof entry === 'string'
        ? { name: entry, path: '' }
        : {
            name: String(entry?.name ?? entry?.label ?? ''),
            path: String(entry?.path ?? ''),
          }
    )
    .filter((entry) => entry.name)
)

const categoryNames = computed(() =>
  knownCategories.value.map((entry) => entry.name)
)

/*
 * Suggestions stay plain strings so the field's value is
 * a string - selecting an object would put one straight
 * into form.category. The path is looked up for display
 * only.
 */
const categoryPaths = computed(
  () =>
    new Map(
      knownCategories.value.map((entry) => [entry.name, entry.path])
    )
)

function searchCategories(event) {
  const query = (event.query || '').trim().toLowerCase()

  categorySuggestions.value = query
    ? categoryNames.value.filter((name) =>
        name.toLowerCase().includes(query)
      )
    : [...categoryNames.value]
}

watch(
  () => props.visible,
  (isVisible) => {
    if (!isVisible) return

    Object.assign(form, {
      name: props.item?.name || '',
      name_en: props.item?.name_en || '',
      price: Number(props.item?.price || 0),
      category: props.item?.category || '',
      allergens: props.item?.allergens || '',
      description: props.item?.description || '',
      description_en: props.item?.description_en || '',
      picture_url: props.item?.picture_url || '',
      display_order_position: Number(props.item?.display_order_position || 0),
      enabled: props.item?.enabled === undefined ? true : Boolean(props.item.enabled),
    })

    selectedFile.value = null
    categorySuggestions.value = [...categoryNames.value]
  },
  { immediate: true }
)

async function submit() {
  if (!form.name.trim()) {
    window.alert('Item name is required.')
    return
  }

  let pictureUrl = form.picture_url.trim()

  if (selectedFile.value) {
    uploading.value = true
    try {
      const result = await uploadImage(
        selectedFile.value,
        props.menuId,
        props.token
      )

      if (!result?.storage_key) {
        throw new Error('Upload succeeded but no storage_key was returned')
      }

      pictureUrl = storageKeyToPublicUrl(result.storage_key)
    } finally {
      uploading.value = false
    }
  }

  const payload = {
    name: form.name.trim(),
    name_en: form.name_en.trim(),
    price: Number(form.price || 0),
    /*
     * Clearing the picker leaves null rather than '',
     * so this can't go straight to .trim().
     */
    category: String(form.category || '').trim(),
    allergens: form.allergens.trim(),
    description: form.description.trim(),
    description_en: form.description_en.trim(),
    picture_url: pictureUrl,
    display_order_position: Number(form.display_order_position || 0),
    enabled: Boolean(form.enabled),
  }

  emit('save', payload)
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="item ? 'Edit item' : 'Add item'"
    modal
    class="menu-dialog"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="form-grid">
      <label class="field">
        <span>Name *</span>
        <InputText v-model="form.name" />
      </label>

      <label class="field">
        <span>English name</span>
        <InputText v-model="form.name_en" />
      </label>

      <label class="field">
        <span>Price</span>
        <InputNumber v-model="form.price" :min="0" :minFractionDigits="2" :maxFractionDigits="2" />
      </label>

      <label class="field">
        <span>Display order</span>
        <InputNumber v-model="form.display_order_position" :min="0" />
      </label>

      <label class="field category-field">
        <span>Category</span>
        <AutoComplete
          v-model="form.category"
          :suggestions="categorySuggestions"
          dropdown
          completeOnFocus
          placeholder="Choose one or type a new name"
          @complete="searchCategories"
        >
          <template #option="slotProps">
            <div class="category-option">
              <span>{{ slotProps.option }}</span>

              <small
                v-if="categoryPaths.get(slotProps.option)"
                class="category-option-path"
              >
                {{ categoryPaths.get(slotProps.option) }}
              </small>
            </div>
          </template>
        </AutoComplete>
      </label>

      <label class="field">
        <span>Allergens</span>
        <InputText v-model="form.allergens" />
      </label>

      <label class="field field-full">
        <span>Description</span>
        <Textarea v-model="form.description" rows="3" />
      </label>

      <label class="field field-full">
        <span>English description</span>
        <Textarea v-model="form.description_en" rows="3" />
      </label>

      <label class="field field-full">
        <span>Picture URL</span>
        <InputText v-model="form.picture_url" />
      </label>

      <label class="field field-full">
        <span>Or upload image</span>
        <input type="file" accept="image/*" @change="selectedFile = $event.target.files?.[0] || null">
      </label>

      <div class="field field-full checkbox-field">
        <Checkbox v-model="form.enabled" binary inputId="enabled" />
        <label for="enabled">Enabled</label>
        <span class="help-text">Check to enable the item</span>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text :disabled="uploading" @click="emit('update:visible', false)" />
      <Button label="Save item" icon="pi pi-check" :loading="uploading" @click="submit" />
    </template>
  </Dialog>
</template>

<style scoped>
.checkbox-field {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

/*
 * AutoComplete renders a wrapper around its input, so
 * without this it won't fill the field like the plain
 * InputText beside it.
 */
.category-field :deep(.p-autocomplete) {
  width: 100%;
}

.category-field :deep(.p-autocomplete-input) {
  width: 100%;
}

.category-option {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.category-option-path {
  font-size: 0.75rem;
  opacity: 0.65;
}
</style>