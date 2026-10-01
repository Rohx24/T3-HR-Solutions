import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null })

  useEffect(() => {
    api.me().then(
      ({ user }) => setState({ status: 'authed', user }),
      () => setState({ status: 'anon', user: null }),
    )
    const onUnauthorized = () => setState({ status: 'anon', user: null })
    window.addEventListener('hr:unauthorized', onUnauthorized)
    return () => window.removeEventListener('hr:unauthorized', onUnauthorized)
  }, [])

  const signedIn = useCallback(({ user }, extra = {}) => {
    setState({ status: 'authed', user, ...extra })
    return user
  }, [])

  const value = useMemo(
    () => ({
      ...state,
      login: (email, password) => api.login(email, password).then((r) => signedIn(r)),
      signup: (data) => api.signup(data).then((r) => signedIn(r, { isNew: true })),
      google: (credential) => api.google(credential).then((r) => signedIn(r)),
      logout: () =>
        api
          .logout()
          .catch(() => {})
          .then(() => setState({ status: 'anon', user: null })),
      clearNew: () => setState((s) => ({ ...s, isNew: false })),
    }),
    [state, signedIn],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

export function firstName(user) {
  return (user?.name || '').split(/\s+/)[0] || 'there'
}
