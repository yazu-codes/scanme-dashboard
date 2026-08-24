<script setup>
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'

defineProps({
  config: { type: Object, required: true },
  ownerName: { type: String, default: '' },
})
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
        <InputNumber v-model="config.font_size" :min="8" :max="72" suffix=" px" />
      </label>
    </div>

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
  </section>
</template>
