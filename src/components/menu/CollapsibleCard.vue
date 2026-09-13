<script setup>
import {
  computed,
  ref,
  watch,
} from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },

  /*
   * Small muted text beside the title,
   * e.g. "12 items".
   */
  subtitle: {
    type: String,
    default: '',
  },

  defaultOpen: {
    type: Boolean,
    default: false,
  },

  /*
   * When set, the open / closed state is remembered
   * in localStorage between page loads.
   */
  storageKey: {
    type: String,
    default: null,
  },

  /*
   * Use this when the slotted content is itself a
   * .dashboard-card with its own .card-heading.
   *
   * It strips the inner card's frame and heading so
   * the section reads as one card rather than two
   * nested boxes with the title printed twice.
   */
  flush: {
    type: Boolean,
    default: false,
  },
})

/*
|--------------------------------------------------------------------------
| Open state
|--------------------------------------------------------------------------
*/

const storageName =
  computed(() =>
    props.storageKey
      ? `menu-dashboard:section:${props.storageKey}`
      : null
  )

function readStoredState() {
  if (!storageName.value) {
    return props.defaultOpen
  }

  try {
    const raw =
      window.localStorage
        .getItem(
          storageName.value
        )

    if (raw === null) {
      return props.defaultOpen
    }

    return raw === '1'
  } catch {
    return props.defaultOpen
  }
}

const isOpen =
  ref(
    readStoredState()
  )

function toggle() {
  isOpen.value =
    !isOpen.value

  if (!storageName.value) {
    return
  }

  try {
    window.localStorage
      .setItem(
        storageName.value,
        isOpen.value
          ? '1'
          : '0'
      )
  } catch {
    /*
     * Private browsing / storage disabled.
     * Collapsing still works, it just isn't remembered.
     */
  }
}

/*
|--------------------------------------------------------------------------
| Overflow handling
|--------------------------------------------------------------------------
|
| The body is clipped while it animates, otherwise the
| content would spill out of the closed card. Once the
| animation settles the clip is released so focus rings
| and dropdowns aren't cut off.
|
*/

const isSettled =
  ref(isOpen.value)

watch(
  isOpen,
  value => {
    if (value) {
      return
    }

    isSettled.value = false
  }
)

function handleTransitionEnd(
  event
) {
  if (
    event.propertyName !==
    'grid-template-rows'
  ) {
    return
  }

  isSettled.value =
    isOpen.value
}

/*
 * Unique id so the toggle button can point at
 * the region it controls.
 */
const bodyId =
  `collapsible-body-${
    Math
      .random()
      .toString(36)
      .slice(2, 10)
  }`
</script>

<template>
  <section
    class="dashboard-card collapsible-card"
    :class="{
      'is-flush': flush,
    }"
  >
    <div class="collapsible-heading">
      <button
        type="button"
        class="collapsible-toggle"
        :aria-expanded="isOpen"
        :aria-controls="bodyId"
        @click="toggle"
      >
        <i
          class="pi pi-chevron-right collapsible-chevron"
          :class="{
            'is-open': isOpen,
          }"
          aria-hidden="true"
        />

        <span class="collapsible-title">
          <h2>
            {{ title }}
          </h2>

          <span
            v-if="subtitle"
            class="collapsible-subtitle"
          >
            {{ subtitle }}
          </span>
        </span>
      </button>

      <div
        v-if="$slots.actions"
        class="collapsible-actions"
      >
        <slot name="actions" />
      </div>
    </div>

    <div
      :id="bodyId"
      class="collapsible-body"
      :class="{
        'is-open': isOpen,
        'is-settled': isSettled,
      }"
      role="region"
      @transitionend="
        handleTransitionEnd
      "
    >
      <div class="collapsible-body-inner">
        <div class="collapsible-content">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.collapsible-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.collapsible-toggle {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.25rem 0;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.collapsible-toggle:focus-visible {
  outline: 2px solid var(--p-primary-color, #3b82f6);
  outline-offset: 3px;
  border-radius: 4px;
}

.collapsible-chevron {
  flex: 0 0 auto;
  font-size: 0.75rem;
  transition: transform 0.2s ease;
}

.collapsible-chevron.is-open {
  transform: rotate(90deg);
}

.collapsible-title {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
}

.collapsible-title h2 {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.3;
}

.collapsible-subtitle {
  font-size: 0.85rem;
  opacity: 0.65;
  white-space: nowrap;
}

.collapsible-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/*
 * 0fr -> 1fr animates to the natural height of the
 * content without measuring anything in JS.
 */
.collapsible-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.22s ease;
}

.collapsible-body.is-open {
  grid-template-rows: 1fr;
}

.collapsible-body-inner {
  overflow: hidden;
  min-height: 0;
}

.collapsible-body.is-settled .collapsible-body-inner {
  overflow: visible;
}

.collapsible-content {
  padding-top: 1rem;
}

.collapsible-body:not(.is-open) .collapsible-content {
  padding-top: 0;
}

/*
|--------------------------------------------------------------------------
| Flush mode
|--------------------------------------------------------------------------
*/

.is-flush .collapsible-content :deep(.dashboard-card) {
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
}

.is-flush .collapsible-content :deep(.card-heading) {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .collapsible-body,
  .collapsible-chevron {
    transition: none;
  }
}
</style>