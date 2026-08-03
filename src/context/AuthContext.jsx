import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Who is signed in.
//
// There are two different things here and the app needs both. The session comes
// from Supabase Auth and only says somebody is logged in. The user is our own
// row from the users table, and that is where the role and the restaurant live,
// which is what every permission check actually reads.
//
// So there is a moment on every sign-in where there is a session but no user
// yet. RequireRole has to allow for that gap or it refuses people at random.
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchUser(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchUser(session.user.id)
      else {
        setUser(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchUser(userId) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single()

        // Do not swallow this. If the row cannot be read the app has no idea
        // who is signed in, every role check reads undefined, and nothing says
        // so. That is how an employee could sign in and quietly have no role.
        if (error) console.error('Could not load the signed-in user:', error.message)
        else setUser(data)
        setLoading(false)
    }

  return (
    <AuthContext.Provider value={{ session, user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}