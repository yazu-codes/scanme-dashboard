function decodeBase64Url(value) {
  let base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  while (base64.length % 4) {
    base64 += '='
  }

  return decodeURIComponent(
    atob(base64)
      .split('')
      .map(character =>
        '%' +
        character
          .charCodeAt(0)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

export function decodeJwt(token) {
  if (!token) {
    return null
  }

  try {
    const parts = token.split('.')

    if (parts.length !== 3) {
      return null
    }

    return JSON.parse(
      decodeBase64Url(parts[1])
    )
  } catch {
    return null
  }
}

export function getUserFromToken(token) {
  const payload = decodeJwt(token)

  if (!payload) {
    return null
  }

  return {
    id:
      payload.sub ||
      payload.user_id ||
      payload.id ||
      null,

    email:
      payload.email ||
      payload.preferred_username ||
      payload.username ||
      null,

    name:
      payload.name ||
      payload.full_name ||
      payload.display_name ||
      null,

    role:
      payload.role ||
      null,

    menus:
      payload.menus ||
      '',
  }
}

export function getMenuIdsFromToken(token) {
  const payload = decodeJwt(token)

  const rawMenus =
    payload?.menus

  if (!rawMenus) {
    return []
  }

  return String(rawMenus)
    .split(',')
    .map(value =>
      Number(value.trim())
    )
    .filter(value =>
      Number.isInteger(value) &&
      value > 0
    )
}