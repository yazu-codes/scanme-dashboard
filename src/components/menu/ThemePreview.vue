<script setup>
import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'

import Button from 'primevue/button'

const props = defineProps({
  /*
   * menu_owner_url_name - the public menu lives at
   * {baseUrl}/{urlName}.
   */
  urlName: {
    type: String,
    default: '',
  },

  config: {
    type: Object,
    required: true,
  },

  baseUrl: {
    type: String,
    default: 'https://tapmy.menu',
  },
})

/*
|--------------------------------------------------------------------------
| Devices
|--------------------------------------------------------------------------
|
| Phone first: these menus are opened from a QR code at a table, so a
| desktop-width preview is the wrong picture of how the menu is seen.
|
*/

const DEVICES = {
  phone: { label: 'Phone', width: 390 },
  tablet: { label: 'Tablet', width: 768 },
  desktop: { label: 'Desktop', width: null },
}

const device = ref('phone')

const frameWidth =
  computed(() => {
    const width =
      DEVICES[device.value].width

    return width
      ? `${width}px`
      : '100%'
  })

/*
|--------------------------------------------------------------------------
| Preview URL
|--------------------------------------------------------------------------
|
| The appearance settings travel as query params so the menu renders the
| UNSAVED draft. Any param the menu app doesn't read is simply ignored,
| in which case the preview falls back to showing the saved settings -
| still useful, just not live.
|
*/

const previewUrl =
  computed(() => {
    if (!props.urlName) {
      return ''
    }

    const params =
      new URLSearchParams()

    // Lets the menu app skip analytics for this view.
    params.set('preview', '1')

    const c = props.config || {}

    if (c.theme) params.set('theme', c.theme)
    if (c.background_color) params.set('background_color', c.background_color)
    if (c.font_color) params.set('font_color', c.font_color)
    if (c.font_family) params.set('font_family', c.font_family)
    if (c.font_size) params.set('font_size', String(c.font_size))

    const base =
      String(props.baseUrl)
        .replace(/\/+$/, '')

    return `${base}/${encodeURIComponent(props.urlName)}?${params}`
  })

/*
|--------------------------------------------------------------------------
| Loading
|--------------------------------------------------------------------------
|
| Mounted on request rather than automatically: CollapsibleCard keeps its
| slot in the DOM while collapsed, so an eager iframe would load the whole
| public menu on every dashboard open.
|
*/

const shown = ref(false)
const loading = ref(false)
const nonce = ref(0)

// Changing src alone won't reload when the URL is unchanged, so the key
// carries a nonce that the refresh button bumps.
const frameKey =
  computed(
    () =>
      `${liveUrl.value}#${nonce.value}`
  )

/*
 * Debounced: typing a hex colour changes the URL on every keystroke, and
 * each change is a full page load of the public menu.
 */
const liveUrl = ref('')

let timer = null

watch(
  previewUrl,
  value => {
    if (!shown.value) {
      return
    }

    clearTimeout(timer)

    timer = setTimeout(
      () => {
        if (value !== liveUrl.value) {
          loading.value = true
          liveUrl.value = value
        }
      },
      600
    )
  }
)

onBeforeUnmount(
  () => clearTimeout(timer)
)

function show() {
  shown.value = true
  loading.value = true
  liveUrl.value = previewUrl.value
}

function hide() {
  shown.value = false
  liveUrl.value = ''
  clearTimeout(timer)
}

function refresh() {
  if (!shown.value) {
    return
  }

  loading.value = true
  liveUrl.value = previewUrl.value
  nonce.value += 1
}

// Stale by more than the debounce, e.g. while the preview was hidden.
const outOfDate =
  computed(
    () =>
      shown.value &&
      liveUrl.value !== '' &&
      liveUrl.value !== previewUrl.value
  )
</script>

<template>
  <div class="theme-preview">
    <div class="preview-bar">
      <strong>Live preview</strong>

      <template v-if="urlName">
        <div
          v-if="shown"
          class="devices"
          role="group"
          aria-label="Preview width"
        >
          <button
            v-for="(d, key) in DEVICES"
            :key="key"
            type="button"
            class="device"
            :class="{ picked: device === key }"
            :aria-pressed="device === key"
            @click="device = key"
          >{{ d.label }}</button>
        </div>

        <Button
          v-if="!shown"
          label="Show preview"
          icon="pi pi-eye"
          size="small"
          outlined
          @click="show"
        />

        <template v-else>
          <Button
            icon="pi pi-refresh"
            size="small"
            text
            rounded
            aria-label="Reload preview"
            :class="{ 'is-stale': outOfDate }"
            @click="refresh"
          />

          <Button
            icon="pi pi-times"
            size="small"
            text
            rounded
            aria-label="Hide preview"
            @click="hide"
          />
        </template>

        <a
          :href="previewUrl"
          target="_blank"
          rel="noopener"
          class="open-link"
        >Open in a tab</a>
      </template>
    </div>

    <p v-if="!urlName" class="preview-note">
      This menu has no URL name yet, so there is no public page to preview.
      Add one under Menu owner and save.
    </p>

    <template v-else-if="shown">
      <div class="stage">
        <div
          class="frame"
          :class="device"
          :style="{ width: frameWidth }"
        >
          <iframe
            :key="frameKey"
            :src="liveUrl"
            title="Public menu preview"
            loading="lazy"
            referrerpolicy="no-referrer"
            @load="loading = false"
          />

          <div v-if="loading" class="frame-loading">Loading…</div>
        </div>
      </div>

      <p class="preview-note">
        Shows the live site. If a setting doesn't appear here, the menu app
        isn't reading that query parameter yet.
      </p>
    </template>
  </div>
</template>

<style scoped>
.theme-preview {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--p-content-border-color, rgba(0, 0, 0, 0.12));
}

.preview-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.preview-bar > strong {
  margin-right: auto;
}

.devices {
  display: flex;
  gap: 2px;
}

.device {
  min-height: 36px;
  padding: 6px 12px;
  font: inherit;
  font-size: 0.85rem;
  color: inherit;
  background: none;
  border: 1px solid var(--p-content-border-color, rgba(0, 0, 0, 0.12));
  cursor: pointer;
}
.device:first-child { border-radius: 6px 0 0 6px; }
.device:last-child { border-radius: 0 6px 6px 0; }
.device + .device { border-left: 0; }

.device.picked {
  background: var(--p-primary-color, #1f5c9e);
  border-color: var(--p-primary-color, #1f5c9e);
  color: #fff;
}

.device:focus-visible,
.open-link:focus-visible {
  outline: 2px solid var(--p-primary-color, #1f5c9e);
  outline-offset: 2px;
}

/* Nudges the refresh button when the draft has moved past the frame */
.is-stale { color: #9a5500; }

.open-link {
  font-size: 0.85rem;
  white-space: nowrap;
}

.stage {
  display: flex;
  justify-content: center;
  margin-top: 0.75rem;
}

.frame {
  position: relative;
  max-width: 100%;
  height: 70vh;
  min-height: 420px;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--p-content-border-color, rgba(0, 0, 0, 0.12));
  border-radius: 10px;
}

/* A little device-like, without pretending to be a photo of a phone */
.frame.phone { border-radius: 22px; border-width: 6px; }
.frame.tablet { border-radius: 14px; border-width: 5px; }

.frame iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}

.frame-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #5a6775;
  font-size: 0.9rem;
}

.preview-note {
  margin: 0.6rem 0 0;
  font-size: 0.8rem;
  color: #5a6775;
}
</style>