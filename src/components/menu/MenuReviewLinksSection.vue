<script setup>
import {
  ref,
} from 'vue'

import Button from 'primevue/button'
import InputText from 'primevue/inputtext'

const props = defineProps({
  links: {
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
})

/*
|--------------------------------------------------------------------------
| Client-side key
|--------------------------------------------------------------------------
|
| New rows have no id until the menu is saved, so they
| need something stable to key the v-for on.
|
*/

function uid() {
  return Math
    .random()
    .toString(36)
    .slice(2, 10)
}

/*
|--------------------------------------------------------------------------
| CRUD
|--------------------------------------------------------------------------
|
| Edited in place on the draft, exactly like menu items.
| Nothing is sent anywhere until the menu is saved.
|
*/

const brokenImages =
  ref(
    new Set()
  )

function addLink() {
  props.links.push({
    _key:
      uid(),

    menu_id:
      props.menuId,

    url: '',
    title: '',
    image_url: '',
  })
}

function removeLink(
  link
) {
  const label =
    link.title?.trim() ||
    link.url?.trim() ||
    'this link'

  if (
    !window.confirm(
      `Remove ${label} from this menu?`
    )
  ) {
    return
  }

  const index =
    props.links.findIndex(
      candidate =>
        candidate._key ===
          link._key ||
        (
          link.id &&
          candidate.id ===
            link.id
        )
    )

  if (index !== -1) {
    props.links.splice(
      index,
      1
    )
  }
}

function moveLink(
  index,
  direction
) {
  const target =
    direction === 'up'
      ? index - 1
      : index + 1

  if (
    target < 0 ||
    target >= props.links.length
  ) {
    return
  }

  const [moved] =
    props.links.splice(
      index,
      1
    )

  props.links.splice(
    target,
    0,
    moved
  )
}

/*
|--------------------------------------------------------------------------
| Image preview
|--------------------------------------------------------------------------
*/

function markBroken(
  key
) {
  const next =
    new Set(
      brokenImages.value
    )

  next.add(key)

  brokenImages.value =
    next
}

function clearBroken(
  key
) {
  if (
    !brokenImages
      .value
      .has(key)
  ) {
    return
  }

  const next =
    new Set(
      brokenImages.value
    )

  next.delete(key)

  brokenImages.value =
    next
}

function rowKey(
  link,
  index
) {
  return link._key ||
    link.id ||
    index
}

/*
 * `window` isn't in template scope, so opening a link
 * has to go through a method.
 */
function openLink(
  url
) {
  window.open(
    url,
    '_blank',
    'noopener'
  )
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
          Review links
        </h2>

        <span>
          {{
            links.length
          }}
          link{{
            links.length === 1
              ? ''
              : 's'
          }}
        </span>
      </div>
    </div>

    <div class="review-link-actions">
      <Button
        label="Add link"
        icon="pi pi-plus"
        size="small"
        @click="addLink"
      />
    </div>

    <div
      v-if="!links.length"
      class="empty-panel"
    >
      No review links yet.
    </div>

    <div
      v-for="(link, index) in links"
      v-else
      :key="rowKey(link, index)"
      class="review-link-row"
    >
      <div class="review-link-head">
        <span class="review-link-index">
          {{ index + 1 }}
        </span>

        <strong class="review-link-name">
          {{
            link.title?.trim() ||
            'Untitled link'
          }}
        </strong>

        <span
          v-if="!link.id"
          class="new-badge"
        >
          New
        </span>
      </div>

      <div class="review-link-body">
        <img
          v-if="
            link.image_url &&
            !brokenImages.has(
              rowKey(link, index)
            )
          "
          :src="link.image_url"
          alt=""
          class="review-link-thumb"
          @error="
            markBroken(
              rowKey(link, index)
            )
          "
        />

        <div class="review-link-fields">
          <label class="review-link-field">
            <span>
              Title
            </span>

            <InputText
              v-model="link.title"
              size="small"
            />
          </label>

          <label class="review-link-field">
            <span>
              URL
            </span>

            <InputText
              v-model="link.url"
              size="small"
              placeholder="https://"
            />
          </label>

          <label class="review-link-field">
            <span>
              Image URL
            </span>

            <InputText
              v-model="link.image_url"
              size="small"
              placeholder="https://"
              @update:modelValue="
                clearBroken(
                  rowKey(link, index)
                )
              "
            />
          </label>
        </div>
      </div>

      <div class="review-link-controls">
        <Button
          icon="pi pi-angle-up"
          text
          rounded
          size="small"
          title="Move up"
          aria-label="Move up"
          :disabled="index === 0"
          @click="
            moveLink(
              index,
              'up'
            )
          "
        />

        <Button
          icon="pi pi-angle-down"
          text
          rounded
          size="small"
          title="Move down"
          aria-label="Move down"
          :disabled="
            index === links.length - 1
          "
          @click="
            moveLink(
              index,
              'down'
            )
          "
        />

        <Button
          v-if="link.url"
          icon="pi pi-external-link"
          text
          rounded
          size="small"
          title="Open link"
          aria-label="Open link"
          @click="
            openLink(link.url)
          "
        />

        <Button
          icon="pi pi-trash"
          severity="danger"
          text
          rounded
          size="small"
          title="Remove"
          aria-label="Remove"
          @click="
            removeLink(link)
          "
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.review-link-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

/*
 * Border only - no fill - so nothing clashes with the
 * card underneath.
 */
.review-link-row {
  padding: 0.75rem;
  border: 1px solid
    var(--p-content-border-color, rgba(0, 0, 0, 0.12));
  border-radius: 0.6rem;
  margin-bottom: 0.5rem;
}

.review-link-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  margin-bottom: 0.5rem;
}

.review-link-index {
  flex: 0 0 auto;
  font-size: 0.8rem;
  opacity: 0.6;
}

.review-link-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.review-link-body {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  min-width: 0;
}

.review-link-thumb {
  flex: 0 0 auto;
  width: 3.5rem;
  height: 3.5rem;
  object-fit: contain;
  border-radius: 0.4rem;
}

.review-link-fields {
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(12rem, 1fr)
  );
  gap: 0.5rem;
  flex: 1 1 0;
  min-width: 0;
}

.review-link-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.review-link-field span {
  font-size: 0.78rem;
  opacity: 0.7;
}

.review-link-field :deep(.p-inputtext) {
  width: 100%;
  min-width: 0;
}

.review-link-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  margin-top: 0.5rem;
}

@media (max-width: 640px) {
  .review-link-body {
    flex-direction: column;
  }

  .review-link-thumb {
    align-self: center;
  }

  .review-link-fields {
    grid-template-columns: 1fr;
    width: 100%;
  }

  .review-link-controls :deep(.p-button) {
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
  }
}
</style>