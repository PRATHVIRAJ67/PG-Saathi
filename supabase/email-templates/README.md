# Auth email templates

Branded emails for Supabase Auth. Paste each one into
**Supabase → Authentication → Emails → Templates**, choosing the template
on the left, then set its **Subject** and replace the **Message body** with
the file's contents.

| Supabase template | File | Subject |
| --- | --- | --- |
| Magic Link | `magic-link.html` | `Your PG Sathi sign-in code: {{ .Token }}` |
| Confirm signup | `confirm-signup.html` | `Your PG Sathi verification code: {{ .Token }}` |
| Reset Password | `reset-password.html` | `Your PG Sathi password reset code: {{ .Token }}` |
| Change Email Address | `change-email.html` | `Confirm your new email for PG Sathi` |

Sign-in, sign-up and password reset use 6-digit codes only, with no links.
Email services with click tracking (Brevo rewrites every link) can open a
one-time link before the person does, which makes Supabase report it as
expired; the code and the link share one token, so the link must not be in
the email at all. The owner dashboard has a code box on the sign-in, verify
email and forgot password pages. Change email still uses a link (there is no
change-email screen in the apps).

The layout uses tables and inline styles only, so it looks the same in Gmail,
Outlook and phone mail apps. Supabase fills in `{{ .Token }}`,
`{{ .ConfirmationURL }}`, `{{ .Email }}` and `{{ .NewEmail }}`.
