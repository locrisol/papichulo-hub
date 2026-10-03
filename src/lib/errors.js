// Turns a database error into something a person can read.
//
// Every screen was doing setError(error.message), which puts raw Postgres text
// in front of whoever is using the app. Some of it is close to meaningless:
// "Cannot coerce the result to a single JSON object" tells nobody anything, and
// "new row violates row-level security policy for table products" tells them
// there is a policy but not what to do about it.
//
// The real message is still worth having when something unexpected happens, so
// anything we do not recognise is passed through rather than replaced with a
// vague apology.

// Postgres error codes we can say something useful about.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const BY_CODE = {
    // Row level security refused it. Almost always means the role is not
    // allowed to do this, rather than anything being broken.
    '42501': 'You do not have permission to do that.',
    // PostgREST could not accept the sign in token: expired, or no longer
    // valid. It used to be read as a permission refusal, so the weekly sales
    // grid threw away a typed week that would have saved after signing in
    // again. PGRST303 is the expired one on newer PostgREST.
    'PGRST301': 'You have been signed out. Sign in again and try once more.',
    'PGRST303': 'You have been signed out. Sign in again and try once more.',
    // Unique constraint. The caller usually knows which one, so this is a
    // fallback for when it does not.
    '23505': 'That already exists.',
    // Foreign key. Something is pointing at a row that is not there, or you
    // are deleting something still in use.
    '23503': 'Something else is still using that, so it cannot be removed.',
    // Not null.
    '23502': 'Something required is missing. Fill it in and try again.',
    // Check constraint.
    '23514': 'One of the values is not allowed. Check the values and try again.',
    // .single() got no rows, or more than one. Usually a permission problem
    // wearing a different hat: the rows are there, this role cannot see them.
    'PGRST116': 'That could not be found, or you do not have permission to see it.',
}

// Phrases in the message when there is no code to go on.
const BY_TEXT = [
    ['violates row-level security', 'You do not have permission to do that.'],
    ['coerce the result to a single json object', 'That could not be found, or you do not have permission to see it.'],
    ['jwt expired', 'You have been signed out. Sign in again and try once more.'],
    ['failed to fetch', 'Could not reach the server. Check your connection and try again.'],
    ['networkerror', 'Could not reach the server. Check your connection and try again.'],
]

// What an edge function actually said, rather than the fact that it failed.
//
// **supabase.functions.invoke treats any non-2xx as an error**, hands back a
// FunctionsHttpError with the response hanging off it, and leaves data null. So
// a function that carefully answers "nothing found for that, paste the
// coordinates instead" has that sentence thrown away, and the person sees "Edge
// Function returned a non-2xx status code", which tells them nothing they can
// act on. He typed a restaurant name into the address box and got exactly that.
//
// The sentence is in the body. This reads it, and falls back to the ordinary
// wording when there is nothing there to read.
export async function functionError(failed, fallback = '') {
    return (await functionSaid(failed)) || friendlyError(failed) || fallback
}

// Only the sentence in the body, or nothing, for a caller that has to tell the
// function's own answer apart from one it never gave. The diary asks this of a
// 404: with a sentence it is the entry that is gone, without one it is the
// function itself.
export async function functionSaid(failed) {
    try {
        const body = await failed?.context?.json?.()
        if (body?.error) return String(body.error)
    } catch {
        // Not JSON, or the body has been read already. Either way there is
        // nothing to read.
    }
    return ''
}

export function friendlyError(error) {
    if (!error) return ''

    if (error.code && BY_CODE[error.code]) return BY_CODE[error.code]

    const text = (error.message || String(error)).toLowerCase()
    for (const [phrase, message] of BY_TEXT) {
        if (text.includes(phrase)) return message
    }

    // Something we have not seen. The raw message is more use than a shrug.
    return error.message || 'Something went wrong. Please try again.'
}

// Whether this was a permission refusal, so a screen can react rather than just
// report. The weekly sales grid uses it to throw away a draft the database will
// never accept.
export function isPermissionError(error) {
    if (!error) return false
    if (error.code === '42501') return true
    return (error.message || '').toLowerCase().includes('violates row-level security')
}
// What the sign in screen says when it did not work.
//
// It said "Invalid email or password" for everything, so a phone with no
// signal, or somebody locked out for a few minutes after too many tries, was
// told their password was wrong, and tried it again. A wrong email or password
// still gets the one sentence that never says which, so the screen is no list
// of who works here.
export function signInProblem(error) {
    if (!error) return ''
    const status = Number(error.status)
    if (error.name === 'AuthRetryableFetchError' || status === 0
        || /failed to fetch|networkerror|load failed/i.test(error.message || '')) {
        return 'Could not reach the Hub. Check your connection and try again.'
    }
    if (status === 429 || /rate_limit/.test(error.code || '')) {
        return 'Too many attempts. Wait a few minutes and try again.'
    }
    if (status >= 500) return 'Signing in is not working right now. Try again in a few minutes.'
    return 'Invalid email or password'
}

// Whether a failure was the connection rather than the Hub, from the error or
// its message. Opening the app with no signal showed "TypeError: Failed to
// fetch" and said signing out would fix it, which with no signal it cannot.
export function isConnectionError(error) {
    const text = typeof error === 'string' ? error : `${error?.name || ''} ${error?.message || ''}`
    return /failed to fetch|networkerror|load failed|AuthRetryableFetchError/i.test(text)
}
