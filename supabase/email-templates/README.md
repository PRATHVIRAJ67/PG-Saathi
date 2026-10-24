# Auth email templates

Branded emails for Supabase Auth. Paste each one into
**Supabase → Authentication → Emails → Templates**, choosing the template
on the left, then set its **Subject** and replace the **Message body** with
the file's contents.

| Supabase template | File | Subject |
| --- | --- | --- |
| Magic Link | `magic-link.html` | `Your PG Sathi sign-in code: {{ .Token }}` |
| Confirm signup | `confirm-signup.html` | `Confirm your email to start using PG Sathi` |
| Reset Password | `reset-password.html` | `Reset your PG Sathi password` |
| Change Email Address | `change-email.html` | `Confirm your new email for PG Sathi` |

The Magic Link email shows the 6-digit code used by "Email me a sign-in code"
and also a one-click sign-in button. The other emails use links, matching how
the apps confirm sign-ups and reset passwords.

The layout uses tables and inline styles only, so it looks the same in Gmail,
Outlook and phone mail apps. Supabase fills in `{{ .Token }}`,
`{{ .ConfirmationURL }}`, `{{ .Email }}` and `{{ .NewEmail }}`.
