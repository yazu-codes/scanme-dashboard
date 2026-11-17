<template>
  <div class="wrap">
    <h2>Меню → CSV</h2>

    <label>Меню</label>
    <select v-model="selectedMenuId">
      <option :value="null">— избери меню —</option>
      <option v-for="m in menus" :key="m.id" :value="m.id">
        {{ menuLabel(m) }}
      </option>
    </select>
    <p v-if="knownCategories.length" class="hint">
      Claude ще ползва съществуващите категории на това меню:
      {{ knownCategories.join(', ') }}
    </p>

    <label>Claude API ключ (пази се само в този браузър)</label>
    <input type="password" v-model="apiKey" @change="saveKey" placeholder="sk-ant-..." />

    <label>Модел</label>
    <select v-model="model">
      <option value="claude-sonnet-5-5">Sonnet (по-бърз и по-евтин)</option>
      <option value="claude-opus-5">Opus (за трудни снимки)</option>
    </select>

    <label>Снимки или PDF на менюто</label>
    <div
      class="dropzone"
      :class="{ over: dragOver }"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
      @click="$refs.fileInput.click()"
    >
      Пусни файлове тук или кликни, за да избереш.
      <small>JPG, PNG, GIF, WEBP или PDF — снимките се смаляват автоматично</small>
    </div>
    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
      multiple
      hidden
      @change="onPick"
    />

    <ul v-if="scan.files.value.length" class="files">
      <li v-for="(f, i) in scan.files.value" :key="f.hash">
        <img v-if="f.preview" :src="f.preview" alt="" />
        <span v-else class="pdf-badge">PDF</span>
        <span class="fname">{{ f.name }}</span>
        <span class="fsize">{{ prettySize(f.size) }}</span>
        <button class="small" :disabled="scan.busy.value" @click="scan.removeFile(i)">✕</button>
      </li>
    </ul>

    <label>Менюто като текст (по избор)</label>
    <textarea v-model="menuText" rows="6" placeholder="Супи&#10;* Пилешка супа1.90€ ..."></textarea>

    <button :disabled="scan.busy.value" @click="generate">
      {{ scan.busy.value ? 'Чета менюто...' : 'Разчети менюто' }}
    </button>
    <p v-if="scan.error.value" class="error">{{ scan.error.value }}</p>

    <!-- Progress -->
    <ul v-if="scan.feed.value.length" class="feed">
      <li v-for="line in scan.feed.value" :key="line.id" :class="line.kind">
        {{ line.text }}
      </li>
    </ul>

    <!-- Claude needs something decided before it can continue -->
    <div v-if="scan.questions.value" class="questions">
      <h3>Claude пита</h3>
      <div v-for="q in scan.questions.value.list" :key="q.id" class="question">
        <label>{{ q.question }}</label>
        <div v-if="q.options.length" class="options">
          <button
            v-for="opt in q.options"
            :key="opt"
            class="small option"
            :class="{ picked: answers[q.id] === opt }"
            @click="answers[q.id] = opt"
          >
            {{ opt }}
          </button>
        </div>
        <input v-model="answers[q.id]" placeholder="или напиши отговор" />
      </div>
      <button @click="submitAnswers">Изпрати отговорите</button>
    </div>

    <template v-if="scan.rows.value.length">
      <h3>
        Преглед ({{ scan.rows.value.length }} ястия<span v-if="scan.warningCount.value">,
        {{ scan.warningCount.value }} ⚠</span>)
      </h3>

      <label class="inline">
        <input type="checkbox" v-model="onlyWarnings" />
        Покажи само редовете с ⚠
      </label>

      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th></th><th>name</th><th>price</th><th>category</th><th>allergens</th>
              <th>description</th><th>pos</th><th>⚠</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in visibleRows" :key="r.id" :class="{ warned: r.warning }">
              <td class="narrow"><input type="checkbox" v-model="r.include" /></td>
              <td><input v-model="r.name" /></td>
              <td class="narrow"><input v-model="r.price" /></td>
              <td><input v-model="r.category" /></td>
              <td><input v-model="r.allergens" /></td>
              <td><input v-model="r.description" /></td>
              <td class="narrow">{{ positionOf(r) }}</td>
              <td class="warn-cell">{{ r.warning }}</td>
              <td><button class="small" @click="removeRow(r)">✕</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <button class="small" @click="addRow">+ ред</button>

      <div class="actions">
        <button @click="download">Свали .csv</button>
        <button @click="copy">{{ copied ? 'Копирано ✓' : 'Копирай' }}</button>
      </div>
    </template>
  </div>
</template>

<script>
import { ref, reactive, computed, onBeforeUnmount } from 'vue'

import { useMenuScan } from '@/composables/useMenuScan'

const HEADERS = [
  'name', 'price', 'category', 'allergens',
  'description', 'picture_url', 'display_order_position',
]

export default {
  props: {
    menus: { type: Array, default: () => [] },
    currentMenuId: { type: [Number, String], default: null },
  },

  setup(props) {
    const scan = useMenuScan()

    const apiKey = ref(localStorage.getItem('claude_api_key') || '')
    const model = ref(localStorage.getItem('claude_model') || 'claude-sonnet-5-5')
    const selectedMenuId = ref(props.currentMenuId ?? null)
    const menuText = ref('')
    const dragOver = ref(false)
    const copied = ref(false)
    const onlyWarnings = ref(false)
    const answers = reactive({})

    const saveKey = () => localStorage.setItem('claude_api_key', apiKey.value.trim())

    /* ------------------------------------------------------------- menu */

    const menuLabel = (m) =>
      `${m.menu_owner?.menu_owner_name || `Меню #${m.id}`} (#${m.id})`

    const selectedMenu = computed(() =>
      props.menus.find((m) => String(m.id) === String(selectedMenuId.value))
    )

    // Existing categories go into the system prompt so Claude reuses the
    // exact names instead of inventing a near-duplicate ("Десерти" vs "Десерт").
    const knownCategories = computed(() => {
      const menu = selectedMenu.value
      if (!menu) return []

      const fromTree = flattenTree(menu.menu_configuration?.category_order)
      const fromItems = (menu.menu_items || [])
        .map((i) => String(i.category || '').trim())
        .filter(Boolean)

      return [...new Set([...fromTree, ...fromItems])]
    })

    function flattenTree(nodes, out = []) {
      for (const node of nodes || []) {
        const label = typeof node === 'string' ? node : node?.label
        if (label) out.push(String(label).trim())
        if (typeof node !== 'string' && node?.children?.length) flattenTree(node.children, out)
      }
      return out
    }

    /* ------------------------------------------------------------ files */

    const prettySize = (bytes) =>
      bytes < 1024 * 1024
        ? `${Math.round(bytes / 1024)} KB`
        : `${(bytes / 1024 / 1024).toFixed(1)} MB`

    const onPick = async (e) => {
      await scan.addFiles(e.target.files)
      e.target.value = '' // so picking the same file again still fires change
    }

    const onDrop = async (e) => {
      dragOver.value = false
      await scan.addFiles(e.dataTransfer?.files)
    }

    onBeforeUnmount(() => scan.releaseFiles())

    /* ----------------------------------------------------------- scanning */

    const generate = async () => {
      copied.value = false

      if (!apiKey.value.trim()) {
        scan.error.value = 'Въведи Claude API ключ.'
        return
      }
      if (!scan.files.value.length && !menuText.value.trim()) {
        scan.error.value = 'Прикачи снимки/PDF или постави текст на менюто.'
        return
      }

      saveKey()
      localStorage.setItem('claude_model', model.value)

      await scan.start({
        apiKey: apiKey.value.trim(),
        model: model.value,
        menuName: selectedMenu.value?.menu_owner?.menu_owner_name || '',
        knownCategories: knownCategories.value,
        menuText: menuText.value,
      })
    }

    const submitAnswers = () => {
      const payload = { ...answers }
      Object.keys(answers).forEach((k) => delete answers[k])
      scan.answerQuestions(payload)
    }

    /* --------------------------------------------------------------- rows */

    const visibleRows = computed(() =>
      onlyWarnings.value ? scan.rows.value.filter((r) => r.warning) : scan.rows.value
    )

    const exportRows = computed(() => scan.rows.value.filter((r) => r.include))

    // display_order_position: брояч, който почва от 1 във всяка категория
    const positions = computed(() => {
      const counters = {}
      const map = {}
      for (const r of exportRows.value) {
        const c = (r.category || '').trim()
        counters[c] = (counters[c] || 0) + 1
        map[r.id] = counters[c]
      }
      return map
    })

    const positionOf = (r) => positions.value[r.id] ?? ''

    const addRow = () =>
      scan.rows.value.push({
        id: `manual-${Date.now()}`,
        source: 'ръчно',
        name: '',
        price: '',
        category: scan.rows.value.at(-1)?.category || '',
        allergens: '',
        description: '',
        picture_url: '',
        warning: '',
        include: true,
      })

    const removeRow = (row) => {
      const i = scan.rows.value.indexOf(row)
      if (i !== -1) scan.rows.value.splice(i, 1)
    }

    /* ---------------------------------------------------------------- csv */

    const esc = (v) => {
      const s = String(v ?? '')
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }

    const buildCsv = () => {
      const lines = [HEADERS.join(',')]
      for (const r of exportRows.value) {
        lines.push(
          [r.name, r.price, r.category, r.allergens, r.description, r.picture_url, positions.value[r.id]]
            .map(esc)
            .join(',')
        )
      }
      return lines.join('\r\n') + '\r\n'
    }

    const download = () => {
      // BOM, за да се отваря кирилицата правилно в Excel
      const blob = new Blob(['﻿' + buildCsv()], { type: 'text/csv;charset=utf-8' })
      const base =
        selectedMenu.value?.menu_owner?.menu_owner_url_name ||
        selectedMenu.value?.menu_owner?.menu_owner_name ||
        'menu'
      const name = String(base).trim().replace(/[\\/:*?"<>|]/g, '_')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name.endsWith('.csv') ? name : name + '.csv'
      a.click()
      URL.revokeObjectURL(a.href)
    }

    const copy = async () => {
      await navigator.clipboard.writeText(buildCsv())
      copied.value = true
      setTimeout(() => (copied.value = false), 2000)
    }

    return {
      scan, apiKey, model, selectedMenuId, menuText, dragOver, copied, onlyWarnings, answers,
      menuLabel, knownCategories, prettySize, onPick, onDrop,
      generate, submitAnswers, visibleRows, positionOf, addRow, removeRow,
      saveKey, download, copy,
    }
  },
}
</script>

<style scoped>
.wrap { max-width: 1040px; margin: 0 auto; padding: 16px; font-family: system-ui, sans-serif; }
label { display: block; margin: 14px 0 4px; font-weight: 600; }
label.inline { display: inline-flex; align-items: center; gap: 6px; font-weight: 400; }
label.inline input { width: auto; }
input, textarea, select { width: 100%; box-sizing: border-box; padding: 8px; font: inherit; border: 1px solid #bbb; border-radius: 6px; }
button { margin-top: 12px; padding: 10px 18px; font: inherit; border: 0; border-radius: 6px; background: #2b6cb0; color: #fff; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: default; }
button.small { padding: 4px 10px; margin-top: 6px; }
.actions button { margin-right: 8px; }
.error { color: #c53030; }
.hint { margin: 4px 0 0; font-size: 12px; color: #666; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; min-width: 860px; }
th, td { padding: 2px; text-align: left; }
td.narrow { width: 70px; }
td input { padding: 4px; }
tr.warned td input { background: #fffbea; }
.warn-cell { font-size: 12px; color: #975a16; white-space: nowrap; }

.dropzone {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  padding: 20px; text-align: center; color: #555; cursor: pointer;
  border: 2px dashed #bbb; border-radius: 8px;
}
.dropzone.over { border-color: #2b6cb0; color: #2b6cb0; }
.dropzone small { color: #888; }

.files { list-style: none; padding: 0; margin: 10px 0 0; }
.files li { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.files img { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; }
.pdf-badge {
  width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #fff; background: #c53030; border-radius: 4px;
}
.fname { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fsize { color: #888; font-size: 12px; }
.files button { margin-top: 0; }

.feed { list-style: none; padding: 10px 12px; margin: 12px 0 0; background: #f7fafc; border-radius: 6px; font-size: 13px; }
.feed li { padding: 2px 0; }
.feed li.warn { color: #975a16; }
.feed li.claude { color: #2b6cb0; }
.feed li.done { font-weight: 600; }

.questions { margin-top: 16px; padding: 12px; border: 1px solid #2b6cb0; border-radius: 8px; }
.questions h3 { margin: 0 0 8px; }
.question { margin-bottom: 10px; }
.options { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
button.option { background: #e2e8f0; color: #1a202c; }
button.option.picked { background: #2b6cb0; color: #fff; }
</style>