import {
  computed,
  onBeforeUnmount,
  ref,
} from 'vue'

import {
  createMenuApi,
} from '@/services/menuApi'

import {
  login as authLogin,
} from '@/services/authApi'

import {
  getUserFromToken,
} from '@/utils/jwt'

import {
  createEmptyMenu,
  deepClone,
  isMenuDirty,
  normalizeCategoryOrder,
  prepareDraft,
  serializeMenuForSave,
} from '@/utils/menuUtils'

const TOKEN_STORAGE_KEY =
  'scanme_dashboard_token'

export function useMenuDashboard() {
  /*
  |--------------------------------------------------------------------------
  | API
  |--------------------------------------------------------------------------
  */

  const apiBase = ref(
    import.meta.env.VITE_API_BASE ||
      'https://scanme-production.up.railway.app'
  )

  /*
  |--------------------------------------------------------------------------
  | Authentication
  |--------------------------------------------------------------------------
  */

  const authToken = ref(
    localStorage.getItem(
      TOKEN_STORAGE_KEY
    )
  )

  const loggedIn = computed(
    () =>
      Boolean(
        authToken.value
      )
  )

  const currentUser = computed(
    () =>
      getUserFromToken(
        authToken.value
      )
  )

  /*
  |--------------------------------------------------------------------------
  | Menu state
  |--------------------------------------------------------------------------
  */

  /*
   * IMPORTANT:
   *
   * `menus` now contains ONLY whatever the backend returns.
   *
   * The backend is responsible for validating the JWT and
   * returning only the menus the authenticated user may access.
   */
  const menus = ref([])

  const currentMenu = ref(null)
  const draftMenu = ref(null)

  /*
  |--------------------------------------------------------------------------
  | UI state
  |--------------------------------------------------------------------------
  */

  const loading = ref(false)
  const saving = ref(false)
  const error = ref(null)

  /*
  |--------------------------------------------------------------------------
  | API client
  |--------------------------------------------------------------------------
  */

  const api = computed(() =>
    createMenuApi({
      baseUrl:
        apiBase.value,

      getToken: () =>
        authToken.value,

      onUnauthorized: () => {
        clearAuthentication()
      },
    })
  )

  /*
  |--------------------------------------------------------------------------
  | Dirty state
  |--------------------------------------------------------------------------
  */

  const dirty = computed(
    () =>
      isMenuDirty(
        currentMenu.value,
        draftMenu.value
      )
  )

  /*
  |--------------------------------------------------------------------------
  | Authentication helpers
  |--------------------------------------------------------------------------
  */

  function setAuthentication(
    token
  ) {
    authToken.value = token

    localStorage.setItem(
      TOKEN_STORAGE_KEY,
      token
    )
  }

  function clearAuthentication() {
    authToken.value = null

    localStorage.removeItem(
      TOKEN_STORAGE_KEY
    )

    menus.value = []

    currentMenu.value =
      null

    draftMenu.value =
      null
  }

  /*
  |--------------------------------------------------------------------------
  | Login
  |--------------------------------------------------------------------------
  */

  async function login(
    email,
    password
  ) {
    error.value = null

    try {
      const result =
        await authLogin(
          email,
          password
        )

      setAuthentication(
        result.token
      )

      /*
       * The token is now attached automatically to /menus.
       *
       * The backend decides which menus this user can see.
       */
      await loadMenus({
        preserveSelection: false,
      })

      return currentUser.value
    } catch (err) {
      clearAuthentication()

      error.value =
        err.message

      throw err
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Logout
  |--------------------------------------------------------------------------
  */

  function logout() {
    clearAuthentication()
  }

  /*
  |--------------------------------------------------------------------------
  | Load menus
  |--------------------------------------------------------------------------
  */

  async function loadMenus({
    preserveSelection = true,
  } = {}) {
    /*
     * Don't call the protected menu API if there is no token.
     */
    if (!authToken.value) {
      menus.value = []

      currentMenu.value =
        null

      draftMenu.value =
        null

      return []
    }

    loading.value = true
    error.value = null

    const selectedId =
      preserveSelection
        ? currentMenu.value?.id
        : null

    try {
      /*
       * Authorization: Bearer <token>
       *
       * is attached inside menuApi.js.
       */
      const data =
        await api.value
          .listMenus()

      menus.value =
        data?.menus ||
        []

      /*
       * Keep the current menu selected after refresh,
       * but only if the backend still returns it.
       *
       * This also handles the case where the user's
       * permissions changed between requests.
       */
      if (selectedId !== null &&
          selectedId !== undefined) {
        const found =
          menus.value.find(
            menu =>
              String(menu.id) ===
              String(selectedId)
          )

        if (found) {
          selectMenu(
            selectedId
          )
        } else {
          currentMenu.value =
            null

          draftMenu.value =
            null
        }
      }

      return menus.value
    } catch (err) {
      error.value =
        err.message

      throw err
    } finally {
      loading.value =
        false
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Select menu
  |--------------------------------------------------------------------------
  */

  function selectMenu(id) {
    /*
     * Only menus returned by /menus are selectable.
     */
    const found =
      menus.value.find(
        menu =>
          String(menu.id) ===
          String(id)
      )

    if (!found) {
      return false
    }

    currentMenu.value =
      normalizeCategoryOrder(
        deepClone(found)
      )

    draftMenu.value =
      prepareDraft(
        currentMenu.value
      )

    return true
  }

  /*
  |--------------------------------------------------------------------------
  | Discard changes
  |--------------------------------------------------------------------------
  */

  function discardDraft() {
    if (!currentMenu.value) {
      return
    }

    draftMenu.value =
      prepareDraft(
        currentMenu.value
      )
  }

  /*
  |--------------------------------------------------------------------------
  | Save menu
  |--------------------------------------------------------------------------
  */

  async function saveMenu() {
    if (!draftMenu.value) {
      return
    }

    saving.value = true
    error.value = null

    const id =
      draftMenu.value.id

    try {
      /*
       * This updates:
       *
       * - menu owner
       * - configuration
       * - categories
       * - menu items
       *
       * using your existing whole-menu update endpoint.
       */
      await api.value.updateMenu(
        serializeMenuForSave(
          draftMenu.value
        )
      )

      /*
       * Reload after save.
       *
       * This is important because newly-created menu items
       * receive their actual IDs from the backend.
       */
      await loadMenus({
        preserveSelection: false,
      })

      const fresh =
        menus.value.find(
          menu =>
            String(menu.id) ===
            String(id)
        )

      if (fresh) {
        selectMenu(id)
      } else {
        currentMenu.value =
          null

        draftMenu.value =
          null
      }
    } catch (err) {
      error.value =
        err.message

      throw err
    } finally {
      saving.value =
        false
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Create menu
  |--------------------------------------------------------------------------
  */

  async function createMenu(
    name,
    urlName
  ) {
    saving.value = true
    error.value = null

    try {
      const created =
        await api.value
          .createMenu(
            createEmptyMenu(
              name,
              urlName
            )
          )

      /*
       * Backend re-evaluates access on /menus.
       *
       * If the newly-created menu belongs to this user,
       * it should now appear in the returned list.
       */
      await loadMenus({
        preserveSelection: false,
      })

      let target = null

      if (
        created?.id !== null &&
        created?.id !== undefined
      ) {
        target =
          menus.value.find(
            menu =>
              String(menu.id) ===
              String(created.id)
          )
      }

      /*
       * Fallback for APIs that don't return the created ID.
       */
      if (!target) {
        target =
          menus.value.find(
            menu =>
              menu
                ?.menu_owner
                ?.menu_owner_url_name ===
              urlName
          )
      }

      if (!target) {
        target =
          menus.value.at(-1) ||
          null
      }

      if (target) {
        selectMenu(
          target.id
        )
      }

      return target
    } catch (err) {
      error.value =
        err.message

      throw err
    } finally {
      saving.value =
        false
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Delete menu
  |--------------------------------------------------------------------------
  */

  async function deleteCurrentMenu() {
    if (!currentMenu.value) {
      return
    }

    saving.value = true
    error.value = null

    try {
      await api.value.deleteMenu(
        currentMenu.value.id
      )

      currentMenu.value =
        null

      draftMenu.value =
        null

      await loadMenus({
        preserveSelection: false,
      })
    } catch (err) {
      error.value =
        err.message

      throw err
    } finally {
      saving.value =
        false
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Suspend / enable
  |--------------------------------------------------------------------------
  */

  async function toggleSuspended() {
    if (
      !currentMenu.value ||
      dirty.value
    ) {
      return false
    }

    error.value = null

    const next =
      !currentMenu.value
        .suspended

    try {
      if (next) {
        await api.value
          .suspendMenu(
            currentMenu.value.id
          )
      } else {
        await api.value
          .enableMenu(
            currentMenu.value.id
          )
      }

      currentMenu.value
        .suspended = next

      if (draftMenu.value) {
        draftMenu.value
          .suspended = next
      }

      /*
       * Refresh in case the backend changes anything else
       * about the menu when its status changes.
       */
      await loadMenus({
        preserveSelection: true,
      })

      return true
    } catch (err) {
      error.value =
        err.message

      throw err
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Yumm
  |--------------------------------------------------------------------------
  */

  async function toggleYumm(
    menuId
  ) {
    /*
     * Prevent changing Yumm state on the currently-open
     * menu while it has unsaved modifications.
     */
    if (
      currentMenu.value &&
      String(
        currentMenu.value.id
      ) === String(menuId) &&
      dirty.value
    ) {
      return false
    }

    const menu =
      menus.value.find(
        item =>
          String(item.id) ===
          String(menuId)
      )

    if (!menu) {
      return false
    }

    error.value = null

    const next =
      !menu.yumm_eligible

    try {
      if (next) {
        await api.value
          .enableYumm(
            menuId
          )
      } else {
        await api.value
          .disableYumm(
            menuId
          )
      }

      menu.yumm_eligible =
        next

      if (
        currentMenu.value &&
        String(
          currentMenu.value.id
        ) === String(menuId)
      ) {
        currentMenu.value
          .yumm_eligible =
          next

        if (draftMenu.value) {
          draftMenu.value
            .yumm_eligible =
            next
        }
      }

      return true
    } catch (err) {
      error.value =
        err.message

      throw err
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Change API base
  |--------------------------------------------------------------------------
  */

  function updateApiBase(
    value
  ) {
    apiBase.value =
      String(value || '')
        .trim()
        .replace(/\/+$/, '')

    menus.value = []

    currentMenu.value =
      null

    draftMenu.value =
      null
  }

  /*
  |--------------------------------------------------------------------------
  | Unsaved changes browser warning
  |--------------------------------------------------------------------------
  */

  const beforeUnload =
    event => {
      if (!dirty.value) {
        return
      }

      event.preventDefault()

      event.returnValue =
        ''
    }

  window.addEventListener(
    'beforeunload',
    beforeUnload
  )

  onBeforeUnmount(
    () => {
      window.removeEventListener(
        'beforeunload',
        beforeUnload
      )
    }
  )

  /*
  |--------------------------------------------------------------------------
  | Public API
  |--------------------------------------------------------------------------
  */

  return {
    /*
     * Authentication
     */

    authToken,
    loggedIn,
    currentUser,

    login,
    logout,

    /*
     * API
     */

    apiBase,
    api,
    updateApiBase,

    /*
     * Menus
     */

    menus,
    currentMenu,
    draftMenu,

    /*
     * State
     */

    loading,
    saving,
    error,
    dirty,

    /*
     * Menu operations
     */

    loadMenus,
    selectMenu,
    discardDraft,

    saveMenu,
    createMenu,
    deleteCurrentMenu,

    toggleSuspended,
    toggleYumm,
  }
}