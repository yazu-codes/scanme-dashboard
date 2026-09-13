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

  isAdmin: {
    type: Boolean,
    default: false,
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
| Category name
|--------------------------------------------------------------------------
*/

function categoryOf(
  item
) {
  return (
    item.category ||
    'Uncategorized'
  ).trim() ||
  'Uncategorized'
}

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
        categoryOf(item)

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
| Category open state
|--------------------------------------------------------------------------
|
| Tracked as the set of OPEN categories, so anything
| that appears later - a new item, a CSV import, a
| renamed category - starts collapsed.
|
*/

const openCategories =
  ref(
    new Set()
  )

function isCategoryOpen(
  category
) {
  return openCategories
    .value
    .has(category)
}

function toggleCategory(
  category
) {
  const next =
    new Set(
      openCategories.value
    )

  if (
    next.has(category)
  ) {
    next.delete(category)
  } else {
    next.add(category)
  }

  openCategories.value =
    next
}

function openCategory(
  category
) {
  if (
    isCategoryOpen(
      category
    )
  ) {
    return
  }

  const next =
    new Set(
      openCategories.value
    )

  next.add(category)

  openCategories.value =
    next
}

const anyCategoryOpen =
  computed(
    () =>
      groupedItems
        .value
        .some(
          group =>
            isCategoryOpen(
              group.category
            )
        )
  )

function toggleAllCategories() {
  if (
    anyCategoryOpen.value
  ) {
    openCategories.value =
      new Set()

    return
  }

  openCategories.value =
    new Set(
      groupedItems
        .value
        .map(
          group =>
            group.category
        )
    )
}

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

    /*
     * An edit can move the item to another category.
     * Open that one so the item stays in view.
     */
    openCategory(
      categoryOf(
        editingItem.value
      )
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

  openCategory(
    categoryOf(values)
  )
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

function enableAllItems() {
  if (
    !props.items.length
  ) {
    return
  }

  for (
    const item
    of props.items
  ) {
    item.enabled = true
  }
}

function deleteAllItems() {
  if (
    !props.items.length
  ) {
    return
  }

  const confirmed =
    window.confirm(
      `Delete all ${props.items.length} item${
        props.items.length === 1
          ? ''
          : 's'
      } from this menu? This cannot be undone.`
    )

  if (!confirmed) {
    return
  }

  props.items.splice(
    0,
    props.items.length
  )

  openCategories.value =
    new Set()
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
      } added from CSV. Open a category to review them, then save the menu to publish.`
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
    <!--
      Kept so the component still has a title when used
      on its own. CollapsibleCard's `flush` mode hides
      this and shows its own heading instead.
    -->
    <div class="card-heading">
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

      <Button
        v-if="groupedItems.length > 1"
        :label="
          anyCategoryOpen
            ? 'Collapse categories'
            : 'Expand categories'
        "
        :icon="
          anyCategoryOpen
            ? 'pi pi-angle-double-up'
            : 'pi pi-angle-double-down'
        "
        severity="secondary"
        text
        size="small"
        @click="toggleAllCategories"
      />

      <Button
        v-if="isAdmin"
        label="Enable all"
        icon="pi pi-check-circle"
        severity="success"
        outlined
        size="small"
        :disabled="!items.length"
        @click="enableAllItems"
      />

      <Button
        v-if="isAdmin"
        label="Delete all"
        icon="pi pi-trash"
        severity="danger"
        outlined
        size="small"
        :disabled="!items.length"
        @click="deleteAllItems"
      />

      <input
        ref="csvInput"
        type="file"
        accept=".csv,text/csv"
        hidden
        @change="handleCsvSelected"
      />
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
      <button
        type="button"
        class="menu-item-category-heading"
        :aria-expanded="
          isCategoryOpen(
            group.category
          )
        "
        @click="
          toggleCategory(
            group.category
          )
        "
      >
        <i
          class="pi pi-chevron-right category-chevron"
          :class="{
            'is-open':
              isCategoryOpen(
                group.category
              ),
          }"
          aria-hidden="true"
        />

        <strong>
          {{ group.category }}
        </strong>

        <span>
          {{ group.items.length }}
        </span>
      </button>

      <div
        v-show="
          isCategoryOpen(
            group.category
          )
        "
        class="menu-item-category-body"
      >
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
              <strong class="menu-item-name">
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
              class="menu-item-description"
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

<style scoped>
.menu-items-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

/*
 * The category heading used to be a div, so the
 * button defaults need stripping back out.
 */
.menu-item-category-heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.menu-item-category-heading:focus-visible {
  outline: 2px solid var(--p-primary-color, #3b82f6);
  outline-offset: 3px;
  border-radius: 4px;
}

.menu-item-category-heading span {
  margin-left: auto;
}

.category-chevron {
  font-size: 0.7rem;
  opacity: 0.6;
  transition: transform 0.2s ease;
}

.category-chevron.is-open {
  transform: rotate(90deg);
}

/*
|--------------------------------------------------------------------------
| Item rows
|--------------------------------------------------------------------------
|
| Same shrink rules as the category tree: every flex
| child needs min-width 0, otherwise the name holds its
| intrinsic width and shoves the buttons off the card.
|
*/

.menu-item-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  min-width: 0;
  max-width: 100%;
}

.menu-item-main {
  flex: 1 1 0;
  min-width: 0;
  max-width: 100%;
}

.menu-item-row .menu-item-title-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.35rem;
  min-width: 0;
  /*
   * Beats a nowrap on the row in the global stylesheet,
   * which is what stops long names breaking.
   */
  white-space: normal;
}

/*
 * Its own class, so nothing in menu-dashboard.css is
 * targeting it. `anywhere` rather than `break-word`
 * because a single long word - a URL, a run-on dish
 * name - still has to break mid-word.
 */
.menu-item-row .menu-item-name {
  flex: 1 1 6rem;
  min-width: 0;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

/*
 * The leader is decorative, so it's the first thing
 * allowed to collapse when space runs out.
 */
.menu-item-leader {
  flex: 1 1 0;
  min-width: 0;
}

.menu-item-price {
  flex: 0 0 auto;
  white-space: nowrap;
}

.menu-item-row .menu-item-description {
  display: block;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.menu-item-actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  flex: 0 0 auto;
}

@media (max-width: 640px) {
  .menu-items-actions {
    gap: 0.35rem;
  }

  /*
   * Buttons share each row evenly instead of leaving a
   * ragged edge when they wrap.
   */
  .menu-items-actions :deep(.p-button) {
    flex: 1 1 auto;
    justify-content: center;
  }

  .menu-item-row {
    gap: 0.25rem;
  }

  .menu-item-actions {
    gap: 0;
  }

  .menu-item-actions :deep(.p-button) {
    width: 2rem;
    height: 2rem;
    padding: 0;
  }

  .menu-item-actions :deep(.p-button .p-button-icon) {
    font-size: 0.85rem;
  }

  .menu-item-category-heading span {
    white-space: nowrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .category-chevron {
    transition: none;
  }
}
</style>