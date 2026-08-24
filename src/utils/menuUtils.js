export const uid = () => Math.random().toString(36).slice(2, 10)

export const deepClone = value => JSON.parse(JSON.stringify(value))

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeCategoryOrder(menu) {
  if (!menu.menu_configuration) {
    menu.menu_configuration = {
      background_color: '#FAF7F0',
      font_color: '#26241F',
      font_family: 'Inter',
      font_size: 16,
      category_order: [],
    }
  }

  let order = menu.menu_configuration.category_order

  if (typeof order === 'string') {
    try {
      order = JSON.parse(order)
    } catch {
      order = []
    }
  }

  menu.menu_configuration.category_order = Array.isArray(order) ? order : []
  return menu
}

export function prepareDraft(menu) {
  const draft = normalizeCategoryOrder(deepClone(menu))

  draft.menu_owner ||= {
    menu_owner_name: '',
    menu_owner_url_name: '',
    menu_owner_phone: '',
    menu_owner_logo_url: '',
    menu_owner_slogan: '',
    menu_owner_place_background_url: '',
  }

  draft.menu_items ||= []
  draft.menu_items.forEach(item => {
    item._key ||= uid()
  })

  if (typeof draft.yumm_eligible === 'undefined') {
    draft.yumm_eligible = false
  }

  return draft
}

export function cleanMenuForCompare(menu) {
  if (!menu) return null
  const copy = deepClone(menu)
  ;(copy.menu_items || []).forEach(item => delete item._key)
  return copy
}

export function isMenuDirty(saved, draft) {
  if (!saved || !draft) return false
  return JSON.stringify(cleanMenuForCompare(saved)) !== JSON.stringify(cleanMenuForCompare(draft))
}

export function serializeMenuForSave(draft) {
  const payload = cleanMenuForCompare(draft)

  if (payload.menu_configuration) {
    payload.menu_configuration.category_order = JSON.stringify(
      draft.menu_configuration?.category_order || []
    )
  }

  return payload
}

export function createEmptyMenu(name, urlName) {
  return {
    suspended: false,
    yumm_eligible: false,
    menu_owner: {
      menu_owner_name: name,
      menu_owner_url_name: urlName,
      menu_owner_phone: '',
      menu_owner_logo_url: '',
      menu_owner_slogan: '',
      menu_owner_slogan_en: '',
      menu_owner_place_background_url: '',
    },
    menu_configuration: {
      background_color: '#FAF7F0',
      font_color: '#26241F',
      font_family: 'Inter',
      font_size: 16,
      category_order: '[]',
    },
    menu_items: [],
  }
}

export function groupItemsByCategory(items = []) {
  const groups = new Map()

  items.forEach(item => {
    const name = String(item.category || '').trim() || 'Uncategorized'
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(item)
  })

  groups.forEach(list =>
    list.sort(
      (a, b) =>
        Number(a.display_order_position || 0) -
        Number(b.display_order_position || 0)
    )
  )

  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === 'Uncategorized') return 1
      if (b === 'Uncategorized') return -1
      return a.localeCompare(b)
    })
    .map(([name, items]) => ({ name, items }))
}

export function categoryLabels(nodes = []) {
  const result = []

  const walk = list => {
    for (const node of list || []) {
      if (typeof node === 'string') {
        if (node.trim()) result.push(node.trim())
      } else if (node && typeof node === 'object') {
        if (node.label?.trim()) result.push(node.label.trim())
        walk(node.children)
      }
    }
  }

  walk(nodes)
  return [...new Set(result)]
}

export function getMenuIdsFromToken(token) {
  const payload = decodeJwt(token)

  const rawMenus = payload?.menus

  if (!rawMenus) {
    return []
  }

  return String(rawMenus)
    .split(',')
    .map(value => Number(value.trim()))
    .filter(value =>
      Number.isInteger(value) &&
      value > 0
    )
}
