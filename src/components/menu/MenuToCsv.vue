<template>
  <div class="wrap">
    <h2>Меню → CSV</h2>

    <label>Claude API ключ (пази се само в този браузър)</label>
    <input type="password" v-model="apiKey" @change="saveKey" placeholder="sk-ant-..." />

    <label>Име на заведението (става име на файла)</label>
    <input type="text" v-model="venue" placeholder="напр. shery13" />

    <label>Менюто (пействаш го тук)</label>
    <textarea v-model="menuText" rows="12" placeholder="Супи&#10;* Пилешка супа1.90€ ..."></textarea>

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
import { ref, computed } from 'vue'

const MODEL = 'claude-sonnet-5-5'
const HEADERS = ['name', 'price', 'category', 'allergens', 'description', 'picture_url', 'display_order_position']

const SYSTEM_PROMPT = `Превръщаш текст на обедно меню в JSON масив. Връщаш САМО валиден JSON масив, без обяснения и без markdown.
Всеки елемент е обект с ключове: "name", "price", "category", "allergens", "description".
Правила:
- Запазвай реда на ястията, както са в текста.
- "category" е заглавието на секцията (напр. Супи, Основно, Десерти), записано с главна първа буква и малки останали (ДЕСЕРТИ -> Десерти).
- Игнорирай номерация и водещи символи като "1." или "*".
- Цената често е залепена за името (напр. "Таратор2.10€"). Раздели ги. "price" е само число с точка, без валутен знак (напр. "2.10").
- Ако едно ястие има няколко варианта с различни цени (напр. "Шкембе чорба 2.60€/2.30€ /телешко/свинско/"), направи отделен ред за всеки вариант, като името е "Шкембе чорба (телешко)" с 2.60 и "Шкембе чорба (свинско)" с 2.30, в същия ред на цените и вариантите.
- Ако под ястие има бележка като "/постно/", добави я в името в скоби: "Манастирски гювеч (постно)".
- "allergens" попълвай САМО ако са изрично посочени в текста за това ястие (запази ги, както са написани). Иначе е празен низ.
- "description" попълвай САМО ако е изрично посочено в текста. Иначе е празен низ.
- Не измисляй нищо, което го няма в текста.`

export default {
  setup() {
    const apiKey = ref(localStorage.getItem('claude_api_key') || '')
    const venue = ref('')
    const menuText = ref('')
    const rows = ref([])
    const loading = ref(false)
    const error = ref('')
    const copied = ref(false)

    const saveKey = () => localStorage.setItem('claude_api_key', apiKey.value.trim())

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

    const generate = async () => {
      error.value = ''
      copied.value = false
      if (!apiKey.value.trim()) return (error.value = 'Въведи Claude API ключ.')
      if (!menuText.value.trim()) return (error.value = 'Постави текст на менюто.')
      saveKey()
      loading.value = true
      try {
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
            max_tokens: 4000,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: menuText.value }],
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
      } catch (e) {
        error.value = e.message || String(e)
      } finally {
        loading.value = false
      }
    }

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

    return { apiKey, venue, menuText, rows, loading, error, copied, positions, saveKey, generate, addRow, download, copy }
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
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; min-width: 760px; }
th, td { padding: 2px; text-align: left; }
td.narrow { width: 70px; }
td input { padding: 4px; }
</style>
