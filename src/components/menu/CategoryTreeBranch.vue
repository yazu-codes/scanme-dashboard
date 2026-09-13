<script setup>
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'

defineProps({
  nodes: {
    type: Array,
    required: true,
  },

  path: {
    type: Array,
    required: true,
  },
})

const emit = defineEmits([
  'rename',
  'remove',
  'add-child',
  'add-leaf',
  'move',
])

const nodePath = (path, index) => [
  ...path,
  index,
]
</script>

<template>
  <ul
    v-if="nodes.length"
    class="category-tree"
  >
    <li
      v-for="(node, index) in nodes"
      :key="nodePath(path, index).join('-')"
      class="category-tree-node"
    >
      <div class="category-node-row">
        <InputText
          :modelValue="
            typeof node === 'string'
              ? node
              : node.label
          "
          size="small"
          class="category-node-input"
          @update:modelValue="
            emit(
              'rename',
              nodePath(path, index),
              $event
            )
          "
        />

        <!--
          Grouped so the buttons move to their own line
          together instead of wrapping one at a time.
        -->
        <div class="category-node-actions">
          <!-- Move up -->
          <Button
            icon="pi pi-angle-up"
            text
            rounded
            size="small"
            title="Move up"
            aria-label="Move up"
            :disabled="index === 0"
            @click="
              emit(
                'move',
                nodePath(path, index),
                'up'
              )
            "
          />

          <!-- Move down -->
          <Button
            icon="pi pi-angle-down"
            text
            rounded
            size="small"
            title="Move down"
            aria-label="Move down"
            :disabled="
              index === nodes.length - 1
            "
            @click="
              emit(
                'move',
                nodePath(path, index),
                'down'
              )
            "
          />

          <!-- Category-specific actions -->
          <template
            v-if="typeof node !== 'string'"
          >
            <Button
              icon="pi pi-plus"
              text
              rounded
              size="small"
              title="Add child category"
              aria-label="Add child category"
              @click="
                emit(
                  'add-child',
                  nodePath(path, index)
                )
              "
            />

            <Button
              icon="pi pi-tag"
              text
              rounded
              size="small"
              title="Add leaf"
              aria-label="Add leaf"
              @click="
                emit(
                  'add-leaf',
                  nodePath(path, index)
                )
              "
            />
          </template>

          <!-- Remove -->
          <Button
            icon="pi pi-trash"
            severity="danger"
            text
            rounded
            size="small"
            title="Remove"
            aria-label="Remove"
            @click="
              emit(
                'remove',
                nodePath(path, index)
              )
            "
          />
        </div>
      </div>

      <!-- Recursive children -->
      <CategoryTreeBranch
        v-if="
          typeof node !== 'string' &&
          node.children?.length
        "
        :nodes="node.children"
        :path="nodePath(path, index)"
        @rename="
          (...args) =>
            emit('rename', ...args)
        "
        @remove="
          (...args) =>
            emit('remove', ...args)
        "
        @add-child="
          (...args) =>
            emit('add-child', ...args)
        "
        @add-leaf="
          (...args) =>
            emit('add-leaf', ...args)
        "
        @move="
          (...args) =>
            emit('move', ...args)
        "
      />
    </li>
  </ul>
</template>

<style scoped>
.category-node-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

/*
 * flex-basis 0 plus min-width 0 lets the field give up
 * whatever space the buttons need, instead of holding
 * its intrinsic width and pushing them off the card.
 */
.category-node-input {
  flex: 1 1 0;
  min-width: 0;
}

.category-node-actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  flex: 0 0 auto;
}

@media (max-width: 640px) {
  .category-node-row {
    gap: 0.15rem;
  }

  .category-node-actions {
    gap: 0;
  }

  .category-node-input :deep(input),
  .category-node-input.p-inputtext {
    /*
     * Narrow enough that the five buttons still fit.
     */
    padding-inline: 0.4rem;
    font-size: 0.85rem;
  }

  .category-node-actions :deep(.p-button) {
    width: 1.9rem;
    height: 1.9rem;
    padding: 0;
  }

  .category-node-actions :deep(.p-button .p-button-icon) {
    font-size: 0.8rem;
  }

  /*
   * Nesting eats a lot of width on a phone, so indent
   * children less than on a wide screen.
   */
  .category-tree .category-tree {
    padding-left: 0.5rem;
    margin-left: 0;
  }
}
</style>