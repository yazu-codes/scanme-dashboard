<script setup>
import {
  computed,
  nextTick,
  onMounted,
  ref,
  watch,
} from 'vue'

import Button from 'primevue/button'
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

const PAGE_SIZE = 50

/*
 * Two events from the same visitor further apart than
 * this are treated as separate visits. Thirty minutes
 * is the common analytics convention.
 */
const SESSION_GAP_MS =
  30 * 60 * 1000

/*
 * How many steps of a visitor's path to preview on the
 * visitor card before collapsing the rest into "+N".
 */
const PATH_PREVIEW_STEPS = 4

const DAY_PRESETS = [
  {
    value: 1,
    label: '24h',
  },
  {
    value: 7,
    label: '7d',
  },
  {
    value: 30,
    label: '30d',
  },
  {
    value: 90,
    label: '90d',
  },
  {
    value: 180,
    label: '180d',
  },
]

const VIEW_MODES = [
  {
    value: 'events',
    label: 'Events',
    icon: 'pi pi-list',
  },
  {
    value: 'visitors',
    label: 'Visitors',
    icon: 'pi pi-users',
  },
]

const SORTS = [
  {
    value: 'newest',
    label: 'Newest',
    icon: 'pi pi-arrow-down',
  },
  {
    value: 'oldest',
    label: 'Oldest',
    icon: 'pi pi-arrow-up',
  },
  {
    value: 'name',
    label: 'Event',
    icon: 'pi pi-sort-alpha-down',
  },
  {
    value: 'item',
    label: 'Item',
    icon: 'pi pi-sort-alpha-down',
  },
]

const VISITOR_SORTS = [
  {
    value: 'recent',
    label: 'Recent',
    icon: 'pi pi-clock',
  },
  {
    value: 'active',
    label: 'Most events',
    icon: 'pi pi-sort-amount-down',
  },
  {
    value: 'longest',
    label: 'Longest',
    icon: 'pi pi-hourglass',
  },
]

/*
 * Matched by prefix rather than exact name, so related
 * events added later - code_scan_review,
 * code_scan_failed, a future qr_scan_download - fall
 * into the right bucket without this list being
 * updated.
 *
 * Page views are matched with a leading anchor because
 * `item_view` is a different thing entirely and must
 * not be counted among them.
 */
const QUICK_FILTERS = [
  {
    value: 'all',
    label: 'All',
    icon: 'pi pi-list',
    match: null,
  },
  {
    value: 'views',
    label: 'Page views',
    icon: 'pi pi-eye',
    match: name =>
      name === 'view' ||
      name.startsWith('view_'),
  },
  {
    value: 'items',
    label: 'Item clicks',
    icon: 'pi pi-shopping-bag',
    match: name =>
      name.startsWith('item_'),
  },
  {
    value: 'qr',
    label: 'QR scans',
    icon: 'pi pi-qrcode',
    match: name =>
      name.startsWith('qr'),
  },
  {
    value: 'code',
    label: 'Code scans',
    icon: 'pi pi-link',
    match: name =>
      name.startsWith('code'),
  },
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
| View state
|--------------------------------------------------------------------------
|
| Filters are tracked as the set of HIDDEN event names,
| so anything that appears later - a new event type
| shipped after this view was written - shows up by
| default.
|
*/

const rootEl =
  ref(null)

const search =
  ref('')

const quickFilter =
  ref('all')

const hiddenNames =
  ref(
    new Set()
  )

const sortBy =
  ref('newest')

const visibleCount =
  ref(PAGE_SIZE)

const showFilters =
  ref(false)

/*
 * 'events' is the flat list; 'visitors' groups the same
 * events by ip_hash. selectedHash opens one visitor's
 * trail inside the visitors view.
 */
const viewMode =
  ref('events')

const visitorSort =
  ref('recent')

const selectedHash =
  ref(null)

/*
|--------------------------------------------------------------------------
| Token
|--------------------------------------------------------------------------
|
| Read at request time rather than captured at setup, so
| a token that lands after this component mounts - a
| refresh, a late login - is still picked up.
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
| Normalising a row
|--------------------------------------------------------------------------
|
| CreatedAt is an int64 epoch and, at the time of
| writing, carries no json tag - so it arrives as
| `CreatedAt`, not `created_at`. Accept both, and accept
| milliseconds in case the column is ever widened.
|
| ip_hash gets the same treatment: `ip_hash` if the
| field is tagged, Go's default `IpHash` / `IPHash` if
| it isn't. Rows written before the column existed come
| through with an empty hash and are left out of
| visitor trails rather than lumped into one fake
| visitor.
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
  const rawCreated =
    row.created_at ??
    row.CreatedAt

  const rawHash =
    row.ip_hash ??
    row.IpHash ??
    row.IPHash ??
    ''

  return {
    id:
      row.id,

    clientId:
      row.client_id ?? '',

    name:
      row.name ?? '',

    item:
      row.corresponding_item_name ?? '',

    ipHash:
      String(rawHash).trim(),

    /*
     * Kept as sent, so the detail panel can show the
     * stored value rather than only a rendering of it.
     */
    epoch:
      rawCreated ?? null,

    createdAt:
      toDate(rawCreated),
  }
}

function timeOf(
  event
) {
  return event.createdAt
    ? event.createdAt.getTime()
    : 0
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
 * Any change to what's on screen scrolls back to the
 * first page, otherwise "show more" state carries over
 * into a completely different list.
 */
watch(
  [
    search,
    sortBy,
    hiddenNames,
    quickFilter,
    events,
    viewMode,
    visitorSort,
    selectedHash,
  ],
  () => {
    visibleCount.value = PAGE_SIZE
  }
)

/*
 * Leaving the visitors view closes any open trail, so
 * coming back starts at the visitor list.
 */
watch(viewMode, mode => {
  if (mode !== 'visitors') {
    selectedHash.value = null
  }
})

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
 * The quick filter narrows the pool first, so the chips
 * and their counts describe the bucket you're in rather
 * than everything that was loaded.
 */
const quickFiltered =
  computed(() => {
    const preset =
      QUICK_FILTERS.find(
        entry =>
          entry.value ===
          quickFilter.value
      )

    if (
      !preset ||
      !preset.match
    ) {
      return scopedEvents.value
    }

    return scopedEvents
      .value
      .filter(
        event =>
          preset.match(event.name)
      )
  })

/*
 * One chip per event name, so `view`, `qr_scan`,
 * `code_scan` and anything added later each get a count
 * without this component knowing their names.
 */
const nameSummary =
  computed(() => {
    const counts =
      new Map()

    for (
      const event
      of quickFiltered.value
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

/*
 * Search also matches the IP hash, so pasting a hash
 * from elsewhere finds that visitor directly.
 */
const filteredEvents =
  computed(() => {
    const term =
      search
        .value
        .trim()
        .toLowerCase()

    return quickFiltered
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
            .includes(term) ||
          event.ipHash
            .toLowerCase()
            .includes(term)
        )
      })
  })

const sortedEvents =
  computed(() => {
    const rows = [
      ...filteredEvents.value,
    ]

    switch (sortBy.value) {
      case 'oldest':
        return rows.sort(
          (a, b) =>
            timeOf(a) - timeOf(b)
        )

      case 'name':
        return rows.sort(
          (a, b) =>
            a.name.localeCompare(b.name) ||
            timeOf(b) - timeOf(a)
        )

      case 'item':
        return rows.sort(
          (a, b) =>
            a.item.localeCompare(b.item) ||
            timeOf(b) - timeOf(a)
        )

      default:
        return rows.sort(
          (a, b) =>
            timeOf(b) - timeOf(a)
        )
    }
  })

const visibleEvents =
  computed(() =>
    sortedEvents
      .value
      .slice(
        0,
        visibleCount.value
      )
  )

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

const activeFilterCount =
  computed(() =>
    hiddenNames.value.size +
    (search.value.trim() ? 1 : 0) +
    (quickFilter.value !== 'all' ? 1 : 0)
  )

const isFiltering =
  computed(() =>
    activeFilterCount.value > 0
  )

/*
|--------------------------------------------------------------------------
| Visitor trails
|--------------------------------------------------------------------------
|
| Filters decide WHICH visitors are listed - anyone with
| at least one matching event - but a visitor's trail
| always holds everything they did in the loaded range.
| "Visitors who scanned a QR code" is only useful if you
| can then see what those visitors did before and after.
|
*/

/*
 * Every hashed event in scope, grouped by visitor and
 * ordered oldest first, which is the order a trail is
 * read in.
 */
const eventsByHash =
  computed(() => {
    const groups =
      new Map()

    for (
      const event
      of scopedEvents.value
    ) {
      if (!event.ipHash) {
        continue
      }

      const list =
        groups.get(event.ipHash)

      if (list) {
        list.push(event)
      } else {
        groups.set(
          event.ipHash,
          [event]
        )
      }
    }

    for (const list of groups.values()) {
      list.sort(
        (a, b) =>
          timeOf(a) - timeOf(b)
      )
    }

    return groups
  })

const matchedIds =
  computed(
    () =>
      new Set(
        filteredEvents
          .value
          .map(
            event => event.id
          )
      )
  )

/*
 * Events that pass the filters but carry no hash, so
 * the visitors view can say how much it isn't showing.
 */
const unattributedCount =
  computed(
    () =>
      filteredEvents
        .value
        .filter(
          event => !event.ipHash
        )
        .length
  )

/*
 * Consecutive repeats are folded together, so a visitor
 * who viewed five items in a row reads as
 * "item_view ×5" rather than five separate steps.
 */
function collapsePath(
  trail
) {
  const runs = []

  for (const event of trail) {
    const previous =
      runs[runs.length - 1]

    if (
      previous &&
      previous.name === event.name
    ) {
      previous.count += 1
    } else {
      runs.push({
        name: event.name,
        count: 1,
      })
    }
  }

  return runs
}

function summariseTrail(
  hash,
  trail,
  matches
) {
  const first =
    trail.length
      ? trail[0].createdAt
      : null

  const last =
    trail.length
      ? trail[trail.length - 1].createdAt
      : null

  let sessions =
    trail.length ? 1 : 0

  for (
    let i = 1;
    i < trail.length;
    i += 1
  ) {
    if (
      timeOf(trail[i]) -
        timeOf(trail[i - 1]) >
      SESSION_GAP_MS
    ) {
      sessions += 1
    }
  }

  return {
    hash,

    events:
      trail,

    count:
      trail.length,

    matches,

    first,

    last,

    span:
      first && last
        ? last.getTime() - first.getTime()
        : 0,

    sessions,

    items:
      new Set(
        trail
          .map(
            event => event.item
          )
          .filter(Boolean)
      ).size,

    path:
      collapsePath(trail),
  }
}

const visitorGroups =
  computed(() => {
    const matchCounts =
      new Map()

    for (
      const event
      of filteredEvents.value
    ) {
      if (!event.ipHash) {
        continue
      }

      matchCounts.set(
        event.ipHash,
        (matchCounts.get(event.ipHash) || 0) + 1
      )
    }

    return Array.from(
      matchCounts.entries()
    ).map(
      ([hash, matches]) =>
        summariseTrail(
          hash,
          eventsByHash.value.get(hash) || [],
          matches
        )
    )
  })

const sortedVisitors =
  computed(() => {
    const groups = [
      ...visitorGroups.value,
    ]

    const lastTime =
      group =>
        group.last
          ? group.last.getTime()
          : 0

    switch (visitorSort.value) {
      case 'active':
        return groups.sort(
          (a, b) =>
            b.count - a.count ||
            lastTime(b) - lastTime(a)
        )

      case 'longest':
        return groups.sort(
          (a, b) =>
            b.span - a.span ||
            lastTime(b) - lastTime(a)
        )

      default:
        return groups.sort(
          (a, b) =>
            lastTime(b) - lastTime(a)
        )
    }
  })

const visibleVisitors =
  computed(() =>
    sortedVisitors
      .value
      .slice(
        0,
        visibleCount.value
      )
  )

/*
 * The open trail is read from the unfiltered pool, so
 * it stays whole even while filters are narrowing the
 * visitor list behind it.
 */
const selectedTrail =
  computed(() => {
    if (
      viewMode.value !== 'visitors' ||
      !selectedHash.value
    ) {
      return null
    }

    const trail =
      eventsByHash
        .value
        .get(selectedHash.value) || []

    const matches =
      trail.filter(
        event =>
          matchedIds.value.has(event.id)
      ).length

    return summariseTrail(
      selectedHash.value,
      trail,
      matches
    )
  })

/*
 * Each step carries the time since the one before it,
 * and a label where a new session begins, so pauses in
 * the trail are visible without reading timestamps.
 */
const trailSteps =
  computed(() => {
    const trail =
      selectedTrail.value
        ? selectedTrail.value.events
        : []

    const multiSession =
      selectedTrail.value &&
      selectedTrail.value.sessions > 1

    let session = 1

    return trail.map(
      (event, index) => {
        const previous =
          trail[index - 1]

        const gap =
          previous &&
          previous.createdAt &&
          event.createdAt
            ? timeOf(event) - timeOf(previous)
            : null

        const breaksSession =
          gap !== null &&
          gap > SESSION_GAP_MS

        if (breaksSession) {
          session += 1
        }

        let sessionLabel = null

        if (
          index === 0 &&
          multiSession
        ) {
          sessionLabel =
            'Session 1'
        } else if (breaksSession) {
          sessionLabel =
            `Session ${session}, ${formatDuration(gap)} later`
        }

        return {
          event,
          gap,
          breaksSession,
          sessionLabel,
          matched:
            matchedIds.value.has(event.id),
        }
      }
    )
  })

const visibleSteps =
  computed(() =>
    trailSteps
      .value
      .slice(
        0,
        visibleCount.value
      )
  )

async function openTrail(
  hash
) {
  if (!hash) {
    return
  }

  viewMode.value = 'visitors'

  selectedHash.value = hash

  /*
   * Opened from deep in a long list, the trail would
   * otherwise render above the fold with nothing
   * apparently happening.
   */
  await nextTick()

  if (rootEl.value) {
    rootEl.value.scrollIntoView({
      block: 'start',
    })
  }
}

function closeTrail() {
  selectedHash.value = null
}

function shortHash(
  hash
) {
  return hash && hash.length > 10
    ? hash.slice(0, 8)
    : hash || ''
}

function plural(
  count,
  word
) {
  return `${word}${count === 1 ? '' : 's'}`
}

function visitorMeta(
  group
) {
  const parts = [
    `${group.count} ${plural(group.count, 'event')}`,
  ]

  if (group.sessions > 1) {
    parts.push(
      `${group.sessions} sessions`
    )
  }

  if (group.count > 1) {
    parts.push(
      `over ${formatDuration(group.span)}`
    )
  }

  if (group.items) {
    parts.push(
      `${group.items} ${plural(group.items, 'item')}`
    )
  }

  if (
    isFiltering.value &&
    group.matches < group.count
  ) {
    parts.push(
      `${group.matches} matching`
    )
  }

  return parts.join(' · ')
}

/*
|--------------------------------------------------------------------------
| What's on screen
|--------------------------------------------------------------------------
*/

const showSkeleton =
  computed(() =>
    loading.value &&
    !events.value.length
  )

const activeRowCount =
  computed(() => {
    if (selectedTrail.value) {
      return trailSteps.value.length
    }

    if (viewMode.value === 'visitors') {
      return sortedVisitors.value.length
    }

    return sortedEvents.value.length
  })

const hasMore =
  computed(() =>
    activeRowCount.value >
    visibleCount.value
  )

const nextPageSize =
  computed(() =>
    Math.min(
      PAGE_SIZE,
      activeRowCount.value -
        visibleCount.value
    )
  )

const headline =
  computed(() => {
    if (selectedTrail.value) {
      const {
        count,
        sessions,
      } = selectedTrail.value

      return {
        count,
        noun:
          plural(count, 'event'),
        detail:
          `${sessions} ${plural(sessions, 'session')}`,
      }
    }

    if (viewMode.value === 'visitors') {
      const count =
        sortedVisitors.value.length

      const inGroups =
        sortedVisitors
          .value
          .reduce(
            (sum, group) =>
              sum + group.count,
            0
          )

      return {
        count,
        noun:
          plural(count, 'visitor'),
        detail:
          inGroups
            ? `${inGroups} ${plural(inGroups, 'event')}`
            : '',
      }
    }

    const count =
      sortedEvents.value.length

    const items =
      uniqueItemCount.value

    return {
      count,
      noun:
        plural(count, 'event'),
      detail:
        items
          ? `${items} ${plural(items, 'item')}`
          : '',
    }
  })

const emptyMessage =
  computed(() => {
    if (!events.value.length) {
      return 'No events recorded in this period.'
    }

    if (
      viewMode.value === 'visitors' &&
      filteredEvents.value.length
    ) {
      return 'None of these events carry an IP hash, so there are no visitor trails to show.'
    }

    return 'No events match these filters.'
  })

function showMore() {
  visibleCount.value +=
    PAGE_SIZE
}

/*
|--------------------------------------------------------------------------
| Row detail
|--------------------------------------------------------------------------
|
| Tracked as the set of OPEN ids, so a row that appears
| later - a refresh, a changed filter - starts closed.
|
*/

const expanded =
  ref(
    new Set()
  )

function isExpanded(
  id
) {
  return expanded
    .value
    .has(id)
}

function toggleExpanded(
  id
) {
  const next =
    new Set(
      expanded.value
    )

  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }

  expanded.value = next
}

function expandAll() {
  expanded.value =
    new Set(
      visibleEvents
        .value
        .map(
          event => event.id
        )
    )
}

function collapseAll() {
  expanded.value =
    new Set()
}

const anyExpanded =
  computed(() =>
    visibleEvents
      .value
      .some(
        event =>
          isExpanded(event.id)
      )
  )

/*
 * Clipboard is unavailable on insecure origins, so the
 * result is reported rather than assumed.
 */
const copiedId =
  ref(null)

async function copyText(
  text,
  key
) {
  try {
    await navigator
      .clipboard
      .writeText(text)

    copiedId.value = key

    setTimeout(
      () => {
        if (
          copiedId.value === key
        ) {
          copiedId.value = null
        }
      },
      1600
    )
  } catch {
    errorMessage.value =
      'Clipboard unavailable. Copy needs an https origin.'
  }
}

function copyRow(
  event
) {
  copyText(
    JSON.stringify(
      {
        id: event.id,
        client_id: event.clientId,
        name: event.name,
        corresponding_item_name: event.item,
        ip_hash: event.ipHash || null,
        created_at: event.epoch,
        created_at_iso:
          event.createdAt
            ? event.createdAt.toISOString()
            : null,
      },
      null,
      2
    ),
    event.id
  )
}

function hashCopyKey(
  hash
) {
  return `hash:${hash}`
}

function copyHash(
  hash
) {
  copyText(
    hash,
    hashCopyKey(hash)
  )
}

/*
|--------------------------------------------------------------------------
| Statistics
|--------------------------------------------------------------------------
*/

const stats =
  computed(() => {
    const rows =
      filteredEvents.value

    const times =
      rows
        .map(
          event =>
            event.createdAt
              ? event.createdAt.getTime()
              : null
        )
        .filter(Boolean)

    return {
      total:
        rows.length,

      items:
        new Set(
          rows.map(
            event => event.item
          )
        ).size,

      clients:
        new Set(
          rows.map(
            event => event.clientId
          )
        ).size,

      visitors:
        new Set(
          rows
            .map(
              event => event.ipHash
            )
            .filter(Boolean)
        ).size,

      types:
        new Set(
          rows.map(
            event => event.name
          )
        ).size,

      first:
        times.length
          ? new Date(
              Math.min(...times)
            )
          : null,

      last:
        times.length
          ? new Date(
              Math.max(...times)
            )
          : null,
    }
  })

/*
 * Rough per-day rate over the selected window, which is
 * the number that says whether usage is holding up.
 */
const perDay =
  computed(() => {
    if (!stats.value.total) {
      return 0
    }

    return Math.round(
      (stats.value.total /
        Math.max(days.value, 1)) *
        10
    ) / 10
  })

/*
|--------------------------------------------------------------------------
| Filters
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

  quickFilter.value = 'all'

  search.value = ''
}

/*
|--------------------------------------------------------------------------
| Event colour
|--------------------------------------------------------------------------
|
| Derived from the name itself rather than a lookup
| table, so a new event type gets a stable colour
| without this component being taught about it. The
| same function colours visitors by their hash, so a
| visitor keeps one colour across the list and trail.
|
*/

function hueFor(
  name
) {
  let hash = 0

  for (
    let i = 0;
    i < name.length;
    i += 1
  ) {
    hash =
      (hash * 31 + name.charCodeAt(i)) %
      360
  }

  return hash
}

function badgeStyle(
  name
) {
  const hue = hueFor(name)

  return {
    '--badge-hue': hue,
  }
}

/*
|--------------------------------------------------------------------------
| Formatting
|--------------------------------------------------------------------------
*/

const relativeFormatter =
  new Intl.RelativeTimeFormat(
    undefined,
    {
      numeric: 'auto',
    }
  )

const dateFormatter =
  new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    }
  )

const shortDateFormatter =
  new Intl.DateTimeFormat(
    undefined,
    {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  )

/*
 * Relative while it's still useful, absolute once "6
 * days ago" stops meaning anything.
 */
function formatWhen(
  value
) {
  if (!value) {
    return '—'
  }

  const diffSeconds =
    (value.getTime() - Date.now()) /
    1000

  const absolute =
    Math.abs(diffSeconds)

  if (absolute < 60) {
    return 'just now'
  }

  if (absolute < 3600) {
    return relativeFormatter.format(
      Math.round(diffSeconds / 60),
      'minute'
    )
  }

  if (absolute < 86400) {
    return relativeFormatter.format(
      Math.round(diffSeconds / 3600),
      'hour'
    )
  }

  if (absolute < 86400 * 6) {
    return relativeFormatter.format(
      Math.round(diffSeconds / 86400),
      'day'
    )
  }

  return shortDateFormatter.format(value)
}

function formatExact(
  value
) {
  return value
    ? dateFormatter.format(value)
    : ''
}

/*
 * Compact durations for gaps and spans: "45s",
 * "2m 05s", "1h 12m", "3d 4h".
 */
function formatDuration(
  ms
) {
  if (
    ms === null ||
    ms === undefined ||
    ms < 0
  ) {
    return '—'
  }

  const seconds =
    Math.round(ms / 1000)

  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes =
    Math.floor(seconds / 60)

  if (minutes < 60) {
    return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  }

  const hours =
    Math.floor(minutes / 60)

  if (hours < 24) {
    return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
  }

  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/*
|--------------------------------------------------------------------------
| CSV export
|--------------------------------------------------------------------------
|
| Exports whatever is on screen: the open trail, every
| listed visitor's full trail grouped by visitor, or
| the flat event list.
|
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

const exportRows =
  computed(() => {
    if (selectedTrail.value) {
      return selectedTrail.value.events
    }

    if (viewMode.value === 'visitors') {
      return sortedVisitors
        .value
        .flatMap(
          group => group.events
        )
    }

    return sortedEvents.value
  })

function exportCsv() {
  if (
    !exportRows.value.length
  ) {
    return
  }

  const header = [
    'id',
    'client_id',
    'ip_hash',
    'name',
    'corresponding_item_name',
    'created_at',
  ].join(',')

  const body =
    exportRows
      .value
      .map(event =>
        [
          event.id,
          event.clientId,
          event.ipHash,
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

  const scope =
    selectedTrail.value
      ? `_visitor_${shortHash(selectedTrail.value.hash)}`
      : viewMode.value === 'visitors'
        ? '_by_visitor'
        : ''

  downloadCsv(
    [
      header,
      ...body,
    ].join('\n'),
    `analytics_events_${days.value}d${scope}_${date}.csv`
  )
}
</script>

<template>
  <section
    ref="rootEl"
    class="events-app"
  >
    <!--
      Stays put while the list scrolls, so the range and
      search controls are always a thumb away.
    -->
    <header class="events-bar">
      <div class="events-bar-row">
        <div class="events-title">
          <strong>
            {{ headline.count }}
          </strong>

          <span>
            {{ headline.noun }}

            <template v-if="headline.detail">
              ·
              {{ headline.detail }}
            </template>
          </span>
        </div>

        <button
          type="button"
          class="icon-button"
          :class="{
            'is-busy': loading,
          }"
          aria-label="Reload events"
          :disabled="loading"
          @click="loadEvents"
        >
          <i
            class="pi pi-refresh"
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          class="icon-button"
          :class="{
            'is-active': showFilters,
          }"
          :aria-expanded="showFilters"
          aria-label="Filters and sorting"
          @click="showFilters = !showFilters"
        >
          <i
            class="pi pi-sliders-h"
            aria-hidden="true"
          />

          <span
            v-if="activeFilterCount"
            class="icon-button-dot"
          />
        </button>
      </div>

      <!--
        Flat list or grouped by visitor. Same events,
        same filters, two ways of reading them.
      -->
      <div
        class="segmented"
        role="group"
        aria-label="View"
      >
        <button
          v-for="mode in VIEW_MODES"
          :key="mode.value"
          type="button"
          class="segmented-option"
          :class="{
            'is-selected':
              viewMode === mode.value,
          }"
          :aria-pressed="
            viewMode === mode.value
          "
          @click="viewMode = mode.value"
        >
          <i
            :class="mode.icon"
            aria-hidden="true"
          />

          {{ mode.label }}
        </button>
      </div>

      <!--
        Horizontal scroll rather than wrapping: the row
        stays one line tall on a narrow screen instead of
        pushing the list down.
      -->
      <div
        class="segmented"
        role="group"
        aria-label="Time range"
      >
        <button
          v-for="preset in DAY_PRESETS"
          :key="preset.value"
          type="button"
          class="segmented-option"
          :class="{
            'is-selected':
              days === preset.value,
          }"
          :aria-pressed="
            days === preset.value
          "
          :disabled="loading"
          @click="days = preset.value"
        >
          {{ preset.label }}
        </button>
      </div>
      <!--
        Always visible, unlike the chips in the drawer:
        these are the three questions actually asked of
        this panel.
      -->
      <div
        class="segmented"
        role="group"
        aria-label="Event type"
      >
        <button
          v-for="preset in QUICK_FILTERS"
          :key="preset.value"
          type="button"
          class="segmented-option"
          :class="{
            'is-selected':
              quickFilter === preset.value,
          }"
          :aria-pressed="
            quickFilter === preset.value
          "
          @click="
            quickFilter = preset.value
          "
        >
          <i
            :class="preset.icon"
            aria-hidden="true"
          />

          {{ preset.label }}
        </button>
      </div>
    </header>

    <!--
      Every figure reflects the current filters, so the
      strip answers "what am I looking at" rather than
      "what was loaded". Hidden inside a trail, which
      carries its own figures.
    -->
    <dl
      v-if="!selectedTrail"
      class="stat-strip"
    >
      <div class="stat">
        <dt>Events</dt>
        <dd>{{ stats.total }}</dd>
      </div>

      <div class="stat">
        <dt>Per day</dt>
        <dd>{{ perDay }}</dd>
      </div>

      <div class="stat">
        <dt>Visitors</dt>
        <dd>{{ stats.visitors }}</dd>
      </div>

      <div class="stat">
        <dt>Types</dt>
        <dd>{{ stats.types }}</dd>
      </div>

      <div class="stat">
        <dt>Items</dt>
        <dd>{{ stats.items }}</dd>
      </div>

      <div
        v-if="!clientId"
        class="stat"
      >
        <dt>Clients</dt>
        <dd>{{ stats.clients }}</dd>
      </div>

      <div
        v-if="stats.first"
        class="stat is-wide"
      >
        <dt>First</dt>
        <dd :title="formatExact(stats.first)">
          {{ formatExact(stats.first) }}
        </dd>
      </div>

      <div
        v-if="stats.last"
        class="stat is-wide"
      >
        <dt>Last</dt>
        <dd :title="formatExact(stats.last)">
          {{ formatExact(stats.last) }}
        </dd>
      </div>
    </dl>

    <!-- Filter drawer -->
    <div
      v-show="showFilters"
      class="events-filters"
    >
      <div class="search-field">
        <i
          class="pi pi-search"
          aria-hidden="true"
        />

        <input
          v-model="search"
          type="search"
          inputmode="search"
          placeholder="Search events, items and IP hashes"
          aria-label="Search events, items and IP hashes"
        />

        <button
          v-if="search"
          type="button"
          class="search-clear"
          aria-label="Clear search"
          @click="search = ''"
        >
          <i
            class="pi pi-times"
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        v-if="viewMode === 'events'"
        class="segmented"
        role="group"
        aria-label="Sort order"
      >
        <button
          v-for="option in SORTS"
          :key="option.value"
          type="button"
          class="segmented-option"
          :class="{
            'is-selected':
              sortBy === option.value,
          }"
          :aria-pressed="
            sortBy === option.value
          "
          @click="sortBy = option.value"
        >
          <i
            :class="option.icon"
            aria-hidden="true"
          />

          {{ option.label }}
        </button>
      </div>

      <!-- A trail is always in time order, so no sort there -->
      <div
        v-else-if="!selectedTrail"
        class="segmented"
        role="group"
        aria-label="Sort visitors"
      >
        <button
          v-for="option in VISITOR_SORTS"
          :key="option.value"
          type="button"
          class="segmented-option"
          :class="{
            'is-selected':
              visitorSort === option.value,
          }"
          :aria-pressed="
            visitorSort === option.value
          "
          @click="visitorSort = option.value"
        >
          <i
            :class="option.icon"
            aria-hidden="true"
          />

          {{ option.label }}
        </button>
      </div>

      <p
        v-if="viewMode === 'visitors'"
        class="events-hint"
      >
        Filters choose which visitors are listed. Each
        trail still shows everything that visitor did.
      </p>

      <!--
        Chips double as filters: tapping one hides that
        event name from the list below.
      -->
      <div
        v-if="nameSummary.length"
        class="chip-row"
      >
        <button
          v-for="entry in nameSummary"
          :key="entry.name"
          type="button"
          class="chip"
          :class="{
            'is-muted':
              isNameHidden(entry.name),
          }"
          :style="
            badgeStyle(entry.name)
          "
          :aria-pressed="
            !isNameHidden(entry.name)
          "
          @click="
            toggleName(entry.name)
          "
        >
          <span class="chip-name">
            {{ entry.name }}
          </span>

          <span class="chip-count">
            {{ entry.count }}
          </span>
        </button>
      </div>

      <div class="events-filter-actions">
        <Button
          label="Clear filters"
          icon="pi pi-filter-slash"
          severity="secondary"
          text
          size="small"
          :disabled="!activeFilterCount"
          @click="clearFilters"
        />

        <Button
          label="Export CSV"
          icon="pi pi-download"
          severity="secondary"
          outlined
          size="small"
          :disabled="!exportRows.length"
          @click="exportCsv"
        />
      </div>
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

    <!-- Skeleton rows, so the panel doesn't jump -->
    <div
      v-if="showSkeleton"
      class="events-list"
    >
      <div
        v-for="n in 6"
        :key="n"
        class="event-row is-skeleton"
      >
        <span class="skeleton-badge" />

        <span class="skeleton-line" />
      </div>
    </div>

    <!--
      One visitor's trail, oldest first. Session breaks
      mark gaps longer than SESSION_GAP_MS.
    -->
    <section
      v-else-if="selectedTrail"
      class="trail"
      :style="badgeStyle(selectedTrail.hash)"
      aria-label="Visitor trail"
    >
      <div class="trail-head">
        <button
          type="button"
          class="icon-button"
          aria-label="Back to visitors"
          @click="closeTrail"
        >
          <i
            class="pi pi-arrow-left"
            aria-hidden="true"
          />
        </button>

        <div class="trail-id">
          <span class="trail-label">
            Visitor
          </span>

          <code class="trail-hash">
            {{ selectedTrail.hash }}
          </code>
        </div>

        <button
          type="button"
          class="icon-button"
          :aria-label="
            copiedId === hashCopyKey(selectedTrail.hash)
              ? 'IP hash copied'
              : 'Copy IP hash'
          "
          @click="copyHash(selectedTrail.hash)"
        >
          <i
            :class="
              copiedId === hashCopyKey(selectedTrail.hash)
                ? 'pi pi-check'
                : 'pi pi-copy'
            "
            aria-hidden="true"
          />
        </button>
      </div>

      <dl class="stat-strip">
        <div class="stat">
          <dt>Events</dt>
          <dd>{{ selectedTrail.count }}</dd>
        </div>

        <div class="stat">
          <dt>Sessions</dt>
          <dd>{{ selectedTrail.sessions }}</dd>
        </div>

        <div class="stat">
          <dt>Duration</dt>
          <dd>
            {{
              selectedTrail.count > 1
                ? formatDuration(selectedTrail.span)
                : '—'
            }}
          </dd>
        </div>

        <div class="stat">
          <dt>Items</dt>
          <dd>{{ selectedTrail.items }}</dd>
        </div>

        <div
          v-if="selectedTrail.first"
          class="stat is-wide"
        >
          <dt>First seen</dt>
          <dd>{{ formatExact(selectedTrail.first) }}</dd>
        </div>

        <div
          v-if="selectedTrail.last"
          class="stat is-wide"
        >
          <dt>Last seen</dt>
          <dd>{{ formatExact(selectedTrail.last) }}</dd>
        </div>
      </dl>

      <p
        v-if="!selectedTrail.count"
        class="events-hint"
      >
        No events from this visitor in the selected
        range. Widen the range or go back to the list.
      </p>

      <p
        v-else-if="isFiltering"
        class="events-hint"
      >
        {{ selectedTrail.matches }} of
        {{ selectedTrail.count }} steps match your
        filters. The rest are dimmed.
      </p>

      <ol
        v-if="selectedTrail.count"
        class="trail-steps"
      >
        <template
          v-for="step in visibleSteps"
          :key="step.event.id"
        >
          <li
            v-if="step.sessionLabel"
            class="trail-break"
          >
            {{ step.sessionLabel }}
          </li>

          <li
            class="trail-step"
            :class="{
              'is-match':
                isFiltering && step.matched,
              'is-dim':
                isFiltering && !step.matched,
            }"
          >
            <span
              class="trail-marker"
              :style="badgeStyle(step.event.name)"
              aria-hidden="true"
            />

            <div class="trail-body">
              <span
                class="event-badge"
                :style="badgeStyle(step.event.name)"
              >
                {{ step.event.name }}
              </span>

              <span
                class="event-item"
                :title="step.event.item"
              >
                {{ step.event.item || '—' }}
              </span>

              <span class="trail-meta">
                <time
                  class="event-time"
                  :datetime="
                    step.event.createdAt
                      ? step.event.createdAt.toISOString()
                      : undefined
                  "
                >
                  {{ formatExact(step.event.createdAt) || '—' }}
                </time>

                <small
                  v-if="
                    step.gap !== null &&
                    !step.breaksSession
                  "
                  class="trail-gap"
                >
                  +{{ formatDuration(step.gap) }}
                </small>
              </span>
            </div>
          </li>
        </template>
      </ol>
    </section>

    <div
      v-else-if="!activeRowCount"
      class="events-empty"
    >
      <i
        class="pi pi-chart-bar"
        aria-hidden="true"
      />

      <p>
        {{ emptyMessage }}
      </p>

      <Button
        v-if="activeFilterCount"
        label="Clear filters"
        severity="secondary"
        outlined
        size="small"
        @click="clearFilters"
      />
    </div>

    <!-- Visitors, one card per ip_hash -->
    <template v-else-if="viewMode === 'visitors'">
      <p
        v-if="unattributedCount"
        class="events-hint"
      >
        {{ unattributedCount }}
        {{ plural(unattributedCount, 'event') }}
        without an IP hash
        {{ unattributedCount === 1 ? 'is' : 'are' }}
        left out of visitor trails.
      </p>

      <ol class="visitor-list">
        <li
          v-for="group in visibleVisitors"
          :key="group.hash"
        >
          <button
            type="button"
            class="visitor-card"
            :style="badgeStyle(group.hash)"
            :aria-label="`Open trail for visitor ${shortHash(group.hash)}`"
            @click="openTrail(group.hash)"
          >
            <span class="visitor-head">
              <span
                class="visitor-swatch"
                aria-hidden="true"
              />

              <code
                class="visitor-hash"
                :title="group.hash"
              >
                {{ shortHash(group.hash) }}
              </code>

              <span
                class="visitor-when"
                :title="formatExact(group.last)"
              >
                {{ formatWhen(group.last) }}
              </span>

              <i
                class="pi pi-chevron-right event-chevron"
                aria-hidden="true"
              />
            </span>

            <span class="visitor-path">
              <template
                v-for="(run, index) in group.path.slice(0, PATH_PREVIEW_STEPS)"
                :key="index"
              >
                <i
                  v-if="index"
                  class="pi pi-angle-right visitor-path-sep"
                  aria-hidden="true"
                />

                <span
                  class="event-badge"
                  :style="badgeStyle(run.name)"
                >
                  {{ run.name }}<template v-if="run.count > 1">
                    ×{{ run.count }}</template>
                </span>
              </template>

              <span
                v-if="group.path.length > PATH_PREVIEW_STEPS"
                class="visitor-path-more"
              >
                +{{ group.path.length - PATH_PREVIEW_STEPS }}
              </span>
            </span>

            <span class="visitor-meta">
              {{ visitorMeta(group) }}
            </span>
          </button>
        </li>
      </ol>
    </template>

    <!-- Flat event list -->
    <template v-else>
      <div class="list-tools">
        <Button
          :label="
            anyExpanded
              ? 'Collapse all'
              : 'Expand all'
          "
          :icon="
            anyExpanded
              ? 'pi pi-angle-double-up'
              : 'pi pi-angle-double-down'
          "
          severity="secondary"
          text
          size="small"
          @click="
            anyExpanded
              ? collapseAll()
              : expandAll()
          "
        />

        <span class="list-tools-count">
          Showing
          {{ visibleEvents.length }}
          of
          {{ sortedEvents.length }}
        </span>
      </div>

      <ol class="events-list">
        <li
          v-for="event in visibleEvents"
          :key="event.id"
          class="event-row"
          :class="{
            'is-open':
              isExpanded(event.id),
          }"
        >
          <button
            type="button"
            class="event-head"
            :aria-expanded="
              isExpanded(event.id)
            "
            @click="
              toggleExpanded(event.id)
            "
          >
            <span
              class="event-badge"
              :style="
                badgeStyle(event.name)
              "
            >
              {{ event.name }}
            </span>

            <span
              class="event-item"
              :title="event.item"
            >
              {{ event.item || '—' }}
            </span>

            <span class="event-when">
              <time
                class="event-time"
                :datetime="
                  event.createdAt
                    ? event.createdAt.toISOString()
                    : undefined
                "
              >
                {{ formatExact(event.createdAt) || '—' }}
              </time>

              <small class="event-relative">
                {{ formatWhen(event.createdAt) }}
              </small>
            </span>

            <i
              class="pi pi-chevron-right event-chevron"
              aria-hidden="true"
            />
          </button>

          <!--
            Every stored column, in the shape the API sent
            it - nothing here is a rendering of something
            else.
          -->
          <dl
            v-show="isExpanded(event.id)"
            class="event-detail"
          >
            <div class="detail-pair">
              <dt>Event ID</dt>
              <dd>{{ event.id }}</dd>
            </div>

            <div class="detail-pair">
              <dt>Name</dt>
              <dd>{{ event.name || '—' }}</dd>
            </div>

            <div class="detail-pair">
              <dt>Item</dt>
              <dd>{{ event.item || '—' }}</dd>
            </div>

            <div class="detail-pair">
              <dt>Client ID</dt>
              <dd class="is-mono">
                {{ event.clientId || '—' }}
              </dd>
            </div>

            <div class="detail-pair">
              <dt>IP hash</dt>
              <dd class="is-mono">
                {{ event.ipHash || '—' }}
              </dd>
            </div>

            <div class="detail-pair">
              <dt>Timestamp</dt>
              <dd>
                {{ formatExact(event.createdAt) || '—' }}
              </dd>
            </div>

            <div class="detail-pair">
              <dt>ISO 8601</dt>
              <dd class="is-mono">
                {{
                  event.createdAt
                    ? event.createdAt.toISOString()
                    : '—'
                }}
              </dd>
            </div>

            <div class="detail-pair">
              <dt>Epoch</dt>
              <dd class="is-mono">
                {{ event.epoch ?? '—' }}
              </dd>
            </div>

            <div class="detail-actions">
              <Button
                :label="
                  copiedId === event.id
                    ? 'Copied'
                    : 'Copy JSON'
                "
                :icon="
                  copiedId === event.id
                    ? 'pi pi-check'
                    : 'pi pi-copy'
                "
                severity="secondary"
                text
                size="small"
                @click="copyRow(event)"
              />

              <Button
                label="Filter to this item"
                icon="pi pi-filter"
                severity="secondary"
                text
                size="small"
                :disabled="!event.item"
                @click="
                  search = event.item;
                  showFilters = true
                "
              />

              <Button
                label="Show visitor trail"
                icon="pi pi-user"
                severity="secondary"
                text
                size="small"
                :disabled="!event.ipHash"
                @click="openTrail(event.ipHash)"
              />
            </div>
          </dl>
        </li>
      </ol>
    </template>

    <div
      v-if="hasMore && !showSkeleton"
      class="events-more"
    >
      <Button
        :label="`Show ${nextPageSize} more`"
        icon="pi pi-chevron-down"
        severity="secondary"
        outlined
        class="events-more-button"
        @click="showMore"
      />
    </div>

    <p
      v-if="lastLoadedAt"
      class="events-timestamp"
    >
      Updated
      {{ formatWhen(lastLoadedAt) }}
    </p>
  </section>
</template>

<style scoped>
/*
|--------------------------------------------------------------------------
| Shell
|--------------------------------------------------------------------------
|
| Mobile first: everything below is the narrow layout,
| and the single media query at the bottom widens it.
|
*/

.events-app {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  /*
   * The strips inside scroll sideways on their own. This
   * stops any of them from widening the panel itself,
   * which is what pushed the dialog off screen.
   */
  overflow-x: hidden;
}

.events-app > * {
  min-width: 0;
  max-width: 100%;
}

.icon-button:focus-visible,
.segmented-option:focus-visible,
.chip:focus-visible,
.event-head:focus-visible,
.visitor-card:focus-visible {
  outline: 2px solid var(--p-primary-color, #3b82f6);
  outline-offset: 2px;
}

/*
|--------------------------------------------------------------------------
| Top bar
|--------------------------------------------------------------------------
*/

.events-bar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-bottom: 0.6rem;
  background: var(--p-content-background, #fff);
  border-bottom: 1px solid
    var(--p-content-border-color, rgba(0, 0, 0, 0.1));
}

.events-bar-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.events-title {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  flex: 1 1 auto;
  min-width: 0;
}

.events-title strong {
  font-size: 1.35rem;
  line-height: 1;
}

.events-title span {
  font-size: 0.8rem;
  opacity: 0.65;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * 2.75rem is the smallest comfortable touch target;
 * anything less and these get missed on a phone.
 */
.icon-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: 1px solid
    var(--p-content-border-color, rgba(0, 0, 0, 0.12));
  border-radius: 0.7rem;
  background: transparent;
  color: inherit;
  font-size: 1rem;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.icon-button:active {
  background: rgba(0, 0, 0, 0.06);
}

.icon-button.is-active {
  border-color: var(--p-primary-color, #3b82f6);
  color: var(--p-primary-color, #3b82f6);
}

.icon-button.is-busy i {
  animation: events-spin 0.9s linear infinite;
}

.icon-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.icon-button-dot {
  position: absolute;
  top: 0.45rem;
  right: 0.45rem;
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--p-primary-color, #3b82f6);
}

@keyframes events-spin {
  to {
    transform: rotate(360deg);
  }
}

/*
|--------------------------------------------------------------------------
| Segmented controls
|--------------------------------------------------------------------------
|
| Scrolls sideways instead of wrapping, so the bar stays
| one line tall however many options there are.
|
*/

.segmented {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  border-radius: 0.8rem;
  background: var(--p-content-hover-background, rgba(0, 0, 0, 0.05));
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.segmented::-webkit-scrollbar {
  display: none;
}

.segmented-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  flex: 1 0 auto;
  min-height: 2.25rem;
  padding: 0 0.85rem;
  border: 0;
  border-radius: 0.6rem;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.85rem;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease;
}

.segmented-option i {
  font-size: 0.7rem;
}

.segmented-option.is-selected {
  background: var(--p-content-background, #fff);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.segmented-option:disabled {
  opacity: 0.5;
  cursor: default;
}

/*
|--------------------------------------------------------------------------
| Filters
|--------------------------------------------------------------------------
*/

.events-filters {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.events-hint {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.45;
  opacity: 0.6;
}

.search-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: 1px solid
    var(--p-content-border-color, rgba(0, 0, 0, 0.12));
  border-radius: 0.7rem;
}

.search-field i {
  flex: 0 0 auto;
  opacity: 0.5;
  font-size: 0.85rem;
}

.search-field input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  /*
   * iOS zooms the page in when a focused input is under
   * 16px. This is the only reason for the explicit size.
   */
  font-size: 16px;
  outline: none;
}

.search-field input::-webkit-search-decoration,
.search-field input::-webkit-search-cancel-button {
  -webkit-appearance: none;
}

.search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.08);
  color: inherit;
  font-size: 0.7rem;
  cursor: pointer;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

/*
 * --badge-hue is set inline per event name, so a new
 * event type gets its own stable colour with no lookup
 * table to maintain.
 */
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.25rem;
  padding: 0 0.7rem;
  border: 1px solid
    hsl(var(--badge-hue, 220) 60% 50% / 0.35);
  border-radius: 999px;
  background: hsl(var(--badge-hue, 220) 60% 50% / 0.1);
  color: inherit;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.chip-name {
  overflow-wrap: anywhere;
}

.chip-count {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

.chip.is-muted {
  opacity: 0.4;
  border-style: dashed;
  background: transparent;
  text-decoration: line-through;
}

.events-filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.events-filter-actions :deep(.p-button) {
  flex: 1 1 auto;
  justify-content: center;
  min-height: 2.5rem;
}

/*
|--------------------------------------------------------------------------
| Statistics strip
|--------------------------------------------------------------------------
|
| Scrolls sideways on a phone rather than wrapping into
| a tall block that pushes the list off screen.
|
*/

.stat-strip {
  display: flex;
  gap: 0.4rem;
  margin: 0;
  padding: 0 0 0.2rem;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.stat-strip::-webkit-scrollbar {
  display: none;
}

.stat {
  flex: 0 0 auto;
  min-width: 4.5rem;
  padding: 0.45rem 0.7rem;
  border: 1px solid
    var(--p-content-border-color, rgba(0, 0, 0, 0.09));
  border-radius: 0.7rem;
}

.stat.is-wide {
  min-width: 10rem;
}

.stat dt {
  font-size: 0.68rem;
  text-transform: none;
  opacity: 0.55;
}

.stat dd {
  margin: 0.1rem 0 0;
  font-size: 1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stat.is-wide dd {
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
}

/*
|--------------------------------------------------------------------------
| List
|--------------------------------------------------------------------------
|
| One grid definition drives both layouts: stacked on a
| phone, aligned columns once there's room.
|
*/

.list-tools {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.list-tools-count {
  margin-left: auto;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  opacity: 0.55;
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.event-row {
  min-width: 0;
  border: 1px solid
    var(--p-content-border-color, rgba(0, 0, 0, 0.09));
  border-radius: 0.8rem;
  overflow: hidden;
}

.event-row.is-open {
  border-color: hsl(220 10% 50% / 0.35);
}

/*
 * A real button, so the whole row is one keyboard stop
 * and announces its expanded state without extra
 * wiring.
 */
.event-head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas:
    'badge when chevron'
    'item  item chevron';
  align-items: center;
  gap: 0.25rem 0.6rem;
  width: 100%;
  min-height: 2.75rem;
  padding: 0.65rem 0.8rem;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.event-head:active {
  background: rgba(0, 0, 0, 0.04);
}

.event-badge {
  grid-area: badge;
  justify-self: start;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: hsl(var(--badge-hue, 220) 60% 50% / 0.14);
  color: hsl(var(--badge-hue, 220) 65% 35%);
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.event-item {
  grid-area: item;
  min-width: 0;
  font-size: 0.9rem;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.event-when {
  grid-area: when;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-self: end;
  min-width: 0;
  /*
   * The full date is the widest thing in the row. Let it
   * wrap here rather than set the row's minimum width.
   */
  text-align: right;
}

.event-time {
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

.event-relative {
  font-size: 0.68rem;
  white-space: nowrap;
  opacity: 0.5;
}

.event-chevron {
  grid-area: chevron;
  font-size: 0.7rem;
  opacity: 0.4;
  transition: transform 0.2s ease;
}

.event-row.is-open .event-chevron {
  transform: rotate(90deg);
}

/*
|--------------------------------------------------------------------------
| Row detail
|--------------------------------------------------------------------------
*/

.event-detail {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.5rem;
  margin: 0;
  padding: 0.25rem 0.8rem 0.8rem;
  border-top: 1px solid
    var(--p-content-border-color, rgba(0, 0, 0, 0.08));
}

.detail-pair {
  display: grid;
  grid-template-columns: 6.5rem 1fr;
  gap: 0.5rem;
  align-items: baseline;
  min-width: 0;
}

.detail-pair dt {
  font-size: 0.72rem;
  opacity: 0.55;
}

.detail-pair dd {
  margin: 0;
  min-width: 0;
  font-size: 0.82rem;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.detail-pair dd.is-mono {
  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  font-size: 0.75rem;
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding-top: 0.25rem;
}

/*
|--------------------------------------------------------------------------
| Visitors
|--------------------------------------------------------------------------
|
| Each visitor is tinted by the hue of its hash, on the
| left edge here and on the trail header, so the same
| visitor is recognisable in both places.
|
*/

.visitor-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.visitor-card {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  width: 100%;
  min-width: 0;
  padding: 0.65rem 0.8rem 0.7rem;
  border: 1px solid
    var(--p-content-border-color, rgba(0, 0, 0, 0.09));
  border-left: 3px solid
    hsl(var(--badge-hue, 220) 55% 50%);
  border-radius: 0.8rem;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.visitor-card:active {
  background: rgba(0, 0, 0, 0.04);
}

.visitor-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.visitor-swatch {
  flex: 0 0 auto;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: hsl(var(--badge-hue, 220) 55% 50%);
}

.visitor-hash {
  flex: 1 1 auto;
  min-width: 0;
  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  font-size: 0.85rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}

.visitor-when {
  flex: 0 0 auto;
  font-size: 0.72rem;
  opacity: 0.6;
  white-space: nowrap;
}

.visitor-path {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

.visitor-path-sep {
  font-size: 0.6rem;
  opacity: 0.35;
}

.visitor-path-more {
  font-size: 0.72rem;
  font-weight: 600;
  opacity: 0.5;
}

.visitor-meta {
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
}

/*
|--------------------------------------------------------------------------
| Trail
|--------------------------------------------------------------------------
|
| A single vertical rule runs the length of the list;
| each step's dot sits on it in the event's own colour.
|
*/

.trail {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

.trail-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
  padding: 0.5rem 0.5rem 0.5rem 0.6rem;
  border-left: 3px solid
    hsl(var(--badge-hue, 220) 55% 50%);
  border-radius: 0.8rem;
  background: hsl(var(--badge-hue, 220) 55% 50% / 0.07);
}

.trail-id {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
}

.trail-label {
  font-size: 0.68rem;
  opacity: 0.55;
}

.trail-hash {
  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  font-size: 0.78rem;
  font-weight: 600;
  overflow-wrap: anywhere;
  word-break: break-all;
}

.trail-steps {
  position: relative;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.trail-steps::before {
  content: '';
  position: absolute;
  top: 0.5rem;
  bottom: 0.5rem;
  left: 0.75rem;
  width: 2px;
  transform: translateX(-50%);
  background: var(--p-content-border-color, rgba(0, 0, 0, 0.12));
}

.trail-step {
  position: relative;
  display: grid;
  grid-template-columns: 1.5rem 1fr;
  gap: 0.6rem;
  padding: 0.45rem 0;
  transition: opacity 0.15s ease;
}

.trail-step.is-dim {
  opacity: 0.4;
}

.trail-marker {
  position: relative;
  z-index: 1;
  justify-self: center;
  width: 0.7rem;
  height: 0.7rem;
  margin-top: 0.3rem;
  border-radius: 50%;
  background: hsl(var(--badge-hue, 220) 60% 50%);
  box-shadow: 0 0 0 3px var(--p-content-background, #fff);
}

.trail-step.is-match .trail-marker {
  box-shadow:
    0 0 0 3px var(--p-content-background, #fff),
    0 0 0 5px hsl(var(--badge-hue, 220) 60% 50% / 0.45);
}

.trail-body {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    'badge meta'
    'item  item';
  align-items: center;
  gap: 0.25rem 0.6rem;
  min-width: 0;
}

.trail-meta {
  grid-area: meta;
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.1rem 0.45rem;
  min-width: 0;
  text-align: right;
}

.trail-gap {
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: 0.5;
}

.trail-break {
  position: relative;
  padding: 0.6rem 0 0.2rem 2.1rem;
  font-size: 0.72rem;
  font-weight: 600;
  opacity: 0.6;
}

.trail-break::before {
  content: '';
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 0.75rem;
  width: 0.6rem;
  height: 0.6rem;
  border: 2px solid currentColor;
  border-radius: 50%;
  background: var(--p-content-background, #fff);
  transform: translate(-50%, -25%);
}

/*
|--------------------------------------------------------------------------
| Loading, empty, footer
|--------------------------------------------------------------------------
*/

.event-row.is-skeleton {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.6rem;
  padding: 0.9rem 0.8rem;
}

.skeleton-badge,
.skeleton-line {
  height: 0.85rem;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.08;
  animation: events-pulse 1.4s ease-in-out infinite;
}

.skeleton-badge {
  width: 3.5rem;
}

.skeleton-line {
  width: 100%;
}

@keyframes events-pulse {
  50% {
    opacity: 0.16;
  }
}

.events-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 2.5rem 1rem;
  text-align: center;
}

.events-empty i {
  font-size: 1.75rem;
  opacity: 0.3;
}

.events-empty p {
  margin: 0;
  opacity: 0.7;
}

.events-more {
  display: flex;
}

.events-more-button {
  flex: 1 1 auto;
  justify-content: center;
  min-height: 2.75rem;
}

.events-timestamp {
  margin: 0;
  font-size: 0.75rem;
  text-align: center;
  opacity: 0.5;
}

/*
|--------------------------------------------------------------------------
| Wide screens
|--------------------------------------------------------------------------
|
| The rows become aligned columns so a long list can be
| scanned down, and the filter drawer is always open
| because there's room for it.
|
*/

@media (min-width: 720px) {
  .event-head {
    grid-template-columns: 9rem 1fr auto auto;
    grid-template-areas: 'badge item when chevron';
    gap: 0.75rem;
    padding: 0.55rem 0.8rem;
  }

  .event-when {
    flex-direction: row;
    align-items: baseline;
    gap: 0.45rem;
  }

  .event-time {
    white-space: nowrap;
  }

  .event-item {
    font-size: 0.875rem;
  }

  .event-detail {
    grid-template-columns: 1fr 1fr;
    column-gap: 1.5rem;
  }

  .detail-actions {
    grid-column: 1 / -1;
  }

  .trail-body {
    grid-template-columns: 9rem 1fr auto;
    grid-template-areas: 'badge item meta';
    gap: 0.75rem;
  }

  .trail-meta {
    flex-wrap: nowrap;
  }

  .segmented-option {
    flex: 0 0 auto;
  }

  .events-filter-actions :deep(.p-button) {
    flex: 0 0 auto;
  }

  .events-filter-actions {
    justify-content: flex-end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .icon-button,
  .segmented-option,
  .chip,
  .event-chevron,
  .trail-step {
    transition: none;
  }

  .icon-button.is-busy i,
  .skeleton-badge,
  .skeleton-line {
    animation: none;
  }
}
</style>