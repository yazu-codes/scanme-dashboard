<template>
  <div
    class="viewer"
    :class="variant"
    :role="variant === 'overlay' ? 'dialog' : 'region'"
    aria-label="Източник на ястието"
  >
    <header class="viewer-head">
      <div class="where">
        <strong>{{ file?.name || 'Източник' }}</strong>
        <span v-if="file?.kind === 'pdf'">стр. {{ page }}</span>
      </div>

      <button
        v-if="hasBox"
        class="text-btn"
        :aria-pressed="zoomed"
        @click="zoomed = !zoomed"
      >{{ zoomed ? 'Цяла страница' : 'Приближи реда' }}</button>

      <button
        v-if="variant === 'sheet'"
        class="icon-btn"
        aria-label="На цял екран"
        @click="$emit('expand')"
      >⤢</button>

      <button
        class="icon-btn"
        :aria-label="variant === 'pane' ? 'Откачи' : 'Затвори'"
        @click="$emit('close')"
      >✕</button>
    </header>

    <div class="viewer-body">
      <p v-if="loadError" class="viewer-msg error">{{ loadError }}</p>
      <p v-else-if="!imageUrl" class="viewer-msg">Подготвям страницата…</p>

      <!--
        Zoomed: the stage crops and the page is scaled so the row fills
        the width. A whole menu page on a phone is unreadable, which
        defeats the point of checking it.
      -->
      <div v-else class="stage" :class="{ zoomed }">
        <div
          class="page"
          :style="zoomed ? zoomStyle : null"
          @click="zoomed ? null : pickAt($event)"
        >
          <img :src="imageUrl" :alt="`Страница от ${file?.name}`" />

          <div v-if="bandStyle" class="hl-band" :style="bandStyle"></div>
          <div v-if="rowStyle" class="hl-row" :style="rowStyle"></div>
          <div v-if="valueStyle" class="hl-value" :style="valueStyle"></div>
        </div>
      </div>

      <p v-if="imageUrl && !hasBox" class="viewer-msg">
        Claude не е отбелязал позиция за този ред.
      </p>
    </div>

    <footer class="viewer-foot">
      <div class="nav">
        <button class="icon-btn" aria-label="Предишно" :disabled="!canPrev" @click="step(-1)">◀</button>
        <span class="counter">{{ indexLabel }}</span>
        <button class="icon-btn" aria-label="Следващо" :disabled="!canNext" @click="step(1)">▶</button>
      </div>

      <!-- Editable here: the point is to fix what you see is wrong -->
      <div class="check" v-if="row">
        <input v-model="row.name" aria-label="Име на ястието" />
        <input v-model="row.price" class="price" inputmode="decimal" aria-label="Цена" />
      </div>

      <p v-if="row?.warning" class="viewer-warning">{{ row.warning }}</p>

      <p class="approx">Рамките са приблизителни — показват реда, не точния пиксел.</p>
    </footer>
  </div>
</template>

<script>
import { ref, computed, watch } from 'vue'

import { pageImageFor } from '@/composables/useMenuScan'

// Claude's boxes land on the right line but not the exact edge, so they are
// padded a little and backed by a full-width band.
const PAD = 10

const pct = (v) => `${Math.max(0, Math.min(1000, v)) / 10}%`

function boxStyle(box, pad = PAD) {
  if (!box) return null
  const [x0, y0, x1, y1] = box
  return {
    left: pct(x0 - pad),
    top: pct(y0 - pad),
    width: pct(x1 - x0 + pad * 2),
    height: pct(y1 - y0 + pad * 2),
  }
}

export default {
  props: {
    file: { type: Object, default: null },
    row: { type: Object, default: null },
    rows: { type: Array, default: () => [] },

    // overlay = full screen, pane = docked right, sheet = docked bottom
    variant: {
      type: String,
      default: 'overlay',
      validator: (v) => ['overlay', 'pane', 'sheet'].includes(v),
    },
  },

  emits: ['close', 'select', 'expand'],

  setup(props) {
    const imageUrl = ref('')
    const loadError = ref('')
    const pageEl = ref(null)

    // On a phone the row is the only thing worth showing by default.
    const zoomed = ref(props.variant === 'sheet')

    const page = computed(() => props.row?.location?.page || 1)

    watch(
      () => [props.file?.hash, page.value],
      async () => {
        imageUrl.value = ''
        loadError.value = ''

        if (!props.file) {
          loadError.value = 'Не намирам файла за този ред.'
          return
        }

        try {
          imageUrl.value = await pageImageFor(props.file, page.value)
        } catch (e) {
          loadError.value = e.message || String(e)
        }
      },
      { immediate: true }
    )

    /* ---------------------------------------------------------- highlights */

    const rowBox = computed(() => props.row?.location?.row_box || null)
    const valueBox = computed(() => props.row?.location?.value_box || null)
    const hasBox = computed(() => Boolean(rowBox.value || valueBox.value))

    const rowStyle = computed(() => boxStyle(rowBox.value))
    const valueStyle = computed(() => boxStyle(valueBox.value, 4))

    // A full-width band guarantees the correct line is visible even when
    // the box is a little off.
    const bandStyle = computed(() => {
      const box = rowBox.value || valueBox.value
      if (!box) return null
      return { top: pct(box[1] - 15), height: pct(box[3] - box[1] + 30) }
    })

    /* ---------------------------------------------------------------- zoom */

    /*
     * Scale from the box WIDTH alone, so the image's aspect ratio never
     * has to be known: the page is sized as a multiple of the stage width,
     * then shifted by a fraction of its own size to put the row's centre
     * in the middle of the stage.
     */
    const zoomStyle = computed(() => {
      const box = rowBox.value || valueBox.value
      if (!box) return null

      const [x0, y0, x1, y1] = box
      const widthFraction = Math.max((x1 - x0) / 1000, 0.05)
      const scale = Math.min(Math.max(0.85 / widthFraction, 1.2), 6)

      return {
        '--z': scale,
        '--fx': (x0 + x1) / 2 / 1000,
        '--fy': (y0 + y1) / 2 / 1000,
      }
    })

    /* -------------------------------------------------------------- paging */

    // Only rows printed on this same page can be stepped through.
    const siblings = computed(() =>
      props.rows.filter(
        (r) => r.source === props.row?.source && (r.location?.page || 1) === page.value
      )
    )

    const index = computed(() => siblings.value.indexOf(props.row))
    const canPrev = computed(() => index.value > 0)
    const canNext = computed(() => index.value > -1 && index.value < siblings.value.length - 1)

    const indexLabel = computed(() =>
      index.value > -1 ? `${index.value + 1} / ${siblings.value.length}` : '—'
    )

    return { imageUrl, loadError, pageEl, page, hasBox, zoomed, zoomStyle, rowStyle, valueStyle, bandStyle, siblings, index, canPrev, canNext, indexLabel }
  },

  methods: {
    step(delta) {
      const next = this.siblings[this.index + delta]
      if (next) this.$emit('select', next)
    },

    // Click the page to jump to whichever row is printed there.
    pickAt(event) {
      const rect = event.currentTarget.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * 1000
      const y = ((event.clientY - rect.top) / rect.height) * 1000

      let best = null

      for (const candidate of this.siblings) {
        const box = candidate.location?.row_box || candidate.location?.value_box
        if (!box) continue

        const [x0, y0, x1, y1] = box
        const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1
        const distance = inside ? 0 : Math.abs(y - (y0 + y1) / 2)

        if (!best || distance < best.distance) best = { row: candidate, distance }
      }

      if (best && best.distance < 40) this.$emit('select', best.row)
    },
  },
}
</script>

<style scoped>
.viewer {
  display: flex;
  flex-direction: column;
  background: #10161d;
  color: #f3f6f9;
}

.viewer.overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
}

/* Docked: the host decides the height, the body scrolls inside it. */
.viewer.pane {
  height: 100%;
  min-height: 0;
  border-radius: 12px;
  overflow: hidden;
}

/* Phone: half the screen, cards still scrolling above it */
.viewer.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1200;
  height: 46dvh;
  min-height: 260px;
  border-radius: 14px 14px 0 0;
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.35);
  padding-bottom: env(safe-area-inset-bottom);
}

/* ------------------------------------------------------------- zoom -- */

.stage {
  position: relative;
  width: 100%;
  max-width: 100%;
}

.stage.zoomed {
  /* Fills the body so the crop has a fixed window to work with */
  height: 100%;
  overflow: hidden;
}

.stage.zoomed .page {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--z) * 100%);
  /*
   * Percentages here resolve against the page's own size, so this puts
   * the point (--fx, --fy) of the image at the centre of the stage
   * without needing to know the image's height.
   */
  transform: translate(calc(var(--fx) * -100%), calc(var(--fy) * -100%));
}

.viewer-head, .viewer-foot {
  flex: 0 0 auto;
  padding: 10px 14px;
  background: #0b1016;
}

.viewer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid #263140;
}
.where { display: flex; gap: 8px; align-items: baseline; min-width: 0; }
.where strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.where span { font-size: 0.85rem; color: #9fb0c2; }

.viewer-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 10px;
}

.page { position: relative; display: inline-block; max-width: 100%; }
.page img { display: block; max-width: 100%; height: auto; border-radius: 4px; }

.hl-band, .hl-row, .hl-value { position: absolute; pointer-events: none; }
.hl-band { left: 0; right: 0; background: rgba(255, 214, 0, 0.18); }
/* Dashed, because an approximate box should not look like proof */
.hl-row { border: 2px dashed #ffc400; border-radius: 3px; }
.hl-value { background: rgba(44, 160, 90, 0.3); outline: 2px solid #2ca05a; border-radius: 2px; }

.viewer-msg { margin: 20px auto; color: #9fb0c2; text-align: center; }
.viewer-msg.error { color: #ff9b9b; }

.viewer-foot { border-top: 1px solid #263140; }
.nav { display: flex; align-items: center; justify-content: center; gap: 12px; }
.counter { font-variant-numeric: tabular-nums; font-size: 0.9rem; color: #9fb0c2; }

.check { display: flex; gap: 8px; margin-top: 8px; }
.check input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 10px;
  font: inherit;
  font-size: 16px;
  color: #10161d;
  background: #fff;
  border: 1px solid #405063;
  border-radius: 8px;
}
.check .price { flex: 0 0 6rem; text-align: right; font-variant-numeric: tabular-nums; }

.viewer-warning { margin: 8px 0 0; font-size: 0.85rem; font-weight: 600; color: #ffce7a; }
.approx { margin: 8px 0 0; font-size: 0.75rem; color: #7f8fa1; text-align: center; }

.text-btn {
  padding: 8px 12px;
  font: inherit;
  font-size: 0.85rem;
  color: #cfe0f2;
  background: #1c2733;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  min-height: 40px;
}
.text-btn[aria-pressed='true'] { background: #27394c; color: #fff; }

.icon-btn {
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  font: inherit;
  color: #f3f6f9;
  background: none;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}
.icon-btn:disabled { opacity: 0.35; cursor: default; }
.icon-btn:focus-visible, .text-btn:focus-visible, .check input:focus-visible {
  outline: 3px solid #6aa9ff;
  outline-offset: 2px;
}
</style>