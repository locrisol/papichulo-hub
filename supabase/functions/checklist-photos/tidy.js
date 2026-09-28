// The parts of the nightly photo job that are sums rather than calls, kept
// apart so they can be tested from the app like email.js next door.

// How many paths the Storage API is handed at once. It takes a list, and a
// list of a thousand in one request is one failure away from deleting none of
// them and saying nothing about which.
export const BATCH = 100

export function batches(names, size = BATCH) {
    const out = []
    for (let i = 0; i < names.length; i += size) out.push(names.slice(i, i + size))
    return out
}

// The token's own role, read from its payload. Supabase checks the signature
// before any of this runs, so this is reading a fact, not taking a claim. The
// same as nearby-events: see the long note on isServiceRole there for why the
// key is not simply compared with this function's own.
export function roleOf(token) {
    const middle = String(token || '').split('.')[1]
    if (!middle) return null
    try {
        const padded = middle.replace(/-/g, '+').replace(/_/g, '/')
        return JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)))?.role || null
    } catch {
        return null
    }
}

export function isServiceRole(bearer, keys = []) {
    const token = String(bearer || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return false
    if (keys.filter(Boolean).includes(token)) return true
    return roleOf(token) === 'service_role'
}

// Deletes every batch, and says which went and which did not. A batch that
// fails is left for tomorrow night rather than stopping the rest: the database
// still lists those photos as due, so they come round again.
export async function removeAll(names, remove) {
    const gone = []
    const failed = []
    for (const batch of batches(names)) {
        const { error } = await remove(batch)
        if (error) failed.push({ count: batch.length, error: error.message || String(error) })
        else gone.push(...batch)
    }
    return { gone, failed }
}
