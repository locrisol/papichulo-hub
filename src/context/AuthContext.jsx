import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AuthContext } from '@/context/auth'

// Who is signed in.
//
// There are two different things here and the app needs both. The session comes
// from Supabase Auth and only says somebody is logged in. The user is our own
// row from the users table, and that is where the role and the restaurant live,
// which is what every permission check actually reads.
//
// So there is a moment on every sign-in where there is a session but no user
// yet. RequireRole has to allow for that gap or it refuses people at random.


export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Why the row could not be read, for the screen rather than the console.
  //
  // Logging it was not enough. A session whose user row cannot be read left
  // every page sitting at Loading with the reason only in devtools, which is no
  // answer at all for somebody holding a phone. Happened on 13 September with a
  // stale session and took twenty minutes to place.
  const [error, setError] = useState(null)

  // Above the effect that calls it, not below. It works either way,
  // because a function declaration is hoisted, but the React Compiler
  // reads the file in order and will not optimise a component that uses
  // something before it is written.
  async function fetchUser(userId) {
        const { data, error: readError } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single()

        // Do not swallow this. If the row cannot be read the app has no idea
        // who is signed in, every role check reads undefined, and nothing says
        // so. That is how an employee could sign in and quietly have no role.
        if (readError) {
            console.error('Could not load the signed-in user:', readError.message)
            setError(readError.message)
        } else {
            setUser(data)
            setError(null)
        }
        setLoading(false)
    }

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
        setError(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, user, loading, error }}>
      {children}
    </AuthContext.Provider>
  )
}
