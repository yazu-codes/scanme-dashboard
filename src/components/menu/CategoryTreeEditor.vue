<script setup>
import Button from 'primevue/button'
import CategoryTreeBranch from './CategoryTreeBranch.vue'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits([
  'update:modelValue',
])

const clone = value =>
  JSON.parse(JSON.stringify(value))

function update(mutator) {
  const next = clone(props.modelValue)

  mutator(next)

  emit('update:modelValue', next)
}

function getList(root, path) {
  let list = root

  for (const index of path) {
    const node = list[index]

    if (!node || typeof node === 'string') {
      return list
    }

    node.children ||= []
    list = node.children
  }

  return list
}

function addRoot() {
  update(root => {
    root.push({
      label: 'New category',
      children: [],
    })
  })
}

function addChild(path) {
  update(root => {
    const list = getList(root, path)

    list.push({
      label: 'New category',
      children: [],
    })
  })
}

function addLeaf(path) {
  update(root => {
    const list = getList(root, path)

    list.push('New item')
  })
}

function removeNode(path) {
  update(root => {
    const parentPath = path.slice(0, -1)
    const index = path.at(-1)

    const list = getList(
      root,
      parentPath
    )

    list.splice(index, 1)
  })
}

function renameNode(path, value) {
  update(root => {
    const parentPath = path.slice(0, -1)
    const index = path.at(-1)

    const list = getList(
      root,
      parentPath
    )

    const node = list[index]

    if (typeof node === 'string') {
      list[index] = value
    } else if (node) {
      node.label = value
    }
  })
}

function moveNode(path, direction) {
  update(root => {
    const parentPath = path.slice(0, -1)
    const index = path.at(-1)

    const list = getList(
      root,
      parentPath
    )

    const targetIndex =
      direction === 'up'
        ? index - 1
        : index + 1

    if (
      targetIndex < 0 ||
      targetIndex >= list.length
    ) {
      return
    }

    const temp = list[index]

    list[index] = list[targetIndex]
    list[targetIndex] = temp
  })
}
</script>

<template>
  <section class="dashboard-card">
    <div class="card-heading with-action">
      <div>
        <h2>Category order</h2>

        <span>
          Nested structure saved into
          menu_configuration.category_order
        </span>
      </div>

      <Button
        label="Add root category"
        icon="pi pi-plus"
        size="small"
        @click="addRoot"
      />
    </div>

    <CategoryTreeBranch
      :nodes="modelValue"
      :path="[]"
      @rename="renameNode"
      @remove="removeNode"
      @add-child="addChild"
      @add-leaf="addLeaf"
      @move="moveNode"
    />

    <div
      v-if="!modelValue.length"
      class="empty-panel"
    >
      No categories configured.
    </div>
  </section>
</template>