<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'

import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Dropdown from 'primevue/dropdown'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'

const route = useRoute()

/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
|
| The GET endpoint is:
|
|   {API_BASE}/{name}
|
| Update the mutation endpoints below to match your backend.
|
*/

const API_BASE = import.meta.env.VITE_API_BASE

const getMenuUrl = (name) =>
  `${API_BASE}/${encodeURIComponent(name)}`

const createItemUrl = (name) =>
  `${API_BASE}/${encodeURIComponent(name)}/items`

const updateItemUrl = (name, item) =>
  `${API_BASE}/${encodeURIComponent(name)}/items/${encodeURIComponent(
    item.id ?? item.name
  )}`

const deleteItemUrl = (name, item) =>
  `${API_BASE}/${encodeURIComponent(name)}/items/${encodeURIComponent(
    item.id ?? item.name
  )}`

/*
|--------------------------------------------------------------------------
| State
|--------------------------------------------------------------------------
*/

const menu = ref(null)

const loading = ref(false)
const saving = ref(false)
const error = ref(null)

const search = ref('')
const selectedCategory = ref(null)

const showItemDialog = ref(false)
const showSettingsDialog = ref(false)

const isEditing = ref(false)
const editingItemIndex = ref(null)

const selectedItem = ref(null)

const form = ref(emptyItem())

const settingsForm = ref(emptySettings())

/*
|--------------------------------------------------------------------------
| Forms
|--------------------------------------------------------------------------
*/

function emptyItem() {
  return {
    name: '',
    name_en: '',
    price: null,
    description: '',
    description_en: '',
    picture_url: '',
    category: '',
    allergens: '',
    display_order_position: null,
  }
}

function emptySettings() {
  return {
    menu_owner_name: '',
    menu_owner_phone: '',
    menu_owner_logo_url: '',
    menu_owner_slogan: '',
    menu_owner_slogan_en: '',
    menu_owner_place_background_url: '',
    menu_owner_url_name: '',
    background_color: '#e0e0e0',
    font_color: '#000000',
    font_family: 'Inter',
    font_size: 16,
  }
}

/*
|--------------------------------------------------------------------------
| Computed
|--------------------------------------------------------------------------
*/

const menuData = computed(() => menu.value?.menu || null)

const owner = computed(() => menuData.value?.menu_owner || {})

const configuration = computed(() => {
  return menuData.value?.menu_configuration || {}
})

const menuItems = computed(() => {
  return menuData.value?.menu_items || []
})

const categoryConfiguration = computed(() => {
  const value = configuration.value.category_order

  if (!value) return []

  if (Array.isArray(value)) {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return []
  }
})

const categories = computed(() => {
  const configured = categoryConfiguration.value
    .map(category => category?.label)
    .filter(Boolean)

  const actualCategories = [
    ...new Set(
      menuItems.value
        .map(item => item.category)
        .filter(Boolean)
    ),
  ]

  // Preserve backend ordering, then include any category
  // that exists in the data but isn't in category_order.
  return [
    ...configured.filter(category =>
      actualCategories.includes(category)
    ),
    ...actualCategories.filter(category =>
      !configured.includes(category)
    ),
  ]
})

const categoryOptions = computed(() => {
  return categories.value.map(category => ({
    label: category,
    value: category,
  }))
})

const filteredItems = computed(() => {
  const query = search.value.trim().toLowerCase()

  return menuItems.value
    .map((item, index) => ({
      ...item,
      _index: index,
    }))
    .filter(item => {
      const matchesSearch =
        !query ||
        item.name?.toLowerCase().includes(query) ||
        item.name_en?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query) ||
        item.allergens?.toLowerCase().includes(query)

      const matchesCategory =
        !selectedCategory.value ||
        item.category === selectedCategory.value

      return matchesSearch && matchesCategory
    })
    .sort((a, b) => {
      const categoryA = categories.value.indexOf(a.category)
      const categoryB = categories.value.indexOf(b.category)

      if (categoryA !== categoryB) {
        return categoryA - categoryB
      }

      return (
        (a.display_order_position || 0) -
        (b.display_order_position || 0)
      )
    })
})

const totalItems = computed(() => menuItems.value.length)

const totalCategories = computed(() => categories.value.length)

const itemsWithImages = computed(() => {
  return menuItems.value.filter(item => item.picture_url).length
})

const itemsWithoutImages = computed(() => {
  return totalItems.value - itemsWithImages.value
})

const averagePrice = computed(() => {
  if (!menuItems.value.length) return 0

  const validPrices = menuItems.value
    .map(item => Number(item.price))
    .filter(price => Number.isFinite(price))

  if (!validPrices.length) return 0

  return (
    validPrices.reduce((sum, price) => sum + price, 0) /
    validPrices.length
  )
})

const categoryStats = computed(() => {
  return categories.value.map(category => ({
    category,
    count: menuItems.value.filter(
      item => item.category === category
    ).length,
  }))
})

/*
|--------------------------------------------------------------------------
| Formatting
|--------------------------------------------------------------------------
*/

const formatPrice = value => {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  return `${Number(value).toFixed(2)} лв.`
}

const formatNumber = value => {
  return new Intl.NumberFormat('bg-BG').format(value)
}

const getImageUrl = item => {
  return item?.picture_url || null
}

const getItemInitials = item => {
  const name = item?.name || ''

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
}

/*
|--------------------------------------------------------------------------
| API helpers
|--------------------------------------------------------------------------
*/

const getMenuName = () => {
  return (
    route.params.name ||
    route.query.name ||
    menuData.value?.menu_owner?.menu_owner_url_name
  )
}

const parseApiError = async response => {
  try {
    const data = await response.json()

    return (
      data?.error ||
      data?.message ||
      `Request failed with status ${response.status}`
    )
  } catch {
    return `Request failed with status ${response.status}`
  }
}

/*
|--------------------------------------------------------------------------
| Load menu
|--------------------------------------------------------------------------
*/

const loadMenu = async () => {
  try {
    loading.value = true
    error.value = null

    const name = getMenuName()

    if (!name) {
      throw new Error(
        'Menu name is missing. Expected route parameter: /menu/:name'
      )
    }

    let wholeURL = getMenuUrl(name)

    console.log(wholeURL)

    const response = await fetch(wholeURL)

    if (!response.ok) {
      throw new Error(await parseApiError(response))
    }

    const data = await response.json()
    console.log(data)

    menu.value = data

    initializeSettings()

    if (
      selectedCategory.value &&
      !categories.value.includes(selectedCategory.value)
    ) {
      selectedCategory.value = null
    }
  } catch (err) {
    console.error('Failed to load menu:', err)

    error.value = `Failed to load menu: ${err.message}`
  } finally {
    loading.value = false
  }
}

/*
|--------------------------------------------------------------------------
| Item CRUD
|--------------------------------------------------------------------------
*/

const openCreateItemDialog = () => {
  isEditing.value = false
  editingItemIndex.value = null
  form.value = emptyItem()

  if (selectedCategory.value) {
    form.value.category = selectedCategory.value
  } else {
    form.value.category = categories.value[0] || ''
  }

  showItemDialog.value = true
}

const openEditItemDialog = item => {
  isEditing.value = true
  editingItemIndex.value = item._index

  form.value = {
    name: item.name || '',
    name_en: item.name_en || '',
    price:
      item.price === null ||
      item.price === undefined
        ? null
        : Number(item.price),
    description: item.description || '',
    description_en: item.description_en || '',
    picture_url: item.picture_url || '',
    category: item.category || '',
    allergens: item.allergens || '',
    display_order_position:
      item.display_order_position ?? null,
  }

  showItemDialog.value = true
}

const validateItem = () => {
  if (!form.value.name.trim()) {
    error.value = 'Item name is required'
    return false
  }

  if (!form.value.category) {
    error.value = 'Category is required'
    return false
  }

  if (
    form.value.price === null ||
    form.value.price === undefined ||
    Number.isNaN(Number(form.value.price))
  ) {
    error.value = 'Price is required'
    return false
  }

  return true
}

const buildItemPayload = () => {
  return {
    name: form.value.name.trim(),
    name_en: form.value.name_en?.trim() || '',
    price: Number(form.value.price),
    description: form.value.description?.trim() || '',
    description_en:
      form.value.description_en?.trim() || '',
    picture_url: form.value.picture_url?.trim() || '',
    category: form.value.category,
    allergens: form.value.allergens?.trim() || '',
    display_order_position:
      form.value.display_order_position === null ||
      form.value.display_order_position === undefined
        ? null
        : Number(form.value.display_order_position),
  }
}

const saveItem = async () => {
  if (!validateItem()) return

  try {
    saving.value = true
    error.value = null

    const name = getMenuName()
    const payload = buildItemPayload()

    /*
     * If your backend uses a different mutation contract,
     * only this section needs to change.
     */

    if (isEditing.value) {
      const existingItem =
        menuItems.value[editingItemIndex.value]

      const response = await fetch(
        updateItemUrl(name, existingItem),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      )

      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
    } else {
      const response = await fetch(
        createItemUrl(name),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      )

      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
    }

    showItemDialog.value = false

    await loadMenu()
  } catch (err) {
    console.error('Failed to save item:', err)

    error.value = `Failed to save item: ${err.message}`
  } finally {
    saving.value = false
  }
}

const deleteItem = async item => {
  try {
    saving.value = true
    error.value = null

    const name = getMenuName()

    const response = await fetch(
      deleteItemUrl(name, item),
      {
        method: 'DELETE',
      }
    )

    if (!response.ok) {
      throw new Error(await parseApiError(response))
    }

    await loadMenu()
  } catch (err) {
    console.error('Failed to delete item:', err)

    error.value = `Failed to delete item: ${err.message}`
  } finally {
    saving.value = false
  }
}

/*
|--------------------------------------------------------------------------
| Settings
|--------------------------------------------------------------------------
*/

const initializeSettings = () => {
  settingsForm.value = {
    menu_owner_name: owner.value.menu_owner_name || '',
    menu_owner_phone: owner.value.menu_owner_phone || '',
    menu_owner_logo_url:
      owner.value.menu_owner_logo_url || '',
    menu_owner_slogan:
      owner.value.menu_owner_slogan || '',
    menu_owner_slogan_en:
      owner.value.menu_owner_slogan_en || '',
    menu_owner_place_background_url:
      owner.value.menu_owner_place_background_url || '',
    menu_owner_url_name:
      owner.value.menu_owner_url_name || '',
    background_color:
      configuration.value.background_color || '#e0e0e0',
    font_color:
      configuration.value.font_color || '#000000',
    font_family:
      configuration.value.font_family || 'Inter',
    font_size:
      configuration.value.font_size || 16,
  }
}

const openSettingsDialog = () => {
  initializeSettings()
  showSettingsDialog.value = true
}

const saveSettings = async () => {
  /*
   * The supplied backend JSON only defines the GET response.
   *
   * Keep the settings payload here ready for your backend
   * mutation endpoint.
   */

  try {
    saving.value = true
    error.value = null

    const name = getMenuName()

    const payload = {
      menu_owner: {
        menu_owner_name:
          settingsForm.value.menu_owner_name,
        menu_owner_phone:
          settingsForm.value.menu_owner_phone,
        menu_owner_logo_url:
          settingsForm.value.menu_owner_logo_url,
        menu_owner_slogan:
          settingsForm.value.menu_owner_slogan,
        menu_owner_slogan_en:
          settingsForm.value.menu_owner_slogan_en,
        menu_owner_place_background_url:
          settingsForm.value.menu_owner_place_background_url,
        menu_owner_url_name:
          settingsForm.value.menu_owner_url_name,
      },

      menu_configuration: {
        ...configuration.value,
        background_color:
          settingsForm.value.background_color,
        font_color:
          settingsForm.value.font_color,
        font_family:
          settingsForm.value.font_family,
        font_size:
          Number(settingsForm.value.font_size),
      },
    }

    /*
     * Expected endpoint:
     *
     * PUT {API_BASE}/{name}
     *
     * Change this if your backend uses another endpoint.
     */

    const response = await fetch(
      getMenuUrl(name),
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    if (!response.ok) {
      throw new Error(await parseApiError(response))
    }

    showSettingsDialog.value = false

    await loadMenu()
  } catch (err) {
    console.error('Failed to save menu settings:', err)

    error.value = `Failed to save settings: ${err.message}`
  } finally {
    saving.value = false
  }
}

/*
|--------------------------------------------------------------------------
| Image
|--------------------------------------------------------------------------
*/

const handleImageError = event => {
  event.target.style.display = 'none'
}

const openItemPreview = item => {
  selectedItem.value = item
}

/*
|--------------------------------------------------------------------------
| Category filter
|--------------------------------------------------------------------------
*/

const clearFilters = () => {
  search.value = ''
  selectedCategory.value = null
}

/*
|--------------------------------------------------------------------------
| Lifecycle
|--------------------------------------------------------------------------
*/

onMounted(() => {
  loadMenu()
})
</script>

<template>
  <div class="admin-page">
    <!-- Loading -->
    <div
      v-if="loading"
      class="loading-state"
    >
      <ProgressSpinner
        aria-label="Loading menu"
        style="width: 42px; height: 42px"
        strokeWidth="4"
      />

      <p>Loading menu...</p>
    </div>

    <!-- Error -->
    <div
      v-else-if="error && !menu"
      class="error-page"
    >
      <Message
        severity="error"
        :text="error"
        class="error-message"
      />

      <Button
        label="Retry"
        icon="pi pi-refresh"
        @click="loadMenu"
      />
    </div>

    <!-- Dashboard -->
    <template v-else-if="menu">
      <!-- Header -->
      <header class="page-header">
        <div class="header-left">
          <div
            v-if="owner.menu_owner_logo_url"
            class="header-logo"
          >
            <img
              :src="owner.menu_owner_logo_url"
              :alt="owner.menu_owner_name"
              @error="handleImageError"
            />
          </div>

          <div class="header-title">
            <div class="breadcrumb">
              Menu Administration
              <span>/</span>
              {{ owner.menu_owner_name || 'Menu' }}
            </div>

            <h1>
              {{ owner.menu_owner_name || 'Menu' }}
            </h1>

            <p>
              Manage menu items, categories and menu settings.
            </p>
          </div>
        </div>

        <div class="header-actions">
          <Button
            label="Refresh"
            icon="pi pi-refresh"
            text
            :loading="loading"
            @click="loadMenu"
          />

          <Button
            label="Settings"
            icon="pi pi-cog"
            outlined
            @click="openSettingsDialog"
          />

          <Button
            label="New Item"
            icon="pi pi-plus"
            @click="openCreateItemDialog"
          />
        </div>
      </header>

      <!-- Error notification -->
      <Message
        v-if="error"
        severity="error"
        :text="error"
        class="mb-6"
        closable
        @close="error = null"
      />

      <!-- Statistics -->
      <section class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">
            <i class="pi pi-list"></i>
          </div>

          <div>
            <div class="stat-value">
              {{ formatNumber(totalItems) }}
            </div>

            <div class="stat-label">
              Menu Items
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">
            <i class="pi pi-tags"></i>
          </div>

          <div>
            <div class="stat-value">
              {{ formatNumber(totalCategories) }}
            </div>

            <div class="stat-label">
              Categories
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">
            <i class="pi pi-image"></i>
          </div>

          <div>
            <div class="stat-value">
              {{ formatNumber(itemsWithImages) }}
            </div>

            <div class="stat-label">
              Items With Images
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">
            <i class="pi pi-wallet"></i>
          </div>

          <div>
            <div class="stat-value">
              {{ formatPrice(averagePrice) }}
            </div>

            <div class="stat-label">
              Average Price
            </div>
          </div>
        </div>
      </section>

      <!-- Main content -->
      <section class="content-section">
        <div class="section-header">
          <div>
            <h2>Menu Items</h2>

            <p>
              {{ filteredItems.length }}
              of
              {{ totalItems }}
              items
            </p>
          </div>

          <Button
            label="Add Menu Item"
            icon="pi pi-plus"
            @click="openCreateItemDialog"
          />
        </div>

        <!-- Filters -->
        <div class="filter-bar">
          <div class="search-wrapper">
            <i class="pi pi-search"></i>

            <InputText
              v-model="search"
              placeholder="Search menu items..."
              class="search-input"
            />
          </div>

          <Dropdown
            v-model="selectedCategory"
            :options="categoryOptions"
            option-label="label"
            option-value="value"
            placeholder="All Categories"
            showClear
            class="category-filter"
          />

          <Button
            v-if="search || selectedCategory"
            label="Clear"
            icon="pi pi-filter-slash"
            text
            @click="clearFilters"
          />
        </div>

        <!-- Desktop table -->
        <div class="desktop-table">
          <DataTable
            :value="filteredItems"
            paginator
            :rows="10"
            :rowsPerPageOptions="[10, 25, 50]"
            stripedRows
            class="menu-table"
            emptyMessage="No menu items found."
          >
            <Column
              header="Item"
              style="width: 32%"
            >
              <template #body="{ data }">
                <div class="item-cell">
                  <div class="item-thumbnail">
                    <img
                      v-if="getImageUrl(data)"
                      :src="getImageUrl(data)"
                      :alt="data.name"
                      @error="handleImageError"
                    />

                    <span v-else>
                      {{ getItemInitials(data) }}
                    </span>
                  </div>

                  <div class="item-info">
                    <div class="item-name">
                      {{ data.name }}
                    </div>

                    <div
                      v-if="data.name_en"
                      class="item-secondary"
                    >
                      {{ data.name_en }}
                    </div>

                    <div
                      v-if="data.description"
                      class="item-description"
                    >
                      {{ data.description }}
                    </div>
                  </div>
                </div>
              </template>
            </Column>

            <Column
              header="Category"
              style="width: 16%"
            >
              <template #body="{ data }">
                <span class="category-badge">
                  {{ data.category || '—' }}
                </span>
              </template>
            </Column>

            <Column
              header="Price"
              style="width: 12%"
            >
              <template #body="{ data }">
                <span class="price-cell">
                  {{ formatPrice(data.price) }}
                </span>
              </template>
            </Column>

            <Column
              header="Allergens"
              style="width: 22%"
            >
              <template #body="{ data }">
                <span
                  v-if="data.allergens"
                  class="allergen-cell"
                >
                  {{ data.allergens }}
                </span>

                <span
                  v-else
                  class="muted"
                >
                  —
                </span>
              </template>
            </Column>

            <Column
              header=""
              style="width: 18%"
            >
              <template #body="{ data }">
                <div class="table-actions">
                  <Button
                    icon="pi pi-eye"
                    rounded
                    text
                    size="small"
                    aria-label="Preview item"
                    @click="openItemPreview(data)"
                  />

                  <Button
                    icon="pi pi-pencil"
                    rounded
                    text
                    size="small"
                    aria-label="Edit item"
                    @click="openEditItemDialog(data)"
                  />
                </div>
              </template>
            </Column>
          </DataTable>
        </div>

        <!-- Mobile cards -->
        <div class="mobile-items">
          <div
            v-for="item in filteredItems"
            :key="`${item.name}-${item._index}`"
            class="mobile-item-card"
          >
            <div class="mobile-item-main">
              <div class="item-thumbnail mobile-thumbnail">
                <img
                  v-if="getImageUrl(item)"
                  :src="getImageUrl(item)"
                  :alt="item.name"
                  @error="handleImageError"
                />

                <span v-else>
                  {{ getItemInitials(item) }}
                </span>
              </div>

              <div class="mobile-item-info">
                <h3>
                  {{ item.name }}
                </h3>

                <span class="category-badge">
                  {{ item.category || '—' }}
                </span>

                <p
                  v-if="item.description"
                  class="item-description"
                >
                  {{ item.description }}
                </p>
              </div>

              <div class="mobile-price">
                {{ formatPrice(item.price) }}
              </div>
            </div>

            <div class="mobile-item-footer">
              <span
                v-if="item.allergens"
                class="allergen-cell"
              >
                {{ item.allergens }}
              </span>

              <div class="table-actions">
                <Button
                  icon="pi pi-eye"
                  rounded
                  text
                  size="small"
                  @click="openItemPreview(item)"
                />

                <Button
                  icon="pi pi-pencil"
                  rounded
                  text
                  size="small"
                  @click="openEditItemDialog(item)"
                />
              </div>
            </div>
          </div>

          <div
            v-if="filteredItems.length === 0"
            class="empty-state"
          >
            <i class="pi pi-search"></i>

            <h3>No menu items found</h3>

            <p>
              Try changing your search or category filter.
            </p>

            <Button
              label="Clear Filters"
              text
              @click="clearFilters"
            />
          </div>
        </div>
      </section>

      <!-- Categories -->
      <section class="content-section category-section">
        <div class="section-header">
          <div>
            <h2>Categories</h2>

            <p>
              Menu categories and item counts
            </p>
          </div>
        </div>

        <div class="category-grid">
          <div
            v-for="stat in categoryStats"
            :key="stat.category"
            class="category-card"
            :class="{
              selected: selectedCategory === stat.category
            }"
            @click="
              selectedCategory =
                selectedCategory === stat.category
                  ? null
                  : stat.category
            "
          >
            <div class="category-card-icon">
              <i class="pi pi-tag"></i>
            </div>

            <div class="category-card-info">
              <h3>
                {{ stat.category }}
              </h3>

              <p>
                {{ stat.count }}
                item{{ stat.count === 1 ? '' : 's' }}
              </p>
            </div>

            <i class="pi pi-chevron-right"></i>
          </div>
        </div>
      </section>

      <!-- Menu owner -->
      <section class="content-section owner-section">
        <div class="section-header">
          <div>
            <h2>Menu Information</h2>

            <p>
              Basic restaurant and menu configuration
            </p>
          </div>

          <Button
            label="Edit Settings"
            icon="pi pi-cog"
            outlined
            @click="openSettingsDialog"
          />
        </div>

        <div class="owner-grid">
          <div class="owner-info-card">
            <span class="owner-label">
              Restaurant
            </span>

            <strong>
              {{ owner.menu_owner_name || '—' }}
            </strong>
          </div>

          <div class="owner-info-card">
            <span class="owner-label">
              Phone
            </span>

            <strong>
              {{ owner.menu_owner_phone || '—' }}
            </strong>
          </div>

          <div class="owner-info-card">
            <span class="owner-label">
              Font
            </span>

            <strong>
              {{ configuration.font_family || '—' }}
            </strong>
          </div>

          <div class="owner-info-card">
            <span class="owner-label">
              Font Size
            </span>

            <strong>
              {{ configuration.font_size || '—' }}px
            </strong>
          </div>
        </div>
      </section>
    </template>

    <!-- Preview Dialog -->
    <Dialog
      v-model:visible="selectedItem"
      modal
      header="Menu Item Preview"
      class="item-preview-dialog"
    >
      <template v-if="selectedItem">
        <div class="preview-content">
          <div
            v-if="selectedItem.picture_url"
            class="preview-image"
          >
            <img
              :src="selectedItem.picture_url"
              :alt="selectedItem.name"
              @error="handleImageError"
            />
          </div>

          <div class="preview-details">
            <div class="preview-header">
              <div>
                <h2>
                  {{ selectedItem.name }}
                </h2>

                <span class="category-badge">
                  {{ selectedItem.category }}
                </span>
              </div>

              <strong class="preview-price">
                {{ formatPrice(selectedItem.price) }}
              </strong>
            </div>

            <div
              v-if="selectedItem.name_en"
              class="preview-field"
            >
              <label>English Name</label>
              <p>{{ selectedItem.name_en }}</p>
            </div>

            <div
              v-if="selectedItem.description"
              class="preview-field"
            >
              <label>Description</label>
              <p>{{ selectedItem.description }}</p>
            </div>

            <div
              v-if="selectedItem.description_en"
              class="preview-field"
            >
              <label>English Description</label>
              <p>{{ selectedItem.description_en }}</p>
            </div>

            <div
              v-if="selectedItem.allergens"
              class="preview-field"
            >
              <label>Allergens</label>
              <p>{{ selectedItem.allergens }}</p>
            </div>

            <div class="preview-meta">
              <span>
                Display order:
                <strong>
                  {{ selectedItem.display_order_position ?? '—' }}
                </strong>
              </span>

              <span>
                Image:
                <strong>
                  {{ selectedItem.picture_url ? 'Yes' : 'No' }}
                </strong>
              </span>
            </div>
          </div>
        </div>
      </template>
    </Dialog>

    <!-- Create/Edit Item -->
    <Dialog
      v-model:visible="showItemDialog"
      :header="isEditing ? 'Edit Menu Item' : 'New Menu Item'"
      modal
      class="item-form-dialog"
    >
      <div class="form-grid">
        <div class="form-field full">
          <label for="item-name">
            Name
            <span class="required">*</span>
          </label>

          <InputText
            id="item-name"
            v-model="form.name"
            class="w-full"
            placeholder="e.g. Сьомга Бум"
            autofocus
          />
        </div>

        <div class="form-field">
          <label for="item-name-en">
            English Name
          </label>

          <InputText
            id="item-name-en"
            v-model="form.name_en"
            class="w-full"
            placeholder="Optional"
          />
        </div>

        <div class="form-field">
          <label for="item-category">
            Category
            <span class="required">*</span>
          </label>

          <Dropdown
            id="item-category"
            v-model="form.category"
            :options="categoryOptions"
            option-label="label"
            option-value="value"
            placeholder="Select category"
            class="w-full"
            editable
          />
        </div>

        <div class="form-field">
          <label for="item-price">
            Price
            <span class="required">*</span>
          </label>

          <InputNumber
            id="item-price"
            v-model="form.price"
            class="w-full"
            mode="decimal"
            :min="0"
            :minFractionDigits="2"
            :maxFractionDigits="2"
            suffix=" лв."
          />
        </div>

        <div class="form-field">
          <label for="item-order">
            Display Order
          </label>

          <InputNumber
            id="item-order"
            v-model="form.display_order_position"
            class="w-full"
            :min="0"
          />
        </div>

        <div class="form-field full">
          <label for="item-description">
            Description
          </label>

          <Textarea
            id="item-description"
            v-model="form.description"
            class="w-full"
            rows="3"
            placeholder="Optional item description"
          />
        </div>

        <div class="form-field full">
          <label for="item-description-en">
            English Description
          </label>

          <Textarea
            id="item-description-en"
            v-model="form.description_en"
            class="w-full"
            rows="3"
            placeholder="Optional English description"
          />
        </div>

        <div class="form-field full">
          <label for="item-image">
            Image URL
          </label>

          <InputText
            id="item-image"
            v-model="form.picture_url"
            class="w-full"
            placeholder="https://..."
          />

          <div
            v-if="form.picture_url"
            class="image-preview-small"
          >
            <img
              :src="form.picture_url"
              alt="Preview"
              @error="handleImageError"
            />
          </div>
        </div>

        <div class="form-field full">
          <label for="item-allergens">
            Allergens
          </label>

          <InputText
            id="item-allergens"
            v-model="form.allergens"
            class="w-full"
            placeholder="e.g. риба, соя, мляко, сусам"
          />

          <small>
            Enter allergens as a comma-separated list.
          </small>
        </div>
      </div>

      <template #footer>
        <Button
          label="Cancel"
          text
          :disabled="saving"
          @click="showItemDialog = false"
        />

        <Button
          :label="isEditing ? 'Save Changes' : 'Create Item'"
          icon="pi pi-check"
          :loading="saving"
          @click="saveItem"
        />
      </template>
    </Dialog>

    <!-- Settings -->
    <Dialog
      v-model:visible="showSettingsDialog"
      header="Menu Settings"
      modal
      class="settings-dialog"
    >
      <div class="form-grid">
        <div class="form-section-title full">
          Restaurant Information
        </div>

        <div class="form-field">
          <label for="owner-name">
            Restaurant Name
          </label>

          <InputText
            id="owner-name"
            v-model="settingsForm.menu_owner_name"
            class="w-full"
          />
        </div>

        <div class="form-field">
          <label for="owner-phone">
            Phone
          </label>

          <InputText
            id="owner-phone"
            v-model="settingsForm.menu_owner_phone"
            class="w-full"
          />
        </div>

        <div class="form-field full">
          <label for="owner-logo">
            Logo URL
          </label>

          <InputText
            id="owner-logo"
            v-model="settingsForm.menu_owner_logo_url"
            class="w-full"
          />
        </div>

        <div class="form-field">
          <label for="owner-slogan">
            Slogan
          </label>

          <InputText
            id="owner-slogan"
            v-model="settingsForm.menu_owner_slogan"
            class="w-full"
          />
        </div>

        <div class="form-field">
          <label for="owner-slogan-en">
            English Slogan
          </label>

          <InputText
            id="owner-slogan-en"
            v-model="settingsForm.menu_owner_slogan_en"
            class="w-full"
          />
        </div>

        <div class="form-field full">
          <label for="owner-background">
            Background Image URL
          </label>

          <InputText
            id="owner-background"
            v-model="
              settingsForm.menu_owner_place_background_url
            "
            class="w-full"
          />
        </div>

        <div class="form-section-title full">
          Appearance
        </div>

        <div class="form-field">
          <label for="background-color">
            Background Color
          </label>

          <div class="color-input">
            <input
              id="background-color"
              v-model="settingsForm.background_color"
              type="color"
            />

            <InputText
              v-model="settingsForm.background_color"
            />
          </div>
        </div>

        <div class="form-field">
          <label for="font-color">
            Font Color
          </label>

          <div class="color-input">
            <input
              id="font-color"
              v-model="settingsForm.font_color"
              type="color"
            />

            <InputText
              v-model="settingsForm.font_color"
            />
          </div>
        </div>

        <div class="form-field">
          <label for="font-family">
            Font Family
          </label>

          <InputText
            id="font-family"
            v-model="settingsForm.font_family"
            class="w-full"
          />
        </div>

        <div class="form-field">
          <label for="font-size">
            Font Size
          </label>

          <InputNumber
            id="font-size"
            v-model="settingsForm.font_size"
            class="w-full"
            :min="8"
            :max="48"
            suffix=" px"
          />
        </div>
      </div>

      <template #footer>
        <Button
          label="Cancel"
          text
          :disabled="saving"
          @click="showSettingsDialog = false"
        />

        <Button
          label="Save Settings"
          icon="pi pi-check"
          :loading="saving"
          @click="saveSettings"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
/* ============================================================
   Page
============================================================ */

.admin-page {
  max-width: 1400px;
  margin: 0 auto;

  padding: 2rem;

  color: var(--text, #111827);
}

/* ============================================================
   Loading / Error
============================================================ */

.loading-state {
  min-height: 60vh;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  gap: 1rem;

  color: var(--text-muted, #6b7280);
}

.error-page {
  min-height: 60vh;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  gap: 1rem;
}

.error-message {
  width: 100%;
  max-width: 650px;
}

/* ============================================================
   Header
============================================================ */

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;

  gap: 2rem;

  margin-bottom: 2rem;
}

.header-left {
  min-width: 0;

  display: flex;
  align-items: center;

  gap: 1rem;
}

.header-logo {
  width: 64px;
  height: 64px;

  flex: 0 0 64px;

  overflow: hidden;

  border-radius: 12px;

  background: #f3f4f6;
  border: 1px solid #e5e7eb;
}

.header-logo img {
  width: 100%;
  height: 100%;

  object-fit: cover;
}

.header-title {
  min-width: 0;
}

.breadcrumb {
  display: flex;
  align-items: center;

  gap: 0.5rem;

  margin-bottom: 0.35rem;

  color: var(--text-muted, #6b7280);

  font-size: 0.75rem;
  font-weight: 500;
}

.breadcrumb span {
  color: #d1d5db;
}

.header-title h1 {
  margin: 0;

  font-size: 2rem;
  font-weight: 700;
  line-height: 1.2;
}

.header-title p {
  margin: 0.35rem 0 0;

  color: var(--text-muted, #6b7280);

  font-size: 0.875rem;
}

.header-actions {
  display: flex;
  align-items: center;

  gap: 0.5rem;

  flex-shrink: 0;
}

/* ============================================================
   Statistics
============================================================ */

.stats-grid {
  display: grid;

  grid-template-columns: repeat(4, minmax(0, 1fr));

  gap: 1rem;

  margin-bottom: 2rem;
}

.stat-card {
  display: flex;
  align-items: center;

  gap: 1rem;

  padding: 1.25rem;

  background: var(--surface, #ffffff);

  border: 1px solid var(--border, #e5e7eb);

  border-radius: 10px;
}

.stat-icon {
  width: 42px;
  height: 42px;

  flex: 0 0 42px;

  display: flex;
  align-items: center;
  justify-content: center;

  border-radius: 9px;

  background: #f3f4f6;

  color: #6b7280;
}

.stat-value {
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1.2;
}

.stat-label {
  margin-top: 0.25rem;

  color: var(--text-muted, #6b7280);

  font-size: 0.75rem;
}

/* ============================================================
   Content sections
============================================================ */

.content-section {
  margin-bottom: 2rem;

  background: var(--surface, #ffffff);

  border: 1px solid var(--border, #e5e7eb);

  border-radius: 10px;

  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  gap: 1rem;

  padding: 1.25rem 1.5rem;

  border-bottom: 1px solid var(--border, #e5e7eb);
}

.section-header h2 {
  margin: 0;

  font-size: 1.1rem;
  font-weight: 600;
}

.section-header p {
  margin: 0.25rem 0 0;

  color: var(--text-muted, #6b7280);

  font-size: 0.75rem;
}

/* ============================================================
   Filters
============================================================ */

.filter-bar {
  display: flex;
  align-items: center;

  gap: 0.75rem;

  padding: 1rem 1.5rem;

  background: #fafafa;

  border-bottom: 1px solid var(--border, #e5e7eb);
}

.search-wrapper {
  position: relative;

  flex: 1;
  max-width: 420px;
}

.search-wrapper > i {
  position: absolute;

  left: 0.85rem;
  top: 50%;

  transform: translateY(-50%);

  z-index: 1;

  color: #9ca3af;
}

.search-input {
  width: 100%;

  padding-left: 2.4rem;
}

.category-filter {
  width: 220px;
}

/* ============================================================
   Table
============================================================ */

.desktop-table {
  width: 100%;
}

.menu-table {
  border: 0;
}

.item-cell {
  display: flex;
  align-items: center;

  gap: 0.75rem;

  min-width: 0;
}

.item-thumbnail {
  width: 48px;
  height: 48px;

  flex: 0 0 48px;

  overflow: hidden;

  display: flex;
  align-items: center;
  justify-content: center;

  border-radius: 8px;

  background: #f3f4f6;

  color: #6b7280;

  font-size: 0.8rem;
  font-weight: 600;
}

.item-thumbnail img {
  width: 100%;
  height: 100%;

  display: block;

  object-fit: cover;
}

.item-info {
  min-width: 0;
}

.item-name {
  color: var(--text, #111827);

  font-size: 0.875rem;
  font-weight: 600;
}

.item-secondary {
  margin-top: 0.15rem;

  color: #9ca3af;

  font-size: 0.7rem;
}

.item-description {
  max-width: 360px;

  margin-top: 0.2rem;

  overflow: hidden;

  color: var(--text-muted, #6b7280);

  font-size: 0.72rem;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-badge {
  display: inline-flex;
  align-items: center;

  padding: 0.3rem 0.55rem;

  border-radius: 6px;

  background: #f3f4f6;

  color: #4b5563;

  font-size: 0.72rem;
  font-weight: 500;
}

.price-cell {
  font-weight: 600;
  white-space: nowrap;
}

.allergen-cell {
  color: #6b7280;

  font-size: 0.72rem;

  line-height: 1.4;
}

.muted {
  color: #9ca3af;
}

.table-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;

  gap: 0.1rem;
}

/* ============================================================
   Mobile items
============================================================ */

.mobile-items {
  display: none;
}

.mobile-item-card {
  padding: 1rem;

  border-bottom: 1px solid var(--border, #e5e7eb);
}

.mobile-item-main {
  display: flex;
  align-items: flex-start;

  gap: 0.75rem;
}

.mobile-thumbnail {
  width: 56px;
  height: 56px;

  flex-basis: 56px;
}

.mobile-item-info {
  min-width: 0;

  flex: 1;
}

.mobile-item-info h3 {
  margin: 0 0 0.35rem;

  font-size: 0.9rem;
  font-weight: 600;
}

.mobile-price {
  flex-shrink: 0;

  font-size: 0.9rem;
  font-weight: 700;
}

.mobile-item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;

  gap: 1rem;

  margin-top: 0.75rem;
}

.empty-state {
  padding: 4rem 1rem;

  text-align: center;
}

.empty-state > i {
  display: block;

  margin-bottom: 0.75rem;

  color: #9ca3af;

  font-size: 2.5rem;
}

.empty-state h3 {
  margin: 0;

  font-size: 1rem;
}

.empty-state p {
  margin: 0.4rem 0 1rem;

  color: #6b7280;

  font-size: 0.8rem;
}

/* ============================================================
   Categories
============================================================ */

.category-section {
  overflow: visible;
}

.category-grid {
  display: grid;

  grid-template-columns: repeat(3, minmax(0, 1fr));

  gap: 0.75rem;

  padding: 1.25rem 1.5rem;
}

.category-card {
  display: flex;
  align-items: center;

  gap: 0.75rem;

  padding: 1rem;

  border: 1px solid #e5e7eb;

  border-radius: 8px;

  cursor: pointer;

  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.category-card:hover,
.category-card.selected {
  background: #fafafa;
  border-color: #9ca3af;
}

.category-card-icon {
  width: 36px;
  height: 36px;

  flex: 0 0 36px;

  display: flex;
  align-items: center;
  justify-content: center;

  border-radius: 7px;

  background: #f3f4f6;

  color: #6b7280;
}

.category-card-info {
  min-width: 0;

  flex: 1;
}

.category-card-info h3 {
  margin: 0;

  overflow: hidden;

  font-size: 0.85rem;
  font-weight: 600;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-card-info p {
  margin: 0.15rem 0 0;

  color: #9ca3af;

  font-size: 0.7rem;
}

.category-card > i {
  color: #9ca3af;

  font-size: 0.7rem;
}

/* ============================================================
   Owner
============================================================ */

.owner-grid {
  display: grid;

  grid-template-columns: repeat(4, minmax(0, 1fr));

  gap: 0.75rem;

  padding: 1.25rem 1.5rem;
}

.owner-info-card {
  display: flex;
  flex-direction: column;

  gap: 0.3rem;

  padding: 1rem;

  background: #fafafa;

  border-radius: 8px;
}

.owner-label {
  color: #9ca3af;

  font-size: 0.7rem;
}

.owner-info-card strong {
  font-size: 0.85rem;
}

/* ============================================================
   Dialogs
============================================================ */

.form-grid {
  display: grid;

  grid-template-columns: repeat(2, minmax(0, 1fr));

  gap: 1rem;
}

.form-field {
  min-width: 0;
}

.form-field.full {
  grid-column: 1 / -1;
}

.form-field label {
  display: block;

  margin-bottom: 0.4rem;

  color: var(--text, #111827);

  font-size: 0.8rem;
  font-weight: 500;
}

.required {
  color: #ef4444;
}

.form-field small {
  display: block;

  margin-top: 0.35rem;

  color: #9ca3af;

  font-size: 0.7rem;
}

.form-section-title {
  padding-bottom: 0.5rem;

  border-bottom: 1px solid #e5e7eb;

  color: #6b7280;

  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.image-preview-small {
  width: 100%;
  height: 100px;

  margin-top: 0.75rem;

  overflow: hidden;

  border-radius: 8px;

  background: #f3f4f6;
}

.image-preview-small img {
  width: 100%;
  height: 100%;

  object-fit: cover;
}

.color-input {
  display: flex;
  align-items: center;

  gap: 0.5rem;
}

.color-input input[type='color'] {
  width: 40px;
  height: 40px;

  padding: 2px;

  border: 1px solid #d1d5db;
  border-radius: 6px;

  background: white;

  cursor: pointer;
}

/* ============================================================
   Preview
============================================================ */

.preview-content {
  display: grid;

  grid-template-columns: 280px minmax(0, 1fr);

  gap: 1.5rem;
}

.preview-image {
  width: 100%;
  aspect-ratio: 1;

  overflow: hidden;

  border-radius: 10px;

  background: #f3f4f6;
}

.preview-image img {
  width: 100%;
  height: 100%;

  object-fit: cover;
}

.preview-details {
  min-width: 0;
}

.preview-header {
  display: flex;
  justify-content: space-between;

  gap: 1rem;

  margin-bottom: 1.5rem;
}

.preview-header h2 {
  margin: 0 0 0.5rem;

  font-size: 1.35rem;
  font-weight: 700;
}

.preview-price {
  flex-shrink: 0;

  font-size: 1.1rem;
}

.preview-field {
  margin-bottom: 1rem;
}

.preview-field label {
  display: block;

  margin-bottom: 0.25rem;

  color: #9ca3af;

  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
}

.preview-field p {
  margin: 0;

  color: #4b5563;

  font-size: 0.85rem;
  line-height: 1.5;
}

.preview-meta {
  display: flex;
  flex-wrap: wrap;

  gap: 1rem;

  padding-top: 1rem;

  border-top: 1px solid #e5e7eb;

  color: #6b7280;

  font-size: 0.75rem;
}

/* ============================================================
   Responsive
============================================================ */

@media (max-width: 1100px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .category-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .owner-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 800px) {
  .admin-page {
    padding: 1.25rem;
  }

  .page-header {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
  }

  .header-actions .p-button {
    flex: 1;
  }

  .desktop-table {
    display: none;
  }

  .mobile-items {
    display: block;
  }

  .filter-bar {
    flex-wrap: wrap;
  }

  .search-wrapper {
    max-width: none;

    width: 100%;
    flex-basis: 100%;
  }

  .category-filter {
    flex: 1;
  }
}

@media (max-width: 600px) {
  .admin-page {
    padding: 0.75rem;
  }

  .header-left {
    align-items: flex-start;
  }

  .header-logo {
    width: 48px;
    height: 48px;
    flex-basis: 48px;
  }

  .header-title h1 {
    font-size: 1.5rem;
  }

  .header-actions {
    flex-wrap: wrap;
  }

  .header-actions .p-button {
    flex: 1 1 auto;
  }

  .stats-grid {
    grid-template-columns: 1fr 1fr;

    gap: 0.6rem;
  }

  .stat-card {
    padding: 0.9rem;

    gap: 0.65rem;
  }

  .stat-icon {
    width: 34px;
    height: 34px;
    flex-basis: 34px;
  }

  .stat-value {
    font-size: 1.1rem;
  }

  .section-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .section-header > .p-button {
    width: 100%;
  }

  .filter-bar {
    padding: 0.85rem;
  }

  .category-grid {
    grid-template-columns: 1fr;

    padding: 1rem;
  }

  .owner-grid {
    grid-template-columns: 1fr;

    padding: 1rem;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-field.full {
    grid-column: auto;
  }

  .preview-content {
    grid-template-columns: 1fr;
  }

  .preview-image {
    max-height: 260px;
  }
}
</style>