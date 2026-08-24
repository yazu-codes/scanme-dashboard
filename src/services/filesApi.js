const FILES_API_BASE =
  import.meta.env.VITE_FILES_API_BASE ||
  'https://scanme-files-production.up.railway.app'

export const ITEM_IMAGES_PUBLIC_BASE =
  import.meta.env.VITE_ITEM_IMAGES_PUBLIC_BASE ||
  'https://items.tapmy.menu/menu-items'

const normalizeKey = key => String(key || '').replace(/^\/+/, '')

export const storageKeyToPublicUrl = storageKey =>
  `${ITEM_IMAGES_PUBLIC_BASE}/${normalizeKey(storageKey)}`

export async function listImages(menuId) {
  if (!menuId) return []

  const response = await fetch(`${FILES_API_BASE}/images/${menuId}`)

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }

  const data = await response.json()

  return (Array.isArray(data) ? data : []).map(image => ({
    menu_id: image.menu_id,
    url: image.Url ?? image.url ?? '',
  }))
}

export async function uploadImage(file, menuId, token) {
  const formData = new FormData()
  formData.append('image', file)
  formData.append('menu_id', menuId)

  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${FILES_API_BASE}/images`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = body?.message || body?.error || ''
    } catch {}
    throw new Error(detail || `Upload failed (${response.status})`)
  }

  try {
    return await response.json()
  } catch {
    return null
  }
}
