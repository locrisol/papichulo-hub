import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

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
