<script setup>
import {
  computed,
  onMounted,
  ref,
  watch,
} from 'vue'

import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'

import { downloadCsv } from '@/utils/csvUtils'

const props = defineProps({
  /*
   * Base URL of the analytics service, without a
   * trailing slash. Set VITE_ANALYTICS_BASE to point
   * this at a local server; the literal is the fallback
   * so a missing variable can't produce
   * "undefined/events/".
   */
  apiBase: {
    type: String,
    default:
      import.meta.env.VITE_ANALYTICS_BASE ||
      'https://scanme-analytics-production.up.railway.app',
  },

  /*
   * Bearer token for the admin-only GET /events route.
   * Optional: when absent, resolveToken() below falls
   * back to browser storage.
   */
  token: {
    type: String,
    default: null,
  },

  /*
   * Storage key the dashboard keeps its JWT under. Only
   * needed if the automatic lookup guesses wrong.
   */
  tokenKey: {
    type: String,
    default: null,
  },

  /*
   * Optional: show only this client's events. Leave
   * null to show everything the token can see.
   */
  clientId: {
    type: String,
    default: null,
  },

  /*
   * How many days to load on first render. The server
   * caps this at 180.
   */
  initialDays: {
    type: Number,
    default: 7,
  },
})

const MAX_DAYS = 180

const DAY_PRESETS = [
  1,
  7,
  30,
  90,
  180,
]

/*
|--------------------------------------------------------------------------
| Remote state
|--------------------------------------------------------------------------
*/

const events =
  ref([])

const loading =
  ref(false)

const errorMessage =
  ref(null)

const days =
  ref(props.initialDays)

const lastLoadedAt =
  ref(null)

/*
|--------------------------------------------------------------------------
| Filters
|--------------------------------------------------------------------------
|
| Tracked as the set of HIDDEN event names, so anything
| that appears later - a new event type shipped after
| this view was written - shows up by default.
|
*/

const search =
  ref('')

const hiddenNames =
  ref(
    new Set()
  )

/*
|--------------------------------------------------------------------------
| Normalising a row
|--------------------------------------------------------------------------
|
| CreatedAt is an int64 epoch and, at the time of
| writing, carries no json tag - so it arrives as
| `CreatedAt`, not `created_at`. Accept both, and accept
| milliseconds in case the column is ever widened.
|
*/

function toDate(
  value
) {
  const n = Number(value)

  if (!n) {
    return null
  }

  return new Date(
    n > 1e12
      ? n
      : n * 1000
  )
}

function normaliseRow(
  row
) {
  return {
    id:
      row.id,

    clientId:
      row.client_id ?? '',

    name:
      row.name ?? '',

    item:
      row.corresponding_item_name ?? '',

    createdAt:
      toDate(
        row.created_at ??
        row.CreatedAt
      ),
  }
}

/*
|--------------------------------------------------------------------------
| Token
|--------------------------------------------------------------------------
|
| Read at request time rather than captured at setup, so
| a token that lands after this component mounts - a
| refresh, a late login - is still picked up.
|
| The prop wins when given. Otherwise the usual storage
| keys are tried, because the dashboard owns that value
| and this component shouldn't care where it lives.
|
*/

const TOKEN_KEYS = [
  'scanme_dashboard_token',
  'token',
  'jwt',
  'authToken',
  'auth_token',
  'accessToken',
  'access_token',
  'user',
  'auth',
]

function looksLikeJwt(
  value
) {
  return (
    typeof value === 'string' &&
    value.split('.').length === 3
  )
}

/*
 * Values get stored in all sorts of shapes: a bare
 * string, a JSON string, an object holding the token
 * under one of several names. Dig the JWT out of any
 * of them.
 */
function extractToken(
  raw
) {
  if (!raw) {
    return null
  }

  let value = raw

  if (typeof value === 'string') {
    const trimmed = value.trim()

    if (
      trimmed.startsWith('{') ||
      trimmed.startsWith('"')
    ) {
      try {
        value = JSON.parse(trimmed)
      } catch {
        value = trimmed
      }
    } else {
      value = trimmed
    }
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    for (
      const key
      of [
        'token',
        'jwt',
        'accessToken',
        'access_token',
        'id_token',
      ]
    ) {
      const found =
        extractToken(value[key])

      if (found) {
        return found
      }
    }

    return null
  }

  if (typeof value !== 'string') {
    return null
  }

  /*
   * Tolerate a stored value that already carries the
   * scheme, which would otherwise become
   * "Bearer Bearer eyJ...".
   */
  const cleaned =
    value
      .replace(/^Bearer\s+/i, '')
      .trim()

  return looksLikeJwt(cleaned)
    ? cleaned
    : null
}

function resolveToken() {
  const fromProp =
    extractToken(props.token)

  if (fromProp) {
    return fromProp
  }

  if (typeof window === 'undefined') {
    return null
  }

  const keys = props.tokenKey
    ? [
        props.tokenKey,
        ...TOKEN_KEYS,
      ]
    : TOKEN_KEYS

  for (
    const store
    of [
      window.localStorage,
      window.sessionStorage,
    ]
  ) {
    if (!store) {
      continue
    }

    for (const key of keys) {
      const found =
        extractToken(
          store.getItem(key)
        )

      if (found) {
        return found
      }
    }
  }

  return null
}

/*
|--------------------------------------------------------------------------
| Loading
|--------------------------------------------------------------------------
*/

async function loadEvents() {
  if (loading.value) {
    return
  }

  loading.value = true

  errorMessage.value = null

  try {
    const safeDays =
      Math.min(
        Math.max(
          Number(days.value) || 1,
          1
        ),
        MAX_DAYS
      )

    const url =
      `${props.apiBase}/events/?days=${safeDays}`

    const token = resolveToken()

    if (!token) {
      throw new Error(
        'No admin token found. Pass :token to this component, or set token-key to the storage key your dashboard uses.'
      )
    }

    const response =
      await fetch(url, {
        headers: {
          Authorization:
            `Bearer ${token}`,
        },
      })

    if (!response.ok) {
      const detail =
        await response
          .clone()
          .text()
          .catch(() => '')

      /*
       * A 401 here is nearly always an expired admin
       * token rather than a malformed request.
       */
      throw new Error(
        response.status === 401 ||
        response.status === 403
          ? `Not authorised (${response.status}). ${
              detail || 'Sign in again and retry.'
            }`
          : `Request failed (${response.status}).`
      )
    }

    const payload =
      await response.json()

    const rows =
      Array.isArray(payload)
        ? payload
        : payload.events || []

    events.value =
      rows.map(normaliseRow)

    lastLoadedAt.value =
      new Date()
  } catch (err) {
    errorMessage.value =
      err.message ||
      'Could not load events.'

    events.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadEvents)

watch(days, loadEvents)

/*
|--------------------------------------------------------------------------
| Derived views
|--------------------------------------------------------------------------
*/

const scopedEvents =
  computed(() =>
    props.clientId
      ? events.value.filter(
          event =>
            event.clientId ===
            props.clientId
        )
      : events.value
  )

/*
 * One tile per event name, so `view`, `qr_scan`,
 * `code_scan` and anything added later each get a count
 * without this component knowing their names.
 */
const nameSummary =
  computed(() => {
    const counts =
      new Map()

    for (
      const event
      of scopedEvents.value
    ) {
      counts.set(
        event.name,
        (counts.get(event.name) || 0) + 1
      )
    }

    return Array.from(
      counts.entries()
    )
      .map(
        ([name, count]) => ({
          name,
          count,
        })
      )
      .sort(
        (a, b) =>
          b.count - a.count
      )
  })

const filteredEvents =
  computed(() => {
    const term =
      search
        .value
        .trim()
        .toLowerCase()

    return scopedEvents
      .value
      .filter(event => {
        if (
          hiddenNames
            .value
            .has(event.name)
        ) {
          return false
        }

        if (!term) {
          return true
        }

        return (
          event.name
            .toLowerCase()
            .includes(term) ||
          event.item
            .toLowerCase()
            .includes(term)
        )
      })
  })

const uniqueItemCount =
  computed(
    () =>
      new Set(
        filteredEvents
          .value
          .map(
            event => event.item
          )
      ).size
  )

/*
|--------------------------------------------------------------------------
| Name filter toggles
|--------------------------------------------------------------------------
*/

function isNameHidden(
  name
) {
  return hiddenNames
    .value
    .has(name)
}

function toggleName(
  name
) {
  const next =
    new Set(
      hiddenNames.value
    )

  if (next.has(name)) {
    next.delete(name)
  } else {
    next.add(name)
  }

  hiddenNames.value = next
}

function clearFilters() {
  hiddenNames.value =
    new Set()

  search.value = ''
}

/*
|--------------------------------------------------------------------------
| Formatting
|--------------------------------------------------------------------------
*/

const dateFormatter =
  new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    }
  )

function formatDate(
  value
) {
  return value
    ? dateFormatter.format(value)
    : '—'
}

/*
|--------------------------------------------------------------------------
| CSV export
|--------------------------------------------------------------------------
*/

function escapeCell(
  value
) {
  const text =
    String(value ?? '')

  return /[",\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text
}

function exportCsv() {
  if (
    !filteredEvents.value.length
  ) {
    return
  }

  const header = [
    'id',
    'client_id',
    'name',
    'corresponding_item_name',
    'created_at',
  ].join(',')

  const body =
    filteredEvents
      .value
      .map(event =>
        [
          event.id,
          event.clientId,
          event.name,
          event.item,
          event.createdAt
            ? event.createdAt.toISOString()
            : '',
        ]
          .map(escapeCell)
          .join(',')
      )

  const date =
    new Date()
      .toISOString()
      .split('T')[0]

  downloadCsv(
    [
      header,
      ...body,
    ].join('\n'),
    `analytics_events_${days.value}d_${date}.csv`
  )
}
</script>

<template>
  <section class="dashboard-card">
    <!--
      Kept so the component still has a title when used
      on its own. CollapsibleCard's `flush` mode hides
      this and shows its own heading instead.
    -->
    <div class="card-heading">
      <div>
        <h2>
          Events
        </h2>

        <span>
          {{ filteredEvents.length }}
          event{{
            filteredEvents.length === 1
              ? ''
              : 's'
          }}

          <template v-if="uniqueItemCount">
            across
            {{ uniqueItemCount }}
            item{{
              uniqueItemCount === 1
                ? ''
                : 's'
            }}
          </template>
        </span>
      </div>
    </div>

    <div class="events-actions">
      <Button
        v-for="preset in DAY_PRESETS"
        :key="preset"
        :label="
          preset === 1
            ? '24h'
            : `${preset}d`
        "
        size="small"
        :severity="
          days === preset
            ? 'primary'
            : 'secondary'
        "
        :outlined="days !== preset"
        :disabled="loading"
        @click="days = preset"
      />

      <span class="events-actions-gap" />

      <InputText
        v-model="search"
        placeholder="Filter by name or item"
        size="small"
        class="events-search"
      />

      <Button
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        size="small"
        aria-label="Reload events"
        :loading="loading"
        @click="loadEvents"
      />

      <Button
        label="Export CSV"
        icon="pi pi-download"
        severity="secondary"
        outlined
        size="small"
        :disabled="!filteredEvents.length"
        @click="exportCsv"
      />
    </div>

    <Message
      v-if="errorMessage"
      severity="error"
      closable
      @close="
        errorMessage = null
      "
    >
      {{ errorMessage }}
    </Message>

    <!--
      Tiles double as filters: clicking one hides that
      event name from the table below.
    -->
    <div
      v-if="nameSummary.length"
      class="events-summary"
    >
      <button
        v-for="entry in nameSummary"
        :key="entry.name"
        type="button"
        class="events-summary-tile"
        :class="{
          'is-muted':
            isNameHidden(entry.name),
        }"
        :aria-pressed="
          !isNameHidden(entry.name)
        "
        @click="
          toggleName(entry.name)
        "
      >
        <strong>
          {{ entry.count }}
        </strong>

        <span>
          {{ entry.name }}
        </span>
      </button>

      <Button
        v-if="hiddenNames.size || search"
        label="Clear filters"
        icon="pi pi-filter-slash"
        severity="secondary"
        text
        size="small"
        @click="clearFilters"
      />
    </div>

    <div
      v-if="!loading && !filteredEvents.length"
      class="empty-panel"
    >
      <template v-if="events.length">
        No events match these filters.
      </template>

      <template v-else>
        No events recorded in this period.
      </template>
    </div>

    <DataTable
      v-else
      :value="filteredEvents"
      :loading="loading"
      data-key="id"
      sort-field="createdAt"
      :sort-order="-1"
      removable-sort
      paginator
      :rows="25"
      :rows-per-page-options="[
        25,
        50,
        100,
      ]"
      size="small"
      striped-rows
      class="events-table"
    >
      <Column
        field="createdAt"
        header="When"
        sortable
        style="width: 12rem"
      >
        <template #body="{ data }">
          {{ formatDate(data.createdAt) }}
        </template>
      </Column>

      <Column
        field="name"
        header="Event"
        sortable
        style="width: 10rem"
      />

      <Column
        field="item"
        header="Item"
        sortable
      >
        <template #body="{ data }">
          <span class="events-item">
            {{ data.item || '—' }}
          </span>
        </template>
      </Column>

      <Column
        v-if="!clientId"
        field="clientId"
        header="Client"
        sortable
        style="width: 9rem"
      >
        <template #body="{ data }">
          <code class="events-client">
            {{ data.clientId.slice(0, 8) }}
          </code>
        </template>
      </Column>
    </DataTable>

    <small
      v-if="lastLoadedAt"
      class="events-timestamp"
    >
      Last loaded
      {{ formatDate(lastLoadedAt) }}
    </small>
  </section>
</template>

<style scoped>
.events-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.events-actions-gap {
  flex: 1 1 1rem;
}

.events-search {
  flex: 0 1 16rem;
  min-width: 0;
}

/*
|--------------------------------------------------------------------------
| Summary tiles
|--------------------------------------------------------------------------
|
| Real buttons rather than divs with click handlers, so
| they are keyboard reachable and announce their pressed
| state without extra wiring.
|
*/

.events-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.events-summary-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  padding: 0.4rem 0.7rem;
  border: 1px solid
    var(--p-content-border-color, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  font: inherit;
  color: inherit;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.events-summary-tile strong {
  font-size: 1.15rem;
  line-height: 1.1;
}

.events-summary-tile span {
  font-size: 0.75rem;
  opacity: 0.7;
  overflow-wrap: anywhere;
}

.events-summary-tile.is-muted {
  opacity: 0.4;
  text-decoration: line-through;
}

.events-summary-tile:focus-visible {
  outline: 2px solid
    var(--p-primary-color, #3b82f6);
  outline-offset: 2px;
}

/*
|--------------------------------------------------------------------------
| Table
|--------------------------------------------------------------------------
|
| Same shrink rules as the menu item rows: without
| min-width 0 a long path holds its intrinsic width and
| pushes the table past the card.
|
*/

.events-table {
  min-width: 0;
  max-width: 100%;
}

.events-item {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.events-client {
  font-size: 0.8rem;
  opacity: 0.7;
}

.events-timestamp {
  display: block;
  margin-top: 0.5rem;
  opacity: 0.6;
}

@media (max-width: 640px) {
  .events-actions {
    gap: 0.35rem;
  }

  .events-actions-gap {
    display: none;
  }

  .events-search {
    flex: 1 1 100%;
  }

  .events-summary-tile {
    padding: 0.35rem 0.55rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .events-summary-tile {
    transition: none;
  }
}
</style>