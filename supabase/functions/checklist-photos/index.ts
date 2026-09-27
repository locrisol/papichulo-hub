// Deleting the checklist photos that are no longer kept, once a night.
//
// His rule, 27 September: a list keeps the photos of its last finished round
// and of the one in progress, and nothing older, so there are never two old
// rounds and a new one all holding pictures. A list done once keeps its photos
// two weeks after it finishes. A guide picture never expires while its task is
// on a list in use. And a photo taken and never submitted goes after a day.
//
// Which photos those are is the database's to say, in
// public.checklist_photos_due(), so the rule lives in one place and is written
// in SQL next to the tables it reads. This only does the part SQL cannot: a
// photo is a file as well as a row, and deleting the row from storage.objects
// leaves the file behind, which is why Supabase refuses that outright. The
// Storage API deletes both.
//
// Afterwards public.checklist_photos_removed() marks the ticks, so a tick whose
// photo was deleted says a photo was taken rather than looking as if none ever
// was.
//
// Only the schedule calls it, with the service role. Deploy it the ordinary
// way, JWT verification on:
//
//   supabase functions deploy checklist-photos
//
// and schedule it once, in the SQL editor, the same shape nearby-events uses.
// 02:30 UTC is the middle of the night in Ireland in winter and in summer.
//
// **Put the project's own address in, not <project>.** It is the
// VITE_SUPABASE_URL in .env. Scheduled with the placeholder on 27 September,
// the job was there, active, and would have posted to nowhere every night
// without a word, since pg_net keeps its failures to itself.
//
//   select cron.schedule('checklist-photos', '30 2 * * *', $$
//     select net.http_post(
//       url := 'https://<project>.supabase.co/functions/v1/checklist-photos',
//       headers := jsonb_build_object(
//         'Content-Type', 'application/json',
//         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'arena_events_key')),
//       body := '{}'::jsonb) $$);
//
// The vault secret is called arena_events_key for history's sake and is really
// the project's service key; the other two jobs read it too.
//
// tidy.js sits in this folder because only what is inside a function's own
// folder gets deployed with it.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { isServiceRole, removeAll } from './tidy.js'

const BUCKET = 'checklist-photos'

function serviceKey() {
    for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SB_SECRET_KEY']) {
        const value = Deno.env.get(name)
        if (value) return value
    }
    throw new Error('No service key. Set SUPABASE_SERVICE_ROLE_KEY in the function secrets.')
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
    if (request.method !== 'POST') return json({ error: 'Post only' }, 405)

    const secret = serviceKey()
    const bearer = request.headers.get('Authorization') || ''
    if (!isServiceRole(bearer, [secret, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')])) {
        return json({ error: 'Only the schedule runs this' }, 403)
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, secret)

    const { data: due, error: dueErr } = await admin.rpc('checklist_photos_due')
    if (dueErr) {
        console.error('checklist-photos: could not ask which photos are due', dueErr.message)
        return json({ error: dueErr.message }, 500)
    }

    const names = (due || []).map((row: unknown) => (typeof row === 'string' ? row : Object.values(row as object)[0])) as string[]
    const { gone, failed } = await removeAll(names, batch => admin.storage.from(BUCKET).remove(batch))

    let marked = 0
    if (gone.length) {
        const { data, error } = await admin.rpc('checklist_photos_removed', { names: gone })
        if (error) console.error('checklist-photos: deleted but could not mark the ticks', error.message)
        else marked = data || 0
    }

    const said = { due: names.length, deleted: gone.length, ticksMarked: marked, failed }
    console.log('checklist-photos', JSON.stringify(said))
    return json(said, failed.length ? 207 : 200)
})
