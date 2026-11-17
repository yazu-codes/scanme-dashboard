<template>
  <div class="wrap">
    <h2>Меню → CSV</h2>

    <label>Claude API ключ (пази се само в този браузър)</label>
    <input type="password" v-model="apiKey" @change="saveKey" placeholder="sk-ant-..." />

    <label>Име на заведението (става име на файла)</label>
    <input type="text" v-model="venue" placeholder="напр. shery13" />

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
      <small>JPG, PNG, GIF, WEBP или PDF</small>
    </div>
    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
      multiple
      hidden
      @change="onPick"
    />

    <ul v-if="files.length" class="files">
      <li v-for="(f, i) in files" :key="f.id">
        <img v-if="f.preview" :src="f.preview" alt="" />
        <span v-else class="pdf-badge">PDF</span>
        <span class="fname">{{ f.name }}</span>
        <span class="fsize">{{ prettySize(f.size) }}</span>
        <button class="small" @click="removeFile(i)">✕</button>
      </li>
    </ul>

    <p v-if="sizeWarning" class="warn">{{ sizeWarning }}</p>

    <label>Менюто като текст (по избор, ако не прикачваш файлове)</label>
    <textarea v-model="menuText" rows="8" placeholder="Супи&#10;* Пилешка супа1.90€ ..."></textarea>

    <button :disabled="loading" @click="generate">
      {{ loading ? 'Генерирам...' : 'Генерирай CSV' }}
    </button>
    <p v-if="error" class="error">{{ error }}</p>

    <template v-if="rows.length">
      <h3>Преглед (можеш да редактираш)</h3>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>name</th><th>price</th><th>category</th><th>allergens</th>
              <th>description</th><th>picture_url</th><th>pos</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="i">
              <td><input v-model="r.name" /></td>
              <td class="narrow"><input v-model="r.price" /></td>
              <td><input v-model="r.category" /></td>
              <td><input v-model="r.allergens" /></td>
              <td><input v-model="r.description" /></td>
              <td><input v-model="r.picture_url" /></td>
              <td class="narrow">{{ positions[i] }}</td>
              <td><button class="small" @click="rows.splice(i, 1)">✕</button></td>
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
import { ref, computed, onBeforeUnmount } from 'vue'

const MODEL = 'claude-sonnet-5-5'
const HEADERS = ['name', 'price', 'category', 'allergens', 'description', 'picture_url', 'display_order_position']

// Media types the Messages API accepts as image blocks. HEIC from an iPhone
// is NOT one of them — it has to be converted to JPEG first.
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const PDF_TYPE = 'application/pdf'

// The whole request is capped at 128MB and base64 inflates bytes by ~33%,
// so warn well before the raw files get anywhere near that.
const SIZE_WARN_BYTES = 20 * 1024 * 1024

const SYSTEM_PROMPT = `Превръщаш обедно меню в JSON масив. Менюто може да е подадено като текст, като снимки или като PDF. Връщаш САМО валиден JSON масив, без обяснения и без markdown.
Всеки елемент е обект с ключове: "name", "price", "category", "allergens", "description".
Правила:
- Прочети всички прикачени страници/снимки и обходи ястията в реда, в който се появяват. Ако има няколко файла, спазвай реда на файловете.
- Запазвай реда на ястията, както са в текста.
- "category" е заглавието на секцията (напр. Супи, Основно, Десерти), записано с главна първа буква и малки останали (ДЕСЕРТИ -> Десерти).
- Игнорирай номерация и водещи символи като "1." или "*".
- Цената често е залепена за името (напр. "Таратор2.10€"). Раздели ги. "price" е само число с точка, без валутен знак (напр. "2.10").
- Ако едно ястие има няколко варианта с различни цени (напр. "Шкембе чорба 2.60€/2.30€ /телешко/свинско/"), направи отделен ред за всеки вариант, като името е "Шкембе чорба (телешко)" с 2.60 и "Шкембе чорба (свинско)" с 2.30, в същия ред на цените и вариантите.
- Ако под ястие има бележка като "/постно/", добави я в името в скоби: "Манастирски гювеч (постно)".
- "allergens" попълвай САМО ако са изрично посочени в текста за това ястие (запази ги, както са написани). Иначе е празен низ.
- "description" попълвай САМО ако е изрично посочено в текста. Иначе е празен низ.
- Ако нещо е нечетливо на снимката, пропусни го, вместо да гадаеш.
- Не измисляй нищо, което го няма в менюто.`

export default {
  setup() {
    const apiKey = ref(localStorage.getItem('claude_api_key') || '')
    const venue = ref('')
    const menuText = ref('')
    const files = ref([])
    const dragOver = ref(false)
    const rows = ref([])
    const loading = ref(false)
    const error = ref('')
    const copied = ref(false)

    const saveKey = () => localStorage.setItem('claude_api_key', apiKey.value.trim())

    /* ---------------------------------------------------------------- files */

    let nextId = 0

    const prettySize = (bytes) => {
      if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    }

    const totalBytes = computed(() => files.value.reduce((sum, f) => sum + f.size, 0))

    const sizeWarning = computed(() => {
      if (totalBytes.value <= SIZE_WARN_BYTES) return ''
      return `Прикачените файлове са ${prettySize(totalBytes.value)}. Голяма заявка може да се провали — пробвай по-малко или по-смалени файлове.`
    })

    const addFiles = (list) => {
      error.value = ''

      for (const file of list) {
        const isImage = IMAGE_TYPES.includes(file.type)
        const isPdf = file.type === PDF_TYPE

        if (!isImage && !isPdf) {
          error.value = `"${file.name}" не е поддържан формат. Използвай JPG, PNG, GIF, WEBP или PDF.`
          continue
        }

        files.value.push({
          id: nextId++,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          kind: isPdf ? 'pdf' : 'image',
          // Object URL, not a data URL — no need to hold the whole file in a string
          preview: isImage ? URL.createObjectURL(file) : '',
        })
      }
    }

    const onPick = (e) => {
      addFiles(e.target.files || [])
      e.target.value = '' // so picking the same file again still fires change
    }

    const onDrop = (e) => {
      dragOver.value = false
      addFiles(e.dataTransfer?.files || [])
    }

    const removeFile = (i) => {
      const [gone] = files.value.splice(i, 1)
      if (gone?.preview) URL.revokeObjectURL(gone.preview)
    }

    onBeforeUnmount(() => {
      files.value.forEach((f) => f.preview && URL.revokeObjectURL(f.preview))
    })

    // FileReader gives "data:<type>;base64,<data>" — the API wants only the tail
    const fileToBase64 = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
        reader.onerror = () => reject(new Error(`Не мога да прочета "${file.name}".`))
        reader.readAsDataURL(file)
      })

    /* ------------------------------------------------------------ positions */

    // display_order_position: брояч, който почва от 1 във всяка категория
    const positions = computed(() => {
      const counters = {}
      return rows.value.map((r) => {
        const c = (r.category || '').trim()
        counters[c] = (counters[c] || 0) + 1
        return counters[c]
      })
    })

    const normalizePrice = (p) => {
      const n = parseFloat(String(p ?? '').replace(',', '.').replace(/[^\d.]/g, ''))
      return Number.isFinite(n) ? n.toFixed(2) : String(p ?? '')
    }

    /* ------------------------------------------------------------- generate */

    const generate = async () => {
      error.value = ''
      copied.value = false
      if (!apiKey.value.trim()) return (error.value = 'Въведи Claude API ключ.')
      if (!menuText.value.trim() && !files.value.length) {
        return (error.value = 'Прикачи снимки/PDF или постави текст на менюто.')
      }
      saveKey()
      loading.value = true

      try {
        // Docs recommend putting documents and images BEFORE the text block.
        const content = []

        for (const entry of files.value) {
          const data = await fileToBase64(entry.file)

          content.push(
            entry.kind === 'pdf'
              ? {
                  type: 'document',
                  source: { type: 'base64', media_type: PDF_TYPE, data },
                }
              : {
                  type: 'image',
                  source: { type: 'base64', media_type: entry.type, data },
                }
          )
        }

        content.push({
          type: 'text',
          text: menuText.value.trim()
            ? menuText.value
            : 'Извлечи всички ястия от прикаченото меню.',
        })

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey.value.trim(),
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 8000,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content }],
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error?.message || `Грешка ${res.status}`)

        const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
        const start = text.indexOf('[')
        const end = text.lastIndexOf(']')
        if (start < 0 || end < 0) throw new Error('Не получих валиден отговор. Опитай пак.')
        const parsed = JSON.parse(text.slice(start, end + 1))

        rows.value = parsed.map((x) => ({
          name: x.name || '',
          price: normalizePrice(x.price),
          category: x.category || '',
          allergens: x.allergens || '',
          description: x.description || '',
          picture_url: '',
        }))

        if (data.stop_reason === 'max_tokens') {
          error.value = 'Отговорът беше отрязан — някои ястия може да липсват. Пробвай по-малко страници наведнъж.'
        }
      } catch (e) {
        error.value = e.message || String(e)
      } finally {
        loading.value = false
      }
    }

    /* ------------------------------------------------------------------ csv */

    const addRow = () =>
      rows.value.push({ name: '', price: '', category: rows.value.at(-1)?.category || '', allergens: '', description: '', picture_url: '' })

    const esc = (v) => {
      const s = String(v ?? '')
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }

    const buildCsv = () => {
      const lines = [HEADERS.join(',')]
      rows.value.forEach((r, i) => {
        lines.push(
          [r.name, r.price, r.category, r.allergens, r.description, r.picture_url, positions.value[i]].map(esc).join(',')
        )
      })
      return lines.join('\r\n') + '\r\n'
    }

    const download = () => {
      // BOM, за да се отваря кирилицата правилно в Excel
      const blob = new Blob(['\uFEFF' + buildCsv()], { type: 'text/csv;charset=utf-8' })
      const name = (venue.value.trim() || 'menu').replace(/[\\/:*?"<>|]/g, '_')
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
      apiKey, venue, menuText, files, dragOver, rows, loading, error, copied, positions,
      sizeWarning, saveKey, generate, addRow, download, copy,
      onPick, onDrop, removeFile, prettySize,
    }
  },
}
</script>

<style scoped>
.wrap { max-width: 960px; margin: 0 auto; padding: 16px; font-family: system-ui, sans-serif; }
label { display: block; margin: 14px 0 4px; font-weight: 600; }
input, textarea { width: 100%; box-sizing: border-box; padding: 8px; font: inherit; border: 1px solid #bbb; border-radius: 6px; }
button { margin-top: 12px; padding: 10px 18px; font: inherit; border: 0; border-radius: 6px; background: #2b6cb0; color: #fff; cursor: pointer; }
button:disabled { opacity: 0.6; cursor: default; }
button.small { padding: 4px 10px; margin-top: 6px; }
.actions button { margin-right: 8px; }
.error { color: #c53030; }
.warn { color: #975a16; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; min-width: 760px; }
th, td { padding: 2px; text-align: left; }
td.narrow { width: 70px; }
td input { padding: 4px; }

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
</style>
