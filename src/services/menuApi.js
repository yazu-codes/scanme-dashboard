const normalizeBase = value =>
  String(value || '').replace(/\/+$/, '')

export function createMenuApi({
  baseUrl,
  getToken,
  onUnauthorized,
}) {
  const request = async (
    path,
    options = {}
  ) => {
    const headers = {
      ...(options.headers || {}),
    }

    /*
     * Don't manually add Content-Type when sending FormData.
     * The browser needs to generate the multipart boundary.
     */
    if (
      options.body &&
      !(options.body instanceof FormData)
    ) {
      headers['Content-Type'] =
        headers['Content-Type'] ||
        'application/json'
    }

    /*
     * Attach the JWT to every backend request.
     */
    const token = getToken?.()

    if (token) {
      headers.Authorization =
        `Bearer ${token}`
    }

    let url = `${normalizeBase(baseUrl)}/api${path}`

    console.log(url)
    console.log(options)
    console.log(headers)


    const response = await fetch(
      `${normalizeBase(baseUrl)}/api${path}`,
      {
        ...options,
        headers,
      }
    )

    /*
     * Authentication expired / invalid.
     */
    if (response.status === 401) {
      onUnauthorized?.()

      throw new Error(
        'Your session has expired. Please log in again.'
      )
    }

    /*
     * JWT is valid, but the backend says the user
     * isn't allowed to perform this operation.
     */
    if (response.status === 403) {
      throw new Error(
        'You are not authorized to perform this action.'
      )
    }

    if (!response.ok) {
      let detail = ''

      try {
        const body =
          await response.json()

        detail =
          body?.message ||
          body?.error ||
          ''
      } catch {
        // Response wasn't JSON.
      }

      throw new Error(
        detail ||
        `Request failed (${response.status})`
      )
    }

    if (response.status === 204) {
      return null
    }

    const text =
      await response.text()

    if (!text) {
      return null
    }

    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  return {
    /*
    |--------------------------------------------------------------------------
    | Menus
    |--------------------------------------------------------------------------
    */

    listMenus: () =>
      request('/menus'),

    createMenu: payload =>
      request(
        '/create-menu',
        {
          method: 'POST',

          body: JSON.stringify(
            payload
          ),
        }
      ),

    updateMenu: payload =>
      request(
        '/update-menu',
        {
          method: 'PUT',

          body: JSON.stringify(
            payload
          ),
        }
      ),

    deleteMenu: id =>
      request(
        `/delete-menu/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        }
      ),

    /*
    |--------------------------------------------------------------------------
    | Menu state
    |--------------------------------------------------------------------------
    */

    suspendMenu: id =>
      request(
        `/suspend-menu/${encodeURIComponent(id)}`,
        {
          method: 'POST',
        }
      ),

    enableMenu: id =>
      request(
        `/enable-menu/${encodeURIComponent(id)}`,
        {
          method: 'POST',
        }
      ),

    /*
    |--------------------------------------------------------------------------
    | Yumm
    |--------------------------------------------------------------------------
    */

    enableYumm: id =>
      request(
        `/yumm-enable/${encodeURIComponent(id)}`,
        {
          method: 'POST',
        }
      ),

    disableYumm: id =>
      request(
        `/yumm-disable/${encodeURIComponent(id)}`,
        {
          method: 'POST',
        }
      ),

    /*
    |--------------------------------------------------------------------------
    | Codes
    |--------------------------------------------------------------------------
    */

    listCodes: () =>
      request('/codes'),

    updateCode: payload =>
      request(
        '/update-code',
        {
          method: 'PUT',

          body: JSON.stringify(
            payload
          ),
        }
      ),
  }
}