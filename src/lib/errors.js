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
    // Supabase reports an RLS refusal on insert with this code.
    'PGRST301': 'You do not have permission to do that.',
    // Unique constraint. The caller usually knows which one, so this is a
    // fallback for when it does not.
    '23505': 'That already exists.',
    // Foreign key. Something is pointing at a row that is not there, or you
    // are deleting something still in use.
    '23503': 'Something else is still using that, so it cannot be removed.',
    // Not null.
    '23502': 'Something required was left empty.',
    // Check constraint.
    '23514': 'That value is not one this field accepts.',
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

export function friendlyError(error) {
    if (!error) return ''

    if (error.code && BY_CODE[error.code]) return BY_CODE[error.code]

    const text = (error.message || String(error)).toLowerCase()
    for (const [phrase, message] of BY_TEXT) {
        if (text.includes(phrase)) return message
    }

    // Something we have not seen. The raw message is more use than a shrug.
    return error.message || 'Something went wrong.'
}

// Whether this was a permission refusal, so a screen can react rather than just
// report. The weekly sales grid uses it to throw away a draft the database will
// never accept.
export function isPermissionError(error) {
    if (!error) return false
    if (error.code === '42501' || error.code === 'PGRST301') return true
    return (error.message || '').toLowerCase().includes('violates row-level security')
}