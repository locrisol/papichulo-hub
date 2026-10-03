// Gives somebody an account, Add account on Users, and changes one, Edit on
// the same page. Super admin only.
//
// Supabase sends the invite, an email with a link to choose their own
// password, so no password ever passes through a manager, a chat or this
// function. The users row that a new login gets (handle_new_user) is then given
// its name, role and restaurant, and the person on the team list it belongs to
// is linked, if one was picked. Anything failing after the login exists takes
// the login away again, so a half made account is never left behind.
//
// The link in the invite opens APP_URL, the site staff use, not the address
// it was sent from: a super admin sending from the dev server or a preview
// would otherwise give somebody a link to localhost or a Vercel login.
//
// Deploy with JWT verification on. The URL, the anon key and the service key
// are given to every function; APP_URL is the secret the mail functions use.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { callerProblem, cleanEmail, inviteProblem, updateProblem, linkSite } from './invite.js'

function serviceKey() {
    for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SB_SECRET_KEY']) {
        const value = Deno.env.get(name)
        if (value) return value
    }
    throw new Error('No service key. Set SUPABASE_SERVICE_ROLE_KEY in the function secrets.')
}

// The app is on one origin and this is on another, so a browser asks first.
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    })

// Changing an account from Users: name, email, role, restaurant and the
// person on the team it is linked to. The email is the one thing the app
// cannot write itself, so the whole change comes through here and is checked
// once (updateProblem). The email goes first, because an address already
// taken is the likeliest refusal and nothing has changed yet when it comes.
async function changeAccount(admin: any, callerId: string, body: any) {
    const id = String(body.id || '')
    const { data: current } = id
        ? await admin.from('users').select('id, role, restaurant_id').eq('id', id).maybeSingle()
        : { data: null }
    let employee = null
    if (body.employeeId) {
        const { data } = await admin
            .from('employees').select('id, restaurant_id, user_id')
            .eq('id', body.employeeId).maybeSingle()
        employee = data
    }
    const wrong = updateProblem(body, current, employee, callerId)
    if (wrong) return json({ error: wrong }, 400)

    const email = cleanEmail(body.email)
    const { data: account, error: readError } = await admin.auth.admin.getUserById(id)
    if (readError || !account?.user) return json({ error: 'That account could not be read. Try again.' }, 502)
    const emailChanged = cleanEmail(account.user.email) !== email
    if (emailChanged) {
        // Confirmed here and now: the super admin typed it, and a mail asking
        // the old address to agree would go to the inbox being left behind.
        const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true })
        if (error) {
            if (error.code === 'email_exists' || /already been registered|already exists/i.test(error.message || '')) {
                return json({ error: 'That email already has an account.' }, 409)
            }
            console.error('invite-user change', error.message)
            return json({ error: 'The email could not be changed. Try again in a few minutes.' }, 502)
        }
    }

    const { error: rowError } = await admin.from('users').update({
        full_name: String(body.fullName).trim(),
        role: body.role,
        restaurant_id: body.role === 'super_admin' ? (body.restaurantId || null) : body.restaurantId,
    }).eq('id', id)
    if (rowError) {
        console.error('invite-user change', rowError.message)
        return json({
            error: emailChanged
                ? 'The email was changed, but the rest could not be saved. Try again.'
                : 'That could not be saved. Try again.',
        }, 500)
    }

    // The link follows the pick: whoever was linked and is not picked any
    // more is unlinked, which is what a move to another restaurant means, and
    // the pick is linked if nobody has them.
    const { data: linked } = await admin.from('employees').select('id').eq('user_id', id)
    const was = (linked || []).map((e: { id: string }) => e.id)
    const unlink = was.filter((e: string) => e !== body.employeeId)
    if (unlink.length) {
        const { error } = await admin.from('employees').update({ user_id: null }).in('id', unlink)
        if (error) return json({ error: 'Saved, but the link to the team could not be changed. Try again.' }, 500)
    }
    if (body.employeeId && !was.includes(body.employeeId)) {
        const { data: now, error } = await admin
            .from('employees').update({ user_id: id })
            .eq('id', body.employeeId).is('user_id', null)
            .select('id')
        if (error || !now?.length) return json({ error: 'Saved, but that person could not be linked. Try again.' }, 500)
    }
    return json({ id, emailChanged })
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (request.method !== 'POST') return json({ error: 'Post only' }, 405)

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, serviceKey())

    // ---------- who is calling ----------
    // Their own token, read with the anon key, so this is the person the app
    // says it is and not whoever typed an id into the request.
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!, {
        global: { headers: { Authorization: request.headers.get('Authorization') || '' } },
    })
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return json({ error: 'Not signed in' }, 401)

    const { data: me } = await admin
        .from('users').select('id, role, is_active')
        .eq('id', user.id).maybeSingle()
    const refused = callerProblem(me)
    if (refused) return json({ error: refused }, 403)

    // ---------- what they asked for ----------
    let body: { action?: string, id?: string, fullName?: string, email?: string, role?: string, restaurantId?: string | null, employeeId?: string | null, origin?: string }
    try {
        body = await request.json()
    } catch {
        return json({ error: 'That request could not be read.' }, 400)
    }

    // Edit on Users, on an account that exists. Everything else is an invite.
    if (body.action === 'update') return await changeAccount(admin, user.id, body)

    let employee = null
    if (body.employeeId) {
        const { data } = await admin
            .from('employees').select('id, restaurant_id, user_id')
            .eq('id', body.employeeId).maybeSingle()
        employee = data
    }
    const wrong = inviteProblem(body, employee)
    if (wrong) return json({ error: wrong }, 400)

    const email = cleanEmail(body.email)
    const fullName = String(body.fullName).trim()
    const site = linkSite(Deno.env.get('APP_URL') || body.origin || request.headers.get('Origin'))

    // ---------- the invite ----------
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        ...(site ? { redirectTo: site } : {}),
    })
    if (inviteError || !invited?.user) {
        if (inviteError?.code === 'email_exists' || /already been registered|already exists/i.test(inviteError?.message || '')) {
            return json({ error: 'That email already has an account.' }, 409)
        }
        console.error('invite-user', inviteError?.message)
        return json({ error: 'The invite could not be sent. Try again in a few minutes.' }, 502)
    }
    const id = invited.user.id
    // Supabase sends a second invite to somebody invited before who never
    // opened it, and hands back that same account. Only an account this call
    // made may be taken away if what follows fails.
    const made = Date.now() - Date.parse(invited.user.created_at || '') < 60_000

    // ---------- the row and the link ----------
    // An upsert, so it works whether handle_new_user has made the row yet or
    // not. password_set_at is left alone: the guard keeps it empty until they
    // choose their password from the email.
    const { error: rowError } = await admin.from('users').upsert({
        id,
        full_name: fullName,
        role: body.role,
        restaurant_id: body.role === 'super_admin' ? (body.restaurantId || null) : body.restaurantId,
        is_active: true,
    })

    let linkError = null
    if (!rowError && body.employeeId) {
        const { data: linked, error } = await admin
            .from('employees').update({ user_id: id })
            .eq('id', body.employeeId).is('user_id', null)
            .select('id')
        linkError = error || (linked?.length ? null : { message: 'linked by somebody else meanwhile' })
    }

    if (rowError || linkError) {
        console.error('invite-user', (rowError || linkError)?.message)
        if (!made) return json({ error: 'The invite went, but the account could not be updated. Try again.' }, 500)
        // The email has gone, and its link now leads to "this link has expired".
        const { error: undoError } = await admin.auth.admin.deleteUser(id)
        if (undoError) console.error('invite-user could not take back', id, undoError.message)
        return json({ error: 'The account could not be set up, so it was taken away again. Try again.' }, 500)
    }

    return json({ id })
})
