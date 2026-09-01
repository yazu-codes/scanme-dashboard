<script setup>
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'

defineProps({
  owner: { type: Object, required: true },
  isAdmin: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <section class="dashboard-card">
    <div class="card-heading">
      <h2>Menu owner</h2>
      <span>Restaurant identity and contact details</span>
    </div>

    <div class="form-grid">
      <label class="field" v-if="isAdmin">
        <span>Name</span>
        <InputText v-model="owner.menu_owner_name" />
      </label>

      <label class="field" v-if="isAdmin">
        <span>URL name</span>
        <InputText v-model="owner.menu_owner_url_name" />
      </label>

      <label class="field">
        <span>Phone</span>
        <InputText v-model="owner.menu_owner_phone" />
      </label>

      <label class="field">
        <span>Logo URL</span>
        <InputText v-model="owner.menu_owner_logo_url" />
      </label>

      <label class="field field-full">
        <span>Background image URL</span>
        <InputText v-model="owner.menu_owner_place_background_url" />
      </label>

      <label class="field field-full">
        <span>Slogan</span>
        <Textarea v-model="owner.menu_owner_slogan" rows="2" />
      </label>

      <label class="field field-full">
        <span>English slogan</span>
        <Textarea v-model="owner.menu_owner_slogan_en" rows="2" />
      </label>
    </div>
  </section>
</template>
