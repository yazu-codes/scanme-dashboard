<script setup>
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Dropdown from 'primevue/dropdown'

import ThemePreview from './ThemePreview.vue'

defineProps({
  config: { type: Object, required: true },
  ownerName: { type: String, default: '' },

  /*
   * menu_owner_url_name, so the preview knows which public page to load.
   */
  urlName: { type: String, default: '' },

  isAdmin: {
    type: Boolean,
    default: false,
  },
})

const themeOptions = [
  { label: 'Luxury', value: 'luxury' },
  { label: 'Classic', value: 'classic' },
  { label: 'Minimal', value: 'minimal' },
  { label: 'Modern', value: 'modern' },
  { label: 'Noir', value: 'noir' },
  { label: 'Lantern', value: 'lantern' },
  { label: 'Diner', value: 'diner' },
  { label: 'Ladle', value: 'ladle' },
  { label: 'Stitch', value: 'stitch' },
  { label: 'Trattoria', value: 'trattoria' },
  { label: 'Flame', value: 'flame' },
]
</script>

<template>
  <section class="dashboard-card">
    <div class="card-heading">
      <h2>Appearance</h2>
      <span>Public menu display settings stored in menu_configuration</span>
    </div>

    <div class="form-grid">
      <label class="field">
        <span>Background color</span>
        <div class="color-field">
          <input v-model="config.background_color" type="color">
          <InputText v-model="config.background_color" />
        </div>
      </label>

      <label class="field">
        <span>Font color</span>
        <div class="color-field">
          <input v-model="config.font_color" type="color">
          <InputText v-model="config.font_color" />
        </div>
      </label>

      <label class="field">
        <span>Font family</span>
        <InputText v-model="config.font_family" />
      </label>

      <label class="field">
        <span>Font size</span>
        <InputNumber
          v-model="config.font_size"
          :min="8"
          :max="72"
          suffix=" px"
        />
      </label>

      <label class="field" v-if="isAdmin">
        <span>Theme</span>

        <Dropdown
          v-model="config.theme"
          :options="themeOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Select a theme"
        />
      </label>
    </div>

    <!--
      Instant, free, and never wrong about colour and type. Kept because
      the iframe below is debounced and costs a page load, so this is what
      answers "is that hex right" while you are still typing.
    -->
    <div
      class="config-preview"
      :style="{
        background: config.background_color,
        color: config.font_color,
        fontFamily: `${config.font_family || 'Inter'}, sans-serif`,
        fontSize: `${config.font_size || 16}px`,
      }"
    >
      <strong>{{ ownerName || 'Restaurant name' }}</strong>
      <span>Menu appearance preview</span>
    </div>

    <ThemePreview
      :url-name="urlName"
      :config="config"
    />
  </section>
</template>