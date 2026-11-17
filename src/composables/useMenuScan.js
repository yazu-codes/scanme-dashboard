import { ref, computed } from 'vue'

/*
|--------------------------------------------------------------------------
| Menu scanning (images / PDF -> rows)
|--------------------------------------------------------------------------
|
| Claude never returns rows as free text. It calls tools with JSON-schema
| validated payloads, so there is nothing to parse and a malformed answer is
| impossible rather than merely unlikely.
|
| Cost shape, which drives most of the design below: the transcript is
| re-sent on every turn, so a single long run grows as N^2. Running small
| batches, asking for several pages per turn and caching the file blocks are
| what keep a 30-photo menu in cents rather than dollars.
|
*/

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const PDF_TYPE = 'application/pdf'

// Images cost ceil(w/28) * ceil(h/28) visual tokens, so the long edge is the
// single biggest cost lever: 2000px = 3,888 tokens, 1400px = 1,900.
export const QUALITY = {
  normal: { maxEdge: 2000, label: 'Нормално (дребен шрифт)' },
  economy: { maxEdge: 1400, label: 'Икономично (по-евтино)' },
}

const JPEG_QUALITY = 0.86

// Files per conversation. Smaller batches mean a shorter transcript to
// re-send, less context, and a failure that costs one batch not the lot.
const BATCH_SIZE = 6

// Pages per assistant turn. Fewer round trips means the transcript is
// re-sent fewer times.
const PAGES_PER_TURN = 3

const MAX_TURNS = 40
const MAX_TOKENS = 16000
const MAX_UNDO = 20

/* ------------------------------------------------------------------ rows */

// Absolute pixels in the image as sent, NOT normalized: the docs are
// explicit that Claude handles 0-1000 style values poorly. Our code
// normalizes afterwards, using the dimensions we gave the model.
const BOX = {
  type: 'array',
  items: { type: 'integer', minimum: 0 },
  minItems: 4,
  maxItems: 4,
  description: '[x1, y1, x2, y2] в пиксели: горен ляв и долен десен ъгъл',
}

const LOCATION_SCHEMA = {
  type: 'object',
  description: 'Къде на страницата е отпечатан този ред',
  properties: {
    page: { type: 'integer', description: 'Номер на страница в PDF (от 1); 1 за снимки' },
    row_index: { type: 'integer', description: 'Поред кой ред е на тази страница (от 1)' },
    row_box: { ...BOX, description: 'Целият отпечатан ред, от името до цената' },
    value_box: { ...BOX, description: 'Само клетката, от която прочете цената' },
  },
}

function rowSchema(withLocation) {
  const properties = {
    name: {
      type: 'string',
      description: 'Името на ястието, точно както е отпечатано. Не превеждай и не "поправяй".',
    },
    price: {
      type: ['number', 'null'],
      description: 'Само числото, без валута. null, ако липсва или е нечетлива.',
    },
    category: {
      type: 'string',
      description: 'Заглавието на секцията (Супи, Основно, Десерти), с главна първа буква.',
    },
    allergens: {
      type: 'string',
      description: 'Само ако са изрично изписани за това ястие. Иначе празен низ.',
    },
    description: {
      type: 'string',
      description: 'Само ако е изрично изписано. Иначе празен низ.',
    },
    warning: {
      type: 'string',
      description: 'Празно, ако си сигурен. Иначе кратка бележка, започваща с ⚠.',
    },
  }

  if (withLocation) properties.location = LOCATION_SCHEMA

  return { type: 'object', required: ['name', 'price'], properties }
}

/* ---------------------------------------------------------------- tools */

function extractTools(withLocation) {
  const rows = { type: 'array', items: rowSchema(withLocation) }

  return [
    {
      name: 'ask_questions',
      description:
        'Питай потребителя за неща, които не можеш да разчетеш или решиш и които засягат МНОГО редове (напр. коя колона е цената, с ДДС ли са цените). За съмнение по един ред използвай warning, не въпрос.',
      input_schema: {
        type: 'object',
        required: ['questions'],
        properties: {
          questions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'question'],
              properties: {
                id: { type: 'string' },
                question: { type: 'string' },
                options: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
    {
      name: 'add_rows',
      description:
        'Добави ястията от ЕДНА страница или файл, в реда на отпечатване. Може да извикаш няколко add_rows в един отговор - по едно за всяка страница.',
      input_schema: {
        type: 'object',
        required: ['source', 'rows'],
        properties: {
          source: {
            type: 'string',
            description: 'Име на файла и страница, напр. "IMG_1234.jpg" или "menu.pdf стр.2"',
          },
          rows,
        },
      },
    },
    {
      name: 'finish',
      description: 'Извикай веднъж, когато всички файлове от тази партида са обработени.',
      input_schema: {
        type: 'object',
        required: ['summary'],
        properties: {
          venue_name: { type: 'string' },
          currency: { type: 'string' },
          prices_include_vat: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          summary: { type: 'string' },
        },
      },
    },
  ]
}

function editTools(withLocation) {
  const rows = { type: 'array', items: rowSchema(withLocation) }

  return [
    {
      name: 'update_rows',
      description:
        'Промени конкретни полета на съществуващи редове. Включвай САМО полетата, които се променят.',
      input_schema: {
        type: 'object',
        required: ['updates'],
        properties: {
          updates: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'set'],
              properties: {
                id: { type: 'string' },
                set: {
                  type: 'object',
                  description:
                    'Поле → нова стойност. Позволени: name, price, category, allergens, description, warning, include',
                },
              },
            },
          },
          reason: { type: 'string', description: 'Един ред, който се показва на потребителя' },
        },
      },
    },
    {
      name: 'delete_rows',
      description: 'Премахни редове (дубликати, заглавия, взети по погрешка за ястия).',
      input_schema: {
        type: 'object',
        required: ['ids'],
        properties: {
          ids: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string' },
        },
      },
    },
    {
      name: 'insert_rows',
      description: 'Добави пропуснати ястия. Ползвай after_id за позиция; без него се добавят накрая.',
      input_schema: {
        type: 'object',
        required: ['rows'],
        properties: { after_id: { type: 'string' }, source: { type: 'string' }, rows },
      },
    },
    {
      name: 'replace_source',
      description:
        'Разчети наново цяла страница/файл, когато много редове на нея са грешни (напр. цените са изместени с един ред). Дай ВСИЧКИ редове на тази страница. Възможно е само ако снимката е в текущия разговор.',
      input_schema: {
        type: 'object',
        required: ['source', 'rows'],
        properties: { source: { type: 'string' }, rows },
      },
    },
  ]
}

/* ----------------------------------------------------------- system prompt */

function buildSystemPrompt({ menuName, knownCategories, withLocation, priorAnswers }) {
  const lines = [
    `Превръщаш меню на заведение (снимки, PDF или текст, обикновено на български) в структурирани редове за дигитално меню.`,
    `Точността е по-важна от скоростта: тези редове отиват директно в менюто, което клиентите виждат.`,
    ``,
    `Обработвай файловете по ред. За всяка страница извиквай add_rows с ВСИЧКИ ястия на нея; никога не пропускай и не обобщавай.`,
    `Групирай до ${PAGES_PER_TURN} страници в един отговор (по едно add_rows за всяка), за да не губим обороти.`,
    `Заглавията на секции не са ястия - те стават стойност на "category" за ястията под тях.`,
    `Ако един файл е дубликат на страница, която вече си обработил, не добавяй редовете ѝ отново; кажи го накратко.`,
    ``,
    `Полета:`,
    `- name: точно както е отпечатано. Не превеждай, не съкращавай, не "поправяй" правописа.`,
    `- price: само числото (напр. 2.10). Цената често е залепена за името ("Таратор2.10€") - раздели ги. Ако липсва или е нечетлива: null + warning "⚠ НЯМА ЦЕНА".`,
    `- Ако едно ястие има няколко варианта с различни цени ("Шкембе чорба 2.60€/2.30€ /телешко/свинско/"), направи отделен ред за всеки вариант: "Шкембе чорба (телешко)" с 2.60 и "Шкембе чорба (свинско)" с 2.30, в същия ред на цените и вариантите.`,
    `- Ако под ястие има бележка като "/постно/", добави я в името в скоби: "Манастирски гювеч (постно)".`,
    `- category: заглавието на секцията, с главна първа буква и малки останали (ДЕСЕРТИ -> Десерти).`,
    `- allergens и description: попълвай САМО ако са изрично изписани в менюто. Иначе празен низ.`,
    `- warning: добавяй (започващ с ⚠) винаги когато нещо е несигурно - нечетливи цифри, цена, която не пасва на останалите, противоречие между колони, ръкописна корекция. Остави празно, когато си сигурен.`,
    ``,
    `Снимките често са под ъгъл или с подвита страница, така че колоните не съвпадат с имената. Свързвай по РЕД (n-тото име с n-тата цена) и проверявай дали стойността е правдоподобна за това ястие. Брой имената и цените на всяка страница; ако броят им се различава, сложи warning на засегнатите редове и попитай.`,
    `Игнорирай ръкописни знаци и маркери, освен ако не променят стойност.`,
    `Ако нещо е напълно нечетливо, пропусни го вместо да гадаеш.`,
  ]

  if (withLocation) {
    lines.push(
      ``,
      `За всеки ред от СНИМКА попълвай location: row_index, row_box (целият отпечатан ред) и value_box (клетката, от която прочете цената).`,
      `Координатите са в ПИКСЕЛИ на самата снимка - [x1, y1, x2, y2] = горен ляв и долен десен ъгъл, начало (0,0) горе вляво. Размерът на всяка снимка е написан до името ѝ.`,
      `При наклонени снимки value_box трябва да сочи цената, която ТИ си свързал с този ред, дори ако визуално е на друг ред.`,
      `За PDF файлове НЕ попълвай location - страниците се преоразмеряват и координатите не съвпадат.`
    )
  }

  lines.push(
    ``,
    `Игнорирай номерация и водещи символи като "1." или "*". Не измисляй нищо, което го няма в менюто.`,
    ``,
    `Използвай ask_questions САМО за неща, които засягат много редове. Въпросите да са кратки, с предложени опции.`,
    `Когато всички файлове са готови, извикай finish. Текстовите ти отговори да са много кратки.`,
    ``,
    `След това потребителят преглежда редовете и може да поиска промени на естествен език. Тогава:`,
    `- Промяна по конкретни редове: update_rows (само променените полета).`,
    `- Премахване: delete_rows. Пропуснати ястия: insert_rows.`,
    `- Системна грешка на цяла страница: replace_source с всички редове на страницата.`,
    `- Таблицата, която потребителят ти праща, е истината за текущото състояние.`,
    `- Не извиквай finish отново.`
  )

  if (menuName || knownCategories?.length || priorAnswers?.length) {
    lines.push('', 'Информация от потребителя:')
    if (menuName) lines.push(`- Менюто е за: ${menuName}`)
    if (knownCategories?.length) {
      lines.push(
        `- В това меню вече съществуват следните категории. Използвай ТОЧНО тези имена, когато секцията отговаря на някоя от тях: ${knownCategories.join(', ')}`
      )
    }
    // Carried across batches so the same question isn't asked again.
    for (const a of priorAnswers || []) lines.push(`- ${a}`)
  }

  return lines.join('\n')
}

/* ------------------------------------------------------------- file utils */

const b64 = (buf) => {
  const bytes = new Uint8Array(buf)
  let s = ''
  // Chunked: String.fromCharCode blows the stack on a whole multi-MB file.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

async function sha256(buf) {
  return b64(await crypto.subtle.digest('SHA-256', buf))
}

async function prepFile(file, maxEdge) {
  const buf = await file.arrayBuffer()
  const hash = await sha256(buf)

  const isPdf = file.type === PDF_TYPE || /\.pdf$/i.test(file.name)
  if (isPdf) {
    return {
      source: file,
      name: file.name,
      kind: 'pdf',
      media: PDF_TYPE,
      data: b64(buf),
      size: file.size,
      hash,
      preview: '',
    }
  }

  if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
    throw new Error(
      `"${file.name}" е HEIC. Браузърът не го поддържа - смени настройката на камерата на "Най-съвместим" (JPEG) или конвертирай файла.`
    )
  }

  if (!IMAGE_TYPES.includes(file.type)) {
    throw new Error(`"${file.name}" не е поддържан формат. Използвай JPG, PNG, GIF, WEBP или PDF.`)
  }

  const bmp = await createImageBitmap(new Blob([buf], { type: file.type }), {
    imageOrientation: 'from-image',
  })
  const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k)
  canvas.height = Math.round(bmp.height * k)
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close?.()

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', JPEG_QUALITY))

  return {
    source: file,
    name: file.name,
    kind: 'image',
    media: 'image/jpeg',
    data: b64(await blob.arrayBuffer()),
    size: blob.size,
    hash,
    // Told to Claude, and used to normalize the pixel boxes it returns.
    // Both quality presets stay under the high-resolution tier's limits
    // (2,576px edge / 4,784 visual tokens), so the API does not resize
    // server-side and these dimensions are what the model actually sees.
    width: canvas.width,
    height: canvas.height,
    // The exact pixels sent to Claude - the viewer's coordinates depend on it.
    preview: URL.createObjectURL(blob),
  }
}

/* ------------------------------------------------------------- normalizing */

function normalizePrice(p) {
  if (p === null || p === undefined || p === '') return ''
  const n = parseFloat(String(p).replace(',', '.').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n.toFixed(2) : ''
}

/*
 * Claude returns pixels; the viewer draws percentages. Converting here
 * means the rest of the app never has to know the image's size.
 */
function sanitizeBox(v, dims) {
  if (!Array.isArray(v) || v.length !== 4 || !dims) return null

  const nums = v.map((n) => Number(n))
  if (!nums.every(Number.isFinite)) return null

  let [x0, y0, x1, y1] = nums
  if (x1 < x0) [x0, x1] = [x1, x0]
  if (y1 < y0) [y0, y1] = [y1, y0]

  const to1000 = (value, extent) =>
    Math.max(0, Math.min(1000, Math.round((value / extent) * 1000)))

  const box = [
    to1000(x0, dims.width),
    to1000(y0, dims.height),
    to1000(x1, dims.width),
    to1000(y1, dims.height),
  ]

  if ((box[2] - box[0]) * (box[3] - box[1]) < 1000) return null // < 0.1% of the page

  return box
}

function sanitizeLocation(loc, dims) {
  if (!loc || typeof loc !== 'object' || !dims) return null

  const rowBox = sanitizeBox(loc.row_box, dims)
  const valueBox = sanitizeBox(loc.value_box, dims)
  if (!rowBox && !valueBox) return null

  const page = Number(loc.page)
  const index = Number(loc.row_index)

  return {
    page: Number.isFinite(page) && page > 0 ? Math.round(page) : 1,
    row_index: Number.isFinite(index) && index > 0 ? Math.round(index) : null,
    row_box: rowBox,
    value_box: valueBox,
  }
}

let nextRowId = 0

function normalizeRow(raw, source, dims) {
  const price = normalizePrice(raw.price)
  let warning = String(raw.warning || '').trim()

  // Never trust the model blindly: flag the gaps ourselves too.
  if (!price && !warning) warning = '⚠ НЯМА ЦЕНА'

  return {
    id: `r${nextRowId++}`,
    source: source || '',
    name: String(raw.name || '').trim(),
    price,
    category: String(raw.category || '').trim(),
    allergens: String(raw.allergens || '').trim(),
    description: String(raw.description || '').trim(),
    picture_url: '',
    warning,
    include: true,
    edited: '',
    location: sanitizeLocation(raw.location, dims),
  }
}

// Claude must never be able to touch ids or internal fields.
const EDITABLE = new Set([
  'name', 'price', 'category', 'allergens', 'description', 'warning', 'include',
])

function coerce(field, value) {
  if (field === 'price') return normalizePrice(value)
  if (field === 'include') return Boolean(value)
  return String(value ?? '').trim()
}

/* ------------------------------------------------------- source rendering */

/*
 * The viewer must display the EXACT pixels that were sent, because the
 * coordinates are relative to those. For photos that's the downscaled JPEG
 * kept as `preview`; for PDFs the page is rendered here.
 */

let pdfjs = null
const pageCache = new Map()

async function loadPdfjs() {
  if (pdfjs) return pdfjs

  let lib
  try {
    lib = await import('pdfjs-dist')
  } catch {
    throw new Error('За преглед на PDF страници е нужен пакетът pdfjs-dist (npm i pdfjs-dist).')
  }

  try {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    lib.GlobalWorkerOptions.workerSrc = worker.default
  } catch {
    lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${lib.version}/build/pdf.worker.min.mjs`
  }

  pdfjs = lib
  return lib
}

export async function pageImageFor(file, page = 1) {
  if (!file) return ''
  if (file.kind === 'image') return file.preview

  const key = `${file.hash}:${page}`
  if (pageCache.has(key)) return pageCache.get(key)

  const lib = await loadPdfjs()

  const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0))
  const doc = await lib.getDocument({ data: bytes }).promise
  const pageNo = Math.min(Math.max(1, page), doc.numPages)
  const pdfPage = await doc.getPage(pageNo)

  const viewport = pdfPage.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise

  const url = await new Promise((r) =>
    canvas.toBlob((b) => r(URL.createObjectURL(b)), 'image/jpeg', 0.9)
  )

  pageCache.set(key, url)
  return url
}

/* ------------------------------------------------------------- composable */

export function useMenuScan() {
  const files = ref([])
  const rows = ref([])
  const feed = ref([])
  const questions = ref(null)
  const info = ref(null)
  const busy = ref(false)
  const error = ref('')
  const undoStack = ref([])
  const progress = ref(null)
  const quality = ref('normal')

  let messages = []
  let pending = []
  let mode = 'extract'
  let batchFiles = []
  let priorAnswers = []
  let settings = {
    apiKey: '',
    model: '',
    menuName: '',
    knownCategories: [],
    withLocation: true,
  }

  const totalBytes = computed(() => files.value.reduce((s, f) => s + f.size, 0))
  const warningCount = computed(() => rows.value.filter((r) => r.warning).length)
  const canUndo = computed(() => undoStack.value.length > 0)

  const log = (text, kind = 'info') => feed.value.push({ id: feed.value.length, text, kind })

  /* ---------------------------------------------------------------- undo */

  function pushUndo(label) {
    undoStack.value.push({ label, rows: rows.value.map((r) => ({ ...r })) })
    if (undoStack.value.length > MAX_UNDO) undoStack.value.shift()
  }

  function undo() {
    const entry = undoStack.value.pop()
    if (!entry) return
    rows.value = entry.rows
    log(`Върнато: ${entry.label}`, 'warn')
  }

  /* --------------------------------------------------------------- files */

  async function addFiles(list) {
    error.value = ''
    const maxEdge = QUALITY[quality.value].maxEdge

    for (const file of Array.from(list || [])) {
      try {
        const prepared = await prepFile(file, maxEdge)

        if (files.value.some((f) => f.hash === prepared.hash)) {
          log(`${file.name}: вече е добавен (същият файл), пропуснат.`, 'warn')
          if (prepared.preview) URL.revokeObjectURL(prepared.preview)
          continue
        }

        files.value.push(prepared)
      } catch (e) {
        error.value = e.message || String(e)
      }
    }
  }

  // Changing quality re-encodes what's already attached, from the original
  // File handles kept on each entry.
  async function setQuality(name) {
    if (!QUALITY[name] || quality.value === name) return
    quality.value = name

    if (!files.value.length) return

    const originals = files.value.map((f) => f.source).filter(Boolean)
    files.value.forEach((f) => f.preview && URL.revokeObjectURL(f.preview))
    files.value = []
    await addFiles(originals)
  }

  function removeFile(index) {
    const [gone] = files.value.splice(index, 1)
    if (gone?.preview) URL.revokeObjectURL(gone.preview)
  }

  function releaseFiles() {
    files.value.forEach((f) => f.preview && URL.revokeObjectURL(f.preview))
  }

  /* ------------------------------------------------------------ API call */

  async function callClaude(body) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data?.error?.message || `Грешка ${res.status}`)
    return data
  }

  function fileBlock(f) {
    return f.kind === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: f.media, data: f.data } }
      : { type: 'image', source: { type: 'base64', media_type: f.media, data: f.data } }
  }

  function firstMessage(chunk, menuText) {
    const content = []

    if (chunk.length) {
      content.push({
        type: 'text',
        text: `Разчети тези ${chunk.length} файл(а). Подредени са по ред.`,
      })

      chunk.forEach((f, i) => {
        const dims = f.width ? ` (${f.width}x${f.height} px)` : ''
        content.push({ type: 'text', text: `Файл ${i + 1}: ${f.name}${dims}` })
        content.push(fileBlock(f))
      })

      // Cache everything up to here: the files are re-read on every turn of
      // this batch, at a tenth of the input price.
      content[content.length - 1].cache_control = { type: 'ephemeral' }
    }

    if (menuText?.trim()) {
      content.push({ type: 'text', text: `Текст на менюто:\n\n${menuText.trim()}` })
    }

    return { role: 'user', content }
  }

  /* -------------------------------------------------- extraction handlers */

  // Rows name their file ("IMG_1234.jpg"), which is how the pixel boxes
  // find the dimensions they have to be divided by.
  function dimsForSource(source) {
    const file = files.value.find((f) => String(source || '').includes(f.name))
    return file?.width ? { width: file.width, height: file.height } : null
  }

  function handleAddRows(input) {
    const source = input.source || 'без източник'
    const dims = dimsForSource(source)
    const fresh = (input.rows || [])
      .map((r) => normalizeRow(r, source, dims))
      .filter((r) => r.name)

    rows.value.push(...fresh)

    const warned = fresh.filter((r) => r.warning).length
    log(`${source}: ${fresh.length} ястия${warned ? ` (${warned} ⚠)` : ''}`)

    return {
      result: `Получих ${fresh.length} реда от ${source}. Общо: ${rows.value.length}.`,
    }
  }

  function handleAskQuestions(input, toolUseId) {
    questions.value = {
      toolUseId,
      list: (input.questions || []).map((q, i) => ({
        id: q.id || `q${i}`,
        question: q.question,
        options: q.options || [],
      })),
      answers: {},
    }
    return { pause: true }
  }

  function handleFinish(input) {
    info.value = input
    if (input.summary) log(input.summary, 'done')
    return { result: 'Благодаря.', done: true }
  }

  /* -------------------------------------------------------- edit handlers */

  function handleUpdateRows({ updates = [], reason }) {
    pushUndo(reason || 'Промяна от Claude')

    let changed = 0
    const missing = []

    for (const u of updates) {
      const row = rows.value.find((r) => r.id === u.id)
      if (!row) {
        missing.push(u.id)
        continue
      }

      for (const [field, value] of Object.entries(u.set || {})) {
        if (!EDITABLE.has(field)) continue
        row[field] = coerce(field, value)
      }

      row.edited = 'ai'
      changed++
    }

    log(`✎ ${reason || 'Промяна'}: ${changed} реда`, 'edit')

    return {
      result: `Променени ${changed} реда.${missing.length ? ` Непознати id: ${missing.join(', ')}` : ''}`,
    }
  }

  function handleDeleteRows({ ids = [], reason }) {
    pushUndo(reason || 'Изтриване от Claude')

    const before = rows.value.length
    const set = new Set(ids)
    rows.value = rows.value.filter((r) => !set.has(r.id))

    log(`✎ ${reason || 'Изтрити'}: ${before - rows.value.length} реда`, 'edit')
    return { result: `Изтрити ${before - rows.value.length} реда.` }
  }

  function handleInsertRows({ rows: incoming = [], after_id: afterId, source }) {
    pushUndo('Добавени редове от Claude')

    const fresh = incoming
      .map((r) => normalizeRow(r, source || 'добавено от Claude', dimsForSource(source)))
      .filter((r) => r.name)
    fresh.forEach((r) => (r.edited = 'ai'))

    const at = afterId ? rows.value.findIndex((r) => r.id === afterId) : -1
    if (at > -1) rows.value.splice(at + 1, 0, ...fresh)
    else rows.value.push(...fresh)

    log(`✎ Добавени ${fresh.length} реда`, 'edit')
    return { result: `Добавени ${fresh.length} реда.` }
  }

  function handleReplaceSource({ source, rows: incoming = [] }) {
    pushUndo(`Повторно разчитане на ${source}`)

    const at = rows.value.findIndex((r) => r.source === source)
    const removed = rows.value.filter((r) => r.source === source).length

    const fresh = incoming
      .map((r) => normalizeRow(r, source, dimsForSource(source)))
      .filter((r) => r.name)
    fresh.forEach((r) => (r.edited = 'ai'))

    const kept = rows.value.filter((r) => r.source !== source)
    kept.splice(at > -1 ? at : kept.length, 0, ...fresh)
    rows.value = kept

    log(`✎ ${source}: ${removed} → ${fresh.length} реда`, 'edit')
    return { result: `Заместих ${removed} реда от ${source} с ${fresh.length}.` }
  }

  const HANDLERS = {
    add_rows: handleAddRows,
    ask_questions: handleAskQuestions,
    finish: handleFinish,
    update_rows: handleUpdateRows,
    delete_rows: handleDeleteRows,
    insert_rows: handleInsertRows,
    replace_source: handleReplaceSource,
  }

  /* ---------------------------------------------------------------- loop */

  async function run() {
    busy.value = true

    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const data = await callClaude({
          model: settings.model,
          max_tokens: MAX_TOKENS,
          // Array form so the prompt itself is cached too - it is identical
          // on every turn and every batch.
          system: [
            {
              type: 'text',
              text: buildSystemPrompt({ ...settings, priorAnswers }),
              cache_control: { type: 'ephemeral' },
            },
          ],
          tools:
            mode === 'extract'
              ? extractTools(settings.withLocation)
              : editTools(settings.withLocation),
          messages,
        })

        if (data.stop_reason === 'max_tokens') {
          const last = messages[messages.length - 1]
          last.content = [].concat(last.content, [
            {
              type: 'text',
              text: 'Предишният ти отговор беше отрязан. Извиквай по една страница наведнъж.',
            },
          ])
          log('Отговорът беше отрязан - пробвам пак с по-малки порции.', 'warn')
          continue
        }

        messages.push({ role: 'assistant', content: data.content })

        for (const block of data.content) {
          if (block.type === 'text' && block.text.trim()) log(block.text.trim(), 'claude')
        }

        const uses = data.content.filter((b) => b.type === 'tool_use')
        if (!uses.length) break

        const results = []
        let pause = false
        let done = false

        for (const use of uses) {
          const handler = HANDLERS[use.name]

          if (!handler) {
            results.push({
              type: 'tool_result',
              tool_use_id: use.id,
              content: 'Непознат инструмент',
              is_error: true,
            })
            continue
          }

          const r = handler(use.input || {}, use.id)
          if (r.result != null) {
            results.push({ type: 'tool_result', tool_use_id: use.id, content: r.result })
          }
          pause = pause || !!r.pause
          done = done || !!r.done
        }

        if (pause || done) {
          pending = results
          return done ? 'done' : 'paused'
        }

        messages.push({ role: 'user', content: results })
      }
    } catch (e) {
      error.value = e.message || String(e)
      while (messages.length > 1 && messages[messages.length - 1].role === 'user') messages.pop()
      return 'error'
    } finally {
      busy.value = false
    }

    return 'ended'
  }

  /* --------------------------------------------------------------- batches */

  let queue = []
  let pendingText = ''

  function chunk(list, size) {
    const out = []
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
    return out
  }

  async function runQueue() {
    while (queue.length) {
      const batch = queue.shift()
      batchFiles = batch.files

      progress.value = { done: progress.value.total - queue.length - 1, total: progress.value.total }
      log(
        `Партида ${progress.value.done + 1}/${progress.value.total}: ${batch.files.length || 'текст'} файл(а)`,
        'batch'
      )

      mode = 'extract'
      pending = []
      messages = [firstMessage(batch.files, batch.text)]

      const outcome = await run()

      // A question stops the whole queue: the answer may change how the
      // remaining batches should be read.
      if (outcome === 'paused' || outcome === 'error') return
    }

    progress.value = null
  }

  async function start({ apiKey, model, menuName, knownCategories, menuText, withLocation }) {
    settings = { apiKey, model, menuName, knownCategories, withLocation: withLocation !== false }

    error.value = ''
    rows.value = []
    feed.value = []
    undoStack.value = []
    questions.value = null
    info.value = null
    priorAnswers = []
    pendingText = menuText || ''

    const groups = files.value.length ? chunk(files.value, BATCH_SIZE) : [[]]
    queue = groups.map((group, i) => ({
      files: group,
      // The pasted text rides along with the first batch only.
      text: i === 0 ? pendingText : '',
    }))

    progress.value = { done: 0, total: queue.length }

    if (queue.length > 1) {
      log(`${files.value.length} файла в ${queue.length} партиди (по-евтино и по-сигурно).`)
    }

    await runQueue()
  }

  function answerQuestions(answers) {
    const q = questions.value
    if (!q) return

    questions.value = null

    const payload = Object.fromEntries(
      q.list.map((x) => [x.id, String(answers[x.id] || '').trim() || 'не съм сигурен'])
    )

    // Remembered so later batches don't ask the same thing again.
    for (const item of q.list) {
      priorAnswers.push(`${item.question} → ${payload[item.id]}`)
    }

    messages.push({
      role: 'user',
      content: [
        ...pending.filter((p) => p.tool_use_id !== q.toolUseId),
        { type: 'tool_result', tool_use_id: q.toolUseId, content: JSON.stringify(payload) },
      ],
    })
    pending = []

    run().then((outcome) => {
      if (outcome !== 'paused' && outcome !== 'error' && queue.length) runQueue()
      else if (!queue.length) progress.value = null
    })
  }

  /* ---------------------------------------------------------- chat edits */

  // TSV rather than JSON: far cheaper in tokens, and Claude reads it fine.
  function rowsSnapshot() {
    const head = 'id\tsource\tname\tprice\tcategory\tallergens\tdescription\twarning\tinclude'
    const lines = rows.value.map((r) =>
      [r.id, r.source, r.name, r.price, r.category, r.allergens, r.description, r.warning, r.include ? 1 : 0]
        .map((v) => String(v ?? '').replace(/[\t\n]/g, ' '))
        .join('\t')
    )
    return `${head}\n${lines.join('\n')}`
  }

  function sendChatEdit(text) {
    if (!text.trim() || busy.value) return

    mode = 'edit'
    log(text.trim(), 'user')

    const content = [...pending]

    // Only the last batch's photos are in this conversation. If the request
    // names a file from another batch, attach that one so a re-read is
    // possible without paying for all of them.
    const named = files.value.filter(
      (f) => text.includes(f.name) && !batchFiles.includes(f)
    )

    for (const f of named) {
      content.push({ type: 'text', text: `Файл: ${f.name}` })
      content.push(fileBlock(f))
      batchFiles = [...batchFiles, f]
    }

    content.push({
      type: 'text',
      text: `${text.trim()}

Текущи редове (потребителят може да ги е редактирал на ръка; тази таблица е истината):
${rowsSnapshot()}

Направи промяната с update_rows / delete_rows / insert_rows (или replace_source за цяла страница). Не извиквай finish.`,
    })

    messages.push({ role: 'user', content })
    pending = []

    run()
  }

  function clearEditMarks() {
    rows.value.forEach((r) => (r.edited = ''))
  }

  return {
    files,
    rows,
    feed,
    questions,
    info,
    busy,
    error,
    undoStack,
    progress,
    quality,
    totalBytes,
    warningCount,
    canUndo,
    addFiles,
    setQuality,
    removeFile,
    releaseFiles,
    start,
    answerQuestions,
    sendChatEdit,
    undo,
    clearEditMarks,
  }
}