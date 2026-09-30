import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { photoPath } from '@/lib/photo'

// What supabase/schema.sql must hold that no comparison with live can catch.
//
// The fold is checked by dumping live and a database built from the file and
// comparing them object by object. Both dumps cover public, so anything the
// design puts on a table outside it is invisible to that check, and the two
// triggers on auth.users went missing in the September rewrite without it
// saying a word. Live kept them; a new database, a restore or db:local would
// not have had them.
const schema = readFileSync('supabase/schema.sql', 'utf8')

describe('a database built from schema.sql', () => {
    // Without it a new login has no users row, so get_my_role() is null, every
    // policy refuses them, and they see "Your login is switched off" with no
    // row on the Users page for anybody to give a role to.
    it('gives a new login its users row', () => {
        expect(schema).toContain(
            'CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" '
            + 'FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();',
        )
    })

    // Before, not after. The users row points at the login, and the check on
    // that key would refuse the delete before an after trigger could clear it.
    it('takes the users row away before the login goes', () => {
        expect(schema).toContain(
            'CREATE OR REPLACE TRIGGER "on_auth_user_deleted" BEFORE DELETE ON "auth"."users" '
            + 'FOR EACH ROW EXECUTE FUNCTION "public"."handle_delete_user"();',
        )
    })
})

describe('the nightly photo job', () => {
    // It keeps a photo while its round is open, and finds the round from the
    // third folder of the path. Pinned against where the app puts the photo,
    // so the round cannot move in the path without a test saying the job
    // would then delete photos still waiting to be submitted. Live would agree
    // with the file either way, so no comparison would notice.
    it('keeps an open round\'s photos, looking for the round where the app puts it', () => {
        const round = 'b3f1c2d4-0000-4000-8000-000000000001'
        expect(photoPath('R1', 'round', round).split('/')[2]).toBe(round)

        const due = schema.slice(schema.indexOf('function public.checklist_photos_due()'))
        expect(due.slice(0, due.indexOf('$$;')))
            .toMatch(/r\.id::text = split_part\(o\.name, '\/', 3\)\s+and r\.ended_at is null/)
    })
})
