# The emails Supabase Auth sends

These are pasted into the dashboard by hand: Authentication, Emails,
Templates. They are kept here so the wording and the look have a history, and
so the next change starts from what is live.

They share the roster emails' look (cream ground, white card no wider than a
phone, the green PAPI CHULO band, a button made from a table cell), which is
proven in the Gmail app on Android in light and dark mode. No long address is
printed in the text: anything unbreakable wider than a phone makes the Gmail
app shrink every box.

| File | Template in the dashboard | Subject |
|---|---|---|
| `invite.html` | Invite user | Your Papi Chulo Hub account |
| `recovery.html` | Reset password | Choose a new password for the Papi Chulo Hub |
| `password_changed.html` | Security notifications, Password changed (turn it on) | Your Papi Chulo Hub password was changed |
| `reauthentication.html` | Reauthentication | Your Papi Chulo Hub code |

Confirm signup, Magic link and Change email are not used, since signing up is
off. Leave them.

## Where the links go

The app passes its own address as `redirectTo` (`window.location.origin`), and
the templates add `/set-password` and the token after a `#`, so the token never
reaches a server log and the page only uses it when Save is pressed. An invite
or reset sent from the dashboard has the Site URL as its `{{ .RedirectTo }}`.
Site URL must have no slash at the end.

## The dashboard settings that go with them

In this order. Migration 035 goes after step 3: from then on everybody is asked
to choose a password, and anybody whose session is over a day old is emailed a
link to do it.

1. Emails, SMTP Settings: custom SMTP on. Host `smtp.gmail.com`, port `465`,
   user `hub@papichulo.ie`, a second app password on that account named
   "Supabase Auth", sender `hub@papichulo.ie`, name `Papi Chulo Hub`. The
   built in mailer only sends to members of the Supabase team, two an hour, so
   without this staff get nothing.
2. Templates: the four above.
3. Run migration 035.
4. Sign In / Providers, Email: turn on Secure password change and Require
   current password when changing password. Minimum password length 12,
   password requirements none. Leave signups off.
5. Deploy the invite-user function. Its links open APP_URL, the secret the
   mail functions already have, so an invite sent from the dev server still
   points staff at the real site.
6. URL Configuration: leave the Site URL and the Redirect URLs as they are.
   While trying it on a phone against the dev server, add the laptop's
   address with `:5173` and take it out afterwards.
