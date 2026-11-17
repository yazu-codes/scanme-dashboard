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
| Two modes share one conversation:
|   extract - read the files, one add_rows call per page
|   edit    - change rows the user is reviewing, addressed by id
|
*/

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const PDF_TYPE = 'application/pdf'

// ~2000px on the long side keeps small print readable while cutting the
// image token count dramatically versus a full-size phone photo.
const MAX_EDGE = 2000
const JPEG_QUALITY = 0.86

const MAX_TURNS = 80
const MAX_TOKENS = 32000
const MAX_UNDO = 20

/* ------------------------------------------------------------------ rows */

const ROW_SCHEMA = {
  type: 'object',
  required: ['name', 'price'],
  properties: {
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
  },
}

const ROWS_ARRAY = { type: 'array', items: ROW_SCHEMA }

/* ---------------------------------------------------------------- tools */

const EXTRACT_TOOLS = [
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
      'Добави ястията от ЕДНА страница или файл, в реда на отпечатване. Максимум 50 реда на извикване; дълга страница се разделя на няколко извиквания.',
    input_schema: {
      type: 'object',
      required: ['source', 'rows'],
      properties: {
        source: {
          type: 'string',
          description: 'Име на файла и страница, напр. "IMG_1234.jpg" или "menu.pdf стр.2"',
        },
        rows: ROWS_ARRAY,
      },
    },
  },
  {
    name: 'finish',
    description: 'Извикай веднъж, когато всички файлове и страници са обработени.',
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

const EDIT_TOOLS = [
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
      properties: {
        after_id: { type: 'string' },
        source: { type: 'string' },
        rows: ROWS_ARRAY,
      },
    },
  },
  {
    name: 'replace_source',
    description:
      'Разчети наново цяла страница/файл, когато много редове на нея са грешни (напр. цените са изместени с един ред). Дай ВСИЧКИ редове на тази страница.',
    input_schema: {
      type: 'object',
      required: ['source', 'rows'],
      properties: { source: { type: 'string' }, rows: ROWS_ARRAY },
    },
  },
]

/* ----------------------------------------------------------- system prompt */

function buildSystemPrompt({ menuName, knownCategories }) {
  const lines = [
    `Превръщаш меню на заведение (снимки, PDF или текст, обикновено на български) в структурирани редове за дигитално меню.`,
    `Точността е по-важна от скоростта: тези редове отиват директно в менюто, което клиентите виждат.`,
    ``,
    `Обработвай файловете по ред. За всяка страница извиквай add_rows с ВСИЧКИ ястия на нея; никога не пропускай и не обобщавай.`,
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
    ``,
    `Игнорирай номерация и водещи символи като "1." или "*". Не измисляй нищо, което го няма в менюто.`,
    ``,
    `Използвай ask_questions САМО за неща, които засягат много редове. Въпросите да са кратки, с предложени опции.`,
    `Когато всички файлове са готови, извикай finish. Текстовите ти отговори да са много кратки.`,
    ``,
    `След това потребителят преглежда редовете и може да поиска промени на естествен език. Тогава:`,
    `- Промяна по конкретни редове: update_rows (само променените полета).`,
    `- Премахване: delete_rows. Пропуснати ястия: insert_rows.`,
    `- Системна грешка на цяла страница (напр. цените са изместени с един ред): replace_source с всички редове на страницата, прочетени наново от снимката.`,
    `- Таблицата, която потребителят ти праща, е истината за текущото състояние - той може да е редактирал на ръка.`,
    `- Не извиквай finish отново.`,
  ]

  if (menuName || knownCategories?.length) {
    lines.push('', 'Информация от потребителя:')
    if (menuName) lines.push(`- Менюто е за: ${menuName}`)
    if (knownCategories?.length) {
      lines.push(
        `- В това меню вече съществуват следните категории. Използвай ТОЧНО тези имена, когато секцията отговаря на някоя от тях, вместо да измисляш нов вариант: ${knownCategories.join(', ')}`
      )
    }
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

async function prepFile(file) {
  const buf = await file.arrayBuffer()
  const hash = await sha256(buf)

  const isPdf = file.type === PDF_TYPE || /\.pdf$/i.test(file.name)
  if (isPdf) {
    return {
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

  // Downscale before sending: image tokens grow with resolution, and a 12MP
  // photo costs several times a 2000px one with no gain in readability.
  const bmp = await createImageBitmap(new Blob([buf], { type: file.type }), {
    imageOrientation: 'from-image',
  })
  const k = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k)
  canvas.height = Math.round(bmp.height * k)
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close?.()

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', JPEG_QUALITY))

  return {
    name: file.name,
    kind: 'image',
    media: 'image/jpeg',
    data: b64(await blob.arrayBuffer()),
    size: blob.size,
    hash,
    // The exact pixels sent to Claude - needed later for source highlighting.
    preview: URL.createObjectURL(blob),
  }
}

/* ------------------------------------------------------------- normalizing */

function normalizePrice(p) {
  if (p === null || p === undefined || p === '') return ''
  const n = parseFloat(String(p).replace(',', '.').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n.toFixed(2) : ''
}

let nextRowId = 0

function normalizeRow(raw, source) {
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

  // Conversation sent to the API, and tool_results waiting for the user's
  // next message. Every tool_use MUST get a tool_result in the next user
  // turn, so a pause parks them here rather than dropping them.
  let messages = []
  let pending = []
  let mode = 'extract'
  let settings = { apiKey: '', model: '', menuName: '', knownCategories: [] }

  const totalBytes = computed(() => files.value.reduce((s, f) => s + f.size, 0))
  const warningCount = computed(() => rows.value.filter((r) => r.warning).length)
  const canUndo = computed(() => undoStack.value.length > 0)
  const canChat = computed(() => rows.value.length > 0 && messages.length > 0)

  const log = (text, kind = 'info') => feed.value.push({ id: feed.value.length, text, kind })

  /* ---------------------------------------------------------------- undo */

  // Whole-list snapshots: rows are small, flat objects, and this is far
  // harder to get subtly wrong than per-field inverse operations.
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

    for (const file of Array.from(list || [])) {
      try {
        const prepared = await prepFile(file)

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

  function firstMessage(menuText) {
    const content = []

    if (files.value.length) {
      content.push({
        type: 'text',
        text: `Разчети тези ${files.value.length} файл(а). Подредени са по ред.`,
      })

      files.value.forEach((f, i) => {
        content.push({ type: 'text', text: `Файл ${i + 1}: ${f.name}` })
        content.push(
          f.kind === 'pdf'
            ? { type: 'document', source: { type: 'base64', media_type: f.media, data: f.data } }
            : { type: 'image', source: { type: 'base64', media_type: f.media, data: f.data } }
        )
      })

      // Cache everything up to here. The loop re-sends the files on every
      // turn, and so does every later chat edit; cached they cost a
      // fraction of the input price.
      content[content.length - 1].cache_control = { type: 'ephemeral' }
    }

    if (menuText?.trim()) {
      content.push({ type: 'text', text: `Текст на менюто:\n\n${menuText.trim()}` })
    }

    return { role: 'user', content }
  }

  /* -------------------------------------------------- extraction handlers */

  function handleAddRows(input) {
    const source = input.source || 'без източник'
    const fresh = (input.rows || []).map((r) => normalizeRow(r, source)).filter((r) => r.name)

    rows.value.push(...fresh)

    const warned = fresh.filter((r) => r.warning).length
    log(`${source}: ${fresh.length} ястия${warned ? ` (${warned} ⚠)` : ''}`)

    return {
      result: `Получих ${fresh.length} реда от ${source}. Общо: ${rows.value.length}. Продължи със следващата страница или извикай finish.`,
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
    return { result: 'Благодаря. Потребителят ще прегледа редовете.', done: true }
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

    // Reporting unknown ids back lets Claude correct itself instead of
    // silently believing the edit landed.
    return {
      result: `Променени ${changed} реда.${missing.length ? ` Непознати id: ${missing.join(', ')}` : ''}`,
    }
  }

  function handleDeleteRows({ ids = [], reason }) {
    pushUndo(reason || 'Изтриване от Claude')

    const before = rows.value.length
    const set = new Set(ids)
    rows.value = rows.value.filter((r) => !set.has(r.id))
    const removed = before - rows.value.length

    log(`✎ ${reason || 'Изтрити'}: ${removed} реда`, 'edit')
    return { result: `Изтрити ${removed} реда.` }
  }

  function handleInsertRows({ rows: incoming = [], after_id: afterId, source }) {
    pushUndo('Добавени редове от Claude')

    const fresh = incoming
      .map((r) => normalizeRow(r, source || 'добавено от Claude'))
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

    const fresh = incoming.map((r) => normalizeRow(r, source)).filter((r) => r.name)
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
          system: buildSystemPrompt(settings),
          tools: mode === 'extract' ? EXTRACT_TOOLS : EDIT_TOOLS,
          messages,
        })

        // Cut off mid tool call: that answer is unusable, so drop it and
        // ask for smaller batches instead of failing the whole run.
        if (data.stop_reason === 'max_tokens') {
          const last = messages[messages.length - 1]
          last.content = [].concat(last.content, [
            {
              type: 'text',
              text: 'Предишният ти отговор беше отрязан. Използвай извиквания с най-много 30 реда.',
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
        if (!uses.length) break // Claude is talking, not working - wait for the user

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
          break
        }

        messages.push({ role: 'user', content: results })
      }
    } catch (e) {
      error.value = e.message || String(e)
      // Keep the conversation valid: a trailing user turn with no answer
      // would make every later request fail.
      while (messages.length > 1 && messages[messages.length - 1].role === 'user') messages.pop()
    } finally {
      busy.value = false
    }
  }

  /* --------------------------------------------------------------- entry */

  async function start({ apiKey, model, menuName, knownCategories, menuText }) {
    settings = { apiKey, model, menuName, knownCategories }

    error.value = ''
    rows.value = []
    feed.value = []
    undoStack.value = []
    questions.value = null
    info.value = null
    pending = []
    mode = 'extract'
    messages = [firstMessage(menuText)]

    log(
      files.value.length
        ? `Изпращам ${files.value.length} файл(а)...`
        : 'Изпращам текста на менюто...'
    )

    await run()
  }

  function answerQuestions(answers) {
    const q = questions.value
    if (!q) return

    questions.value = null

    const payload = Object.fromEntries(
      q.list.map((x) => [x.id, String(answers[x.id] || '').trim() || 'не съм сигурен'])
    )

    messages.push({
      role: 'user',
      content: [
        ...pending.filter((p) => p.tool_use_id !== q.toolUseId),
        { type: 'tool_result', tool_use_id: q.toolUseId, content: JSON.stringify(payload) },
      ],
    })
    pending = []

    run()
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

    // Claude has the photos cached, but it cannot see the user's manual
    // grid edits - so the current table travels with every request.
    mode = 'edit'
    log(text.trim(), 'user')

    messages.push({
      role: 'user',
      content: [
        ...pending,
        {
          type: 'text',
          text: `${text.trim()}

Текущи редове (потребителят може да ги е редактирал на ръка; тази таблица е истината):
${rowsSnapshot()}

Направи промяната с update_rows / delete_rows / insert_rows (или replace_source за цяла страница). Не извиквай finish.`,
        },
      ],
    })
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
    totalBytes,
    warningCount,
    canUndo,
    canChat,
    addFiles,
    removeFile,
    releaseFiles,
    start,
    answerQuestions,
    sendChatEdit,
    undo,
    clearEditMarks,
  }
}