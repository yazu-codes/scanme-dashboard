const AUTH_API_BASE =
  import.meta.env.VITE_AUTH_API_BASE ||
  'https://scanme-auth-production.up.railway.app/api/auth'

async function parseError(response) {
  let message =
    `Request failed (${response.status})`

  try {
    const body =
      await response.json()

    message =
      body?.message ||
      body?.error ||
      message
  } catch {
    // Non-JSON response
  }

  return message
}

/*
|--------------------------------------------------------------------------
| Login
|--------------------------------------------------------------------------
*/

export async function login(
  email,
  password
) {
  const response = await fetch(
    `${AUTH_API_BASE}/login`,
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify({
        email,
        password,
      }),
    }
  )

  if (!response.ok) {
    throw new Error(
      await parseError(response)
    )
  }

  const text = await response.text()

    if (!text.trim()) {
    throw new Error(
        'Login succeeded but returned an empty response.'
    )
    }

  let data

  try {
    data = JSON.parse(text)
    } catch {
        throw new Error(
            'Login returned invalid JSON.'
        )
    }

  const token =
    data?.token ||
    data?.access_token ||
    data?.accessToken ||
    data?.jwt

  if (!token) {
    throw new Error(
      'Login succeeded but no bearer token was returned.'
    )
  }

  return {
    token,
    raw: data,
  }
}

/*
|--------------------------------------------------------------------------
| Signup
|--------------------------------------------------------------------------
|
| This request IS authenticated.
|
| The currently logged-in user's JWT is attached to the
| Authorization header.
|
*/

export async function signup(
  name,
  email,
  password,
  token
) {
  if (!token) {
    throw new Error(
      'You must be logged in to create a user.'
    )
  }

  const response = await fetch(
    `${AUTH_API_BASE}/signup`,
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json',

        Authorization:
          `Bearer ${token}`,
      },

      body: JSON.stringify({
        name,
        email,
        password,
      }),
    }
  )

  if (response.status === 401) {
    throw new Error(
      'Your session has expired. Please log in again.'
    )
  }

  if (response.status === 403) {
    throw new Error(
      'You are not authorized to create users.'
    )
  }

  if (!response.ok) {
    throw new Error(
      await parseError(response)
    )
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