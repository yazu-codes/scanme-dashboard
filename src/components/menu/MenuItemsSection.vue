<script setup>
import {
  computed,
  ref,
} from 'vue'

import Button from 'primevue/button'
import Message from 'primevue/message'

import MenuItemDialog
  from './MenuItemDialog.vue'

import {
  csvRowsToItems,
  downloadCsv,
  itemsToCsv,
  parseCsv,
} from '@/utils/csvUtils'

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },

  menuId: {
    type: [
      Number,
      String,
    ],
    default: null,
  },

  menuName: {
    type: String,
    default: '',
  },

  menuSlug: {
    type: String,
    default: '',
  },

  token: {
    type: String,
    default: null,
  },
})

/*
|--------------------------------------------------------------------------
| Item dialog
|--------------------------------------------------------------------------
*/

const showItemDialog =
  ref(false)

const editingItem =
  ref(null)

/*
|--------------------------------------------------------------------------
| CSV
|--------------------------------------------------------------------------
*/

const csvInput =
  ref(null)

const csvMessage =
  ref(null)

const csvMessageSeverity =
  ref('success')

/*
|--------------------------------------------------------------------------
| Grouped items
|--------------------------------------------------------------------------
*/

const groupedItems =
  computed(() => {
    const groups =
      new Map()

    for (
      const item
      of props.items
    ) {
      const category =
        (
          item.category ||
          'Uncategorized'
        ).trim() ||
        'Uncategorized'

      if (
        !groups.has(
          category
        )
      ) {
        groups.set(
          category,
          []
        )
      }

      groups
        .get(category)
        .push(item)
    }

    return Array.from(
      groups.entries()
    ).map(
      ([category, items]) => ({
        category,

        items: [
          ...items,
        ].sort(
          (a, b) =>
            Number(
              a.display_order_position ||
              0
            ) -
            Number(
              b.display_order_position ||
              0
            )
        ),
      })
    )
  })

/*
|--------------------------------------------------------------------------
| Client-side key
|--------------------------------------------------------------------------
*/

function uid() {
  return Math
    .random()
    .toString(36)
    .slice(2, 10)
}

/*
|--------------------------------------------------------------------------
| Item CRUD
|--------------------------------------------------------------------------
*/

function openCreateItem() {
  editingItem.value =
    null

  showItemDialog.value =
    true
}

function openEditItem(
  item
) {
  editingItem.value =
    item

  showItemDialog.value =
    true
}

function saveItem(
  values
) {
  if (
    editingItem.value
  ) {
    Object.assign(
      editingItem.value,
      values
    )

    return
  }

  props.items.push({
    _key:
      uid(),

    menu_id:
      props.menuId,

    ...values,
  })
}

function deleteItem(
  item
) {
  if (
    !window.confirm(
      `Remove "${item.name}" from this menu?`
    )
  ) {
    return
  }

  const index =
    props.items.findIndex(
      candidate =>
        candidate._key ===
          item._key ||
        (
          item.id &&
          candidate.id ===
            item.id
        )
    )

  if (index !== -1) {
    props.items.splice(
      index,
      1
    )
  }
}

/*
|--------------------------------------------------------------------------
| CSV import
|--------------------------------------------------------------------------
*/

function openCsvPicker() {
  csvInput.value
    ?.click()
}

async function handleCsvSelected(
  event
) {
  const input =
    event.target

  const file =
    input.files?.[0]

  if (!file) {
    return
  }

  csvMessage.value =
    null

  try {
    /*
     * Strip UTF-8 BOM if present.
     */
    let text =
      await file.text()

    text =
      text.replace(
        /^\uFEFF/,
        ''
      )

    const rows =
      parseCsv(text)

    const importedItems =
      csvRowsToItems(
        rows,
        props.items.length
      )

    if (
      importedItems.length ===
      0
    ) {
      csvMessageSeverity.value =
        'error'

      csvMessage.value =
        'No valid rows found in that CSV. Check that the file contains a "name" column.'

      return
    }

    /*
     * Same behaviour as the reference HTML:
     *
     * imported rows are NEW draft items.
     *
     * There is no separate import API call.
     * They will be persisted when the user presses
     * the normal Save button for the menu.
     */
    for (
      const values
      of importedItems
    ) {
      props.items.push({
        _key:
          uid(),

        menu_id:
          props.menuId,

        ...values,
      })
    }

    csvMessageSeverity.value =
      'success'

    csvMessage.value =
      `${importedItems.length} item${
        importedItems.length === 1
          ? ''
          : 's'
      } added from CSV. Save the menu to publish them.`
  } catch (err) {
    csvMessageSeverity.value =
      'error'

    csvMessage.value =
      `Couldn't import CSV: ${err.message}`
  } finally {
    /*
     * Reset so selecting the same file again
     * still triggers change.
     */
    input.value = ''
  }
}

/*
|--------------------------------------------------------------------------
| CSV export
|--------------------------------------------------------------------------
*/

function exportCsv() {
  csvMessage.value =
    null

  if (
    !props.items.length
  ) {
    csvMessageSeverity.value =
      'error'

    csvMessage.value =
      'No items to export.'

    return
  }

  try {
    const csv =
      itemsToCsv(
        props.items
      )

    const date =
      new Date()
        .toISOString()
        .split('T')[0]

    const baseName =
      props.menuSlug ||
      props.menuName ||
      `menu-${props.menuId || 'items'}`

    const safeName =
      String(baseName)
        .trim()
        .replace(
          /[^a-zA-Z0-9_-]+/g,
          '-'
        )
        .replace(
          /^-+|-+$/g,
          ''
        ) ||
      'menu'

    const filename =
      `${safeName}_items_${date}.csv`

    downloadCsv(
      csv,
      filename
    )

    csvMessageSeverity.value =
      'success'

    csvMessage.value =
      `Exported ${props.items.length} item${
        props.items.length === 1
          ? ''
          : 's'
      } to CSV.`
  } catch (err) {
    csvMessageSeverity.value =
      'error'

    csvMessage.value =
      `Couldn't export CSV: ${err.message}`
  }
}
</script>

<template>
  <section class="dashboard-card">
    <div class="card-heading with-action">
      <div>
        <h2>
          Menu items
        </h2>

        <span>
          {{
            items.length
          }}
          item{{
            items.length === 1
              ? ''
              : 's'
          }}
        </span>
      </div>

      <div class="menu-items-actions">
        <Button
          label="Add item"
          icon="pi pi-plus"
          size="small"
          @click="openCreateItem"
        />

        <Button
          label="Import CSV"
          icon="pi pi-upload"
          severity="secondary"
          outlined
          size="small"
          @click="openCsvPicker"
        />

        <Button
          label="Export CSV"
          icon="pi pi-download"
          severity="secondary"
          outlined
          size="small"
          :disabled="!items.length"
          @click="exportCsv"
        />

        <input
          ref="csvInput"
          type="file"
          accept=".csv,text/csv"
          hidden
          @change="handleCsvSelected"
        />
      </div>
    </div>

    <Message
      v-if="csvMessage"
      :severity="csvMessageSeverity"
      closable
      @close="
        csvMessage = null
      "
    >
      {{ csvMessage }}
    </Message>

    <div
      v-if="!items.length"
      class="empty-panel"
    >
      No menu items yet.
    </div>

    <div
      v-for="group in groupedItems"
      v-else
      :key="group.category"
      class="menu-item-category"
    >
      <div class="menu-item-category-heading">
        <strong>
          {{ group.category }}
        </strong>

        <span>
          {{ group.items.length }}
        </span>
      </div>

      <div
        v-for="item in group.items"
        :key="
          item._key ||
          item.id
        "
        class="menu-item-row"
      >
        <div class="menu-item-main">
          <div class="menu-item-title-row">
            <strong>
              {{ item.name }}
            </strong>

            <span
              v-if="!item.id"
              class="new-badge"
            >
              New
            </span>

            <span class="menu-item-leader" />

            <span class="menu-item-price">
              {{
                Number(
                  item.price || 0
                ).toFixed(2)
              }}
            </span>
          </div>

          <small
            v-if="item.description"
          >
            {{ item.description }}
          </small>
        </div>

        <div class="menu-item-actions">
          <Button
            icon="pi pi-pencil"
            text
            rounded
            size="small"
            aria-label="Edit item"
            @click="
              openEditItem(
                item
              )
            "
          />

          <Button
            icon="pi pi-trash"
            severity="danger"
            text
            rounded
            size="small"
            aria-label="Delete item"
            @click="
              deleteItem(
                item
              )
            "
          />
        </div>
      </div>
    </div>

    <MenuItemDialog
      v-model:visible="
        showItemDialog
      "
      :item="
        editingItem
      "
      :menu-id="
        menuId
      "
      :token="
        token
      "
      @save="
        saveItem
      "
    />
  </section>
</template>