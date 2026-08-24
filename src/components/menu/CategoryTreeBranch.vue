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
          @update:modelValue="
            emit(
              'rename',
              nodePath(path, index),
              $event
            )
          "
        />

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