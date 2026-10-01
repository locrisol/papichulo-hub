import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AuthContext, NO_ACCESS } from '@/context/auth'

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

  // The row is read again on every sign in event, and Supabase sends one each
  // time the tab comes back into view. So a read can fail for somebody already
  // in the middle of something: back from the camera with no signal for a few
  // seconds. Stopping them there threw away the page they were on and told
  // them to sign out, which for staff who rarely type a password is the worst
  // answer. Whose row is already held, and whether the last read again failed,
  // so that case keeps what it had and tries again instead.
  const held = useRef(null)
  const [stale, setStale] = useState(false)

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
        //
        // No row at all (PGRST116) is the one answer that is not a fault: see
        // NO_ACCESS. It stops somebody even when a row is held, because this
        // read is the only way an open session hears its login was switched
        // off.
        if (readError) {
            console.error('Could not load the signed-in user:', readError.message)
            if (readError.code === 'PGRST116') setError(NO_ACCESS)
            else if (held.current === userId) setStale(true)
            else setError(readError.message)
        } else {
            held.current = data.id
            setUser(data)
            setError(null)
            setStale(false)
        }
        setLoading(false)
    }

  // Read the row again.
  //
  // This context holds the row every permission check reads, so anything that
  // changes it has to say so. Without it a preference saved on Tuesday is not
  // the one the app uses until the next time somebody signs in, which for a
  // setting about signing in is exactly the wrong moment to be a version
  // behind.
  async function refreshUser() {
      const id = session?.user?.id
      if (id) await fetchUser(id)
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
        held.current = null
        setUser(null)
        setError(null)
        setStale(false)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // A read again that failed is tried again when the connection comes back,
  // and every half minute in case it never went (the database itself had a
  // bad moment). Nothing is waiting on it: the row already held stays in use.
  const signedInAs = session?.user?.id
  useEffect(() => {
    if (!stale || !signedInAs) return undefined
    const again = () => fetchUser(signedInAs)
    window.addEventListener('online', again)
    const timer = setInterval(again, 30000)
    return () => {
      window.removeEventListener('online', again)
      clearInterval(timer)
    }
  }, [stale, signedInAs])

  return (
    <AuthContext.Provider value={{ session, user, loading, error, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}
