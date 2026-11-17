<template>
  <div class="wrap">
    <h2>Меню → CSV</h2>

    <!-- ================================================= setup ========= -->
    <section class="panel">
      <div class="field-grid">
        <label class="field">
          <span>Меню</span>
          <select v-model="selectedMenuId">
            <option :value="null">— избери меню —</option>
            <option v-for="m in menus" :key="m.id" :value="m.id">
              {{ menuLabel(m) }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Модел</span>
          <select v-model="model">
            <option value="claude-sonnet-5-5">Sonnet — бърз</option>
            <option value="claude-opus-5">Opus — за трудни снимки</option>
          </select>
        </label>

        <label class="field">
          <span>Claude API ключ</span>
          <input
            type="password"
            v-model="apiKey"
            placeholder="sk-ant-..."
            @change="saveKey"
          />
        </label>
      </div>

      <p v-if="knownCategories.length" class="note">
        Ще ползва категориите на това меню: {{ knownCategories.join(' · ') }}
      </p>
    </section>

    <!-- ================================================= files ========= -->
    <section class="panel">
      <div
        class="dropzone"
        :class="{ over: dragOver }"
        role="button"
        tabindex="0"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
        @click="$refs.fileInput.click()"
        @keydown.enter="$refs.fileInput.click()"
      >
        <strong>Снимки или PDF на менюто</strong>
        <span>Пусни файлове тук или докосни, за да избереш</span>
        <small>JPG, PNG, GIF, WEBP, PDF — снимките се смаляват автоматично</small>
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
          <span v-else class="pdf-mark">PDF</span>
          <span class="file-name">{{ f.name }}</span>
          <span class="file-size">{{ prettySize(f.size) }}</span>
          <button
            class="icon-btn"
            :disabled="scan.busy.value"
            aria-label="Премахни файла"
            @click="scan.removeFile(i)"
          >✕</button>
        </li>
      </ul>

      <details class="paste">
        <summary>Или постави текст на менюто</summary>
        <textarea
          v-model="menuText"
          rows="6"
          placeholder="Супи&#10;* Пилешка супа 1.90€"
        ></textarea>
      </details>

      <button class="primary" :disabled="scan.busy.value" @click="generate">
        {{ scan.busy.value ? 'Чета менюто…' : 'Разчети менюто' }}
      </button>

      <p v-if="scan.error.value" class="alert error">{{ scan.error.value }}</p>
    </section>

    <!-- ============================================== progress ========= -->
    <ul v-if="scan.feed.value.length" class="feed">
      <li v-for="line in scan.feed.value" :key="line.id" :class="line.kind">
        {{ line.text }}
      </li>
    </ul>

    <!-- ============================================== questions ======== -->
    <section v-if="scan.questions.value" class="panel asking">
      <h3>Нужно е решение</h3>

      <div v-for="q in scan.questions.value.list" :key="q.id" class="question">
        <p>{{ q.question }}</p>

        <div v-if="q.options.length" class="options">
          <button
            v-for="opt in q.options"
            :key="opt"
            class="chip"
            :class="{ picked: answers[q.id] === opt }"
            @click="answers[q.id] = opt"
          >{{ opt }}</button>
        </div>

        <input v-model="answers[q.id]" placeholder="или напиши отговор" />
      </div>

      <button class="primary" @click="submitAnswers">Изпрати</button>
    </section>

    <!-- ================================================ review ========= -->
    <template v-if="scan.rows.value.length">
      <div class="review-bar">
        <div class="counts">
          <strong>{{ includedCount }}</strong> ястия
          <span v-if="scan.warningCount.value" class="warn-count">
            · {{ scan.warningCount.value }} за проверка
          </span>
        </div>

        <div class="bar-actions">
          <button
            v-if="scan.warningCount.value"
            class="chip"
            :class="{ picked: onlyWarnings }"
            @click="onlyWarnings = !onlyWarnings"
          >Само за проверка</button>

          <button class="chip" @click="addRow">+ ястие</button>
        </div>
      </div>

      <datalist id="known-categories">
        <option v-for="c in allCategories" :key="c" :value="c" />
      </datalist>

      <ul class="dishes">
        <li
          v-for="r in visibleRows"
          :key="r.id"
          class="dish"
          :class="{ warned: r.warning, excluded: !r.include }"
        >
          <div class="dish-top">
            <span class="pos">{{ positionOf(r) || '–' }}</span>

            <input
              v-model="r.name"
              class="dish-name"
              placeholder="Име на ястието"
            />

            <input
              v-model="r.price"
              class="dish-price"
              inputmode="decimal"
              placeholder="0.00"
            />
          </div>

          <p v-if="r.warning" class="dish-warning">{{ r.warning }}</p>

          <div class="dish-fields">
            <label class="field">
              <span>Категория</span>
              <input v-model="r.category" list="known-categories" />
            </label>

            <label class="field">
              <span>Алергени</span>
              <input v-model="r.allergens" />
            </label>

            <label class="field wide">
              <span>Описание</span>
              <input v-model="r.description" />
            </label>
          </div>

          <div class="dish-bottom">
            <label class="switch">
              <input type="checkbox" v-model="r.include" />
              <span>{{ r.include ? 'Включено' : 'Пропуснато' }}</span>
            </label>

            <span class="source">{{ r.source }}</span>

            <button class="icon-btn danger" aria-label="Изтрий" @click="removeRow(r)">✕</button>
          </div>
        </li>
      </ul>

      <div class="export-bar">
        <button class="primary" @click="download">Свали .csv</button>
        <button class="ghost" @click="copy">
          {{ copied ? 'Копирано ✓' : 'Копирай' }}
        </button>
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

    function flattenTree(nodes, out = []) {
      for (const node of nodes || []) {
        const label = typeof node === 'string' ? node : node?.label
        if (label) out.push(String(label).trim())
        if (typeof node !== 'string' && node?.children?.length) flattenTree(node.children, out)
      }
      return out
    }

    // Fed to Claude so it reuses the menu's own category names instead of
    // inventing a near-duplicate ("Десерт" when the menu says "Десерти").
    const knownCategories = computed(() => {
      const menu = selectedMenu.value
      if (!menu) return []

      const fromTree = flattenTree(menu.menu_configuration?.category_order)
      const fromItems = (menu.menu_items || [])
        .map((i) => String(i.category || '').trim())
        .filter(Boolean)

      return [...new Set([...fromTree, ...fromItems])]
    })

    // Known categories plus whatever came back, for the datalist.
    const allCategories = computed(() => {
      const found = scan.rows.value.map((r) => r.category).filter(Boolean)
      return [...new Set([...knownCategories.value, ...found])]
    })

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

    /* --------------------------------------------------------- scanning */

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

    /* ------------------------------------------------------------- rows */

    const visibleRows = computed(() =>
      onlyWarnings.value ? scan.rows.value.filter((r) => r.warning) : scan.rows.value
    )

    const exportRows = computed(() => scan.rows.value.filter((r) => r.include))

    const includedCount = computed(() => exportRows.value.length)

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

    const addRow = () => {
      onlyWarnings.value = false
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
    }

    const removeRow = (row) => {
      const i = scan.rows.value.indexOf(row)
      if (i !== -1) scan.rows.value.splice(i, 1)
    }

    /* -------------------------------------------------------------- csv */

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
      menuLabel, knownCategories, allCategories, prettySize, onPick, onDrop,
      generate, submitAnswers, visibleRows, includedCount, positionOf, addRow, removeRow,
      saveKey, download, copy,
    }
  },
}
</script>

<style scoped>
.wrap {
  --ink: #16202b;
  --muted: #65727f;
  --line: #dde3e9;
  --surface: #f5f7f9;
  --accent: #2b6cb0;
  --warn: #b45309;
  --warn-soft: #fef6e7;
  --danger: #c53030;

  max-width: 1040px;
  margin: 0 auto;
  padding: 16px;
  color: var(--ink);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  line-height: 1.45;
}

h2 { margin: 0 0 16px; font-size: 1.5rem; letter-spacing: -0.01em; }
h3 { margin: 0 0 10px; font-size: 1.05rem; }

/* ---------------------------------------------------------- controls -- */

.field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.field > span { font-size: 0.8rem; color: var(--muted); }

input, textarea, select {
  width: 100%;
  box-sizing: border-box;
  padding: 10px;
  /* 16px keeps iOS from zooming the page on focus */
  font: inherit;
  font-size: 16px;
  color: inherit;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
}

input:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  border-color: var(--accent);
}

button {
  font: inherit;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  min-height: 44px;
  padding: 10px 18px;
  background: var(--surface);
  color: var(--ink);
}
button:disabled { opacity: 0.55; cursor: default; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

button.primary { background: var(--accent); color: #fff; }
button.ghost { background: #fff; border: 1px solid var(--line); }

.icon-btn {
  min-height: 36px;
  min-width: 36px;
  padding: 0;
  background: none;
  color: var(--muted);
  font-size: 1rem;
}
.icon-btn.danger { color: var(--danger); }

.chip {
  min-height: 36px;
  padding: 6px 12px;
  font-size: 0.9rem;
  background: #fff;
  border: 1px solid var(--line);
}
.chip.picked { background: var(--accent); border-color: var(--accent); color: #fff; }

/* ------------------------------------------------------------ panels -- */

.panel {
  padding: 16px;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.panel > button.primary { margin-top: 14px; width: 100%; }
.panel.asking { border-color: var(--accent); }

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.note { margin: 10px 0 0; font-size: 0.8rem; color: var(--muted); }

.alert { margin: 12px 0 0; padding: 10px 12px; border-radius: 8px; font-size: 0.9rem; }
.alert.error { background: #fdeaea; color: var(--danger); }

/* ------------------------------------------------------------- files -- */

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 24px 16px;
  text-align: center;
  background: var(--surface);
  border: 2px dashed var(--line);
  border-radius: 10px;
  cursor: pointer;
}
.dropzone.over, .dropzone:focus-visible { border-color: var(--accent); background: #eef4fb; }
.dropzone span { font-size: 0.9rem; color: var(--muted); }
.dropzone small { font-size: 0.75rem; color: var(--muted); }

.files { list-style: none; padding: 0; margin: 12px 0 0; }
.files li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
}
.files li:last-child { border-bottom: 0; }
.files img { width: 44px; height: 44px; object-fit: cover; border-radius: 6px; }
.pdf-mark {
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; font-weight: 700; color: #fff;
  background: var(--danger); border-radius: 6px;
}
.file-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-size { font-size: 0.8rem; color: var(--muted); }

.paste { margin-top: 14px; }
.paste summary { cursor: pointer; font-size: 0.9rem; color: var(--accent); }
.paste textarea { margin-top: 8px; }

/* -------------------------------------------------------------- feed -- */

.feed {
  list-style: none;
  padding: 12px 14px;
  margin: 0 0 16px;
  background: var(--surface);
  border-radius: 10px;
  font-size: 0.875rem;
}
.feed li { padding: 2px 0; }
.feed li.warn { color: var(--warn); }
.feed li.claude { color: var(--accent); }
.feed li.done { font-weight: 600; }

/* --------------------------------------------------------- questions -- */

.question { margin-bottom: 14px; }
.question p { margin: 0 0 8px; font-weight: 600; }
.options { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }

/* ------------------------------------------------------------ review -- */

.review-bar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 0;
  margin-bottom: 8px;
  background: #fff;
  border-bottom: 1px solid var(--line);
}
.counts { font-size: 0.95rem; color: var(--muted); }
.counts strong { font-size: 1.15rem; color: var(--ink); }
.warn-count { color: var(--warn); }
.bar-actions { display: flex; gap: 8px; }

.dishes { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }

.dish {
  padding: 12px;
  background: #fff;
  border: 1px solid var(--line);
  /* The flagged edge is the whole point: findable while scrolling fast. */
  border-left: 4px solid transparent;
  border-radius: 10px;
}
.dish.warned { border-left-color: var(--warn); background: var(--warn-soft); }
.dish.excluded { opacity: 0.5; }

.dish-top { display: flex; align-items: center; gap: 8px; }

.pos {
  flex: 0 0 auto;
  min-width: 1.75rem;
  text-align: center;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

.dish-name { flex: 1 1 auto; min-width: 0; font-weight: 600; }

.dish-price {
  flex: 0 0 5.5rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.dish-warning {
  margin: 8px 0 0;
  padding-left: calc(1.75rem + 8px);
  font-size: 0.85rem;
  color: var(--warn);
}

.dish-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
  margin-top: 10px;
}
.dish-fields .wide { grid-column: 1 / -1; }

.dish-bottom {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.switch { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: var(--muted); }
.switch input { width: auto; min-height: 0; }

.source {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
  color: var(--muted);
  text-align: right;
}

.export-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 8px;
  padding: 12px 0;
  margin-top: 12px;
  background: #fff;
  border-top: 1px solid var(--line);
}
.export-bar button { flex: 1 1 auto; }

@media (min-width: 720px) {
  .export-bar button { flex: 0 0 auto; }
}

@media (max-width: 480px) {
  .wrap { padding: 12px; }
  .panel { padding: 12px; }
  .dish-price { flex-basis: 4.5rem; }
}
</style>