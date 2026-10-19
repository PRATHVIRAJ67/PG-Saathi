import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, BarChart3, BedDouble, CheckCircle2, FlaskConical, Mail, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { errorMessage } from '@pg/api-client';
import { useBackend } from '@pg/api-client/react';
import { passwordField, signInSchema, signUpSchema } from '@pg/validation';
import { Button } from '@pg/ui-web/ui/button';
import { Input } from '@pg/ui-web/ui/form-controls';
import { Field, InlineError } from '@pg/ui-web/common';
import { Logo, PRODUCT_NAME } from '@/layout/brand';
import { useZodForm } from '@/lib/form';
import { useAuth } from '@/app/auth';

const callbackUrl = () => `${window.location.origin}/auth/callback`;

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const { mode, demo } = useBackend();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(480px,560px)]">
      <aside className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} aria-hidden />
        <div className="relative flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
            <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
              <path d="M9 21V13.5L16 9l7 4.5V21" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
              <rect x="13" y="16" width="6" height="5" rx="1" fill="#8C8DF0" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight">{PRODUCT_NAME}</span>
        </div>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Run your PG like a modern business.</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-white/70">
            Rooms, residents, rent and expenses in one place. Set up in minutes — no calls, no paperwork.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-white/85">
            {[
              { icon: BedDouble, text: 'Configure any room layout, bed by bed' },
              { icon: Users, text: 'Residents, stays and deposits with full history' },
              { icon: BarChart3, text: 'Live collection, dues and occupancy figures' },
              { icon: ShieldCheck, text: 'Your data is isolated from every other business' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="size-4 text-accent-200" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-white/40">Built for PGs, hostels and co-living operators in India.</p>
      </aside>
      <main className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          {mode !== 'supabase' && demo && (
            <div className="mb-6 flex gap-2.5 rounded-lg border border-accent-200 bg-accent-50 p-3 text-[13px] text-accent-800">
              <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                <strong className="font-semibold">Demo mode.</strong> Accounts and data live only in this browser. Email verification is simulated.
              </p>
            </div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-gray-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-[13px] text-gray-500">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function SignInPage() {
  const { auth, demo } = useBackend();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [error, setError] = useState<unknown>(null);
  const form = useZodForm(signInSchema, { defaultValues: { email: '', password: '' } });
  const { register, handleSubmit, formState, setValue } = form;

  const next = params.get('next');
  const signUpHref = next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up';

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await auth.signIn(values);
      // RedirectIfSignedIn handles navigation once the session updates.
    } catch (e) {
      setError(e);
    }
  });

  if (mode === 'code') return <EmailCodeSignIn onBack={() => setMode('password')} />;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to manage your properties."
      footer={
        <>
          New to {PRODUCT_NAME}?{' '}
          <Link to={signUpHref} className="font-medium text-accent-700 hover:underline">
            Create your account
          </Link>
        </>
      }
    >
      {demo?.sampleAccount && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-3 shadow-xs">
          <p className="text-[13px] font-medium text-gray-900">Explore with sample data</p>
          <p className="mt-0.5 text-xs text-gray-500">A fictional business with two properties, residents and four months of rent.</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 w-full"
            onClick={() => {
              setValue('email', demo.sampleAccount!.email);
              setValue('password', demo.sampleAccount!.password);
              void onSubmit();
            }}
          >
            Open the sample workspace
          </Button>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={!!formState.errors.email} {...register('email')} />
        </Field>
        <Field
          label={
            <span className="flex items-center justify-between">
              Password
              <Link to="/forgot-password" className="text-xs font-normal text-accent-700 hover:underline">
                Forgot password?
              </Link>
            </span>
          }
          htmlFor="password"
          error={formState.errors.password?.message}
        >
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!formState.errors.password} {...register('password')} />
        </Field>
        <InlineError error={error} />
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          Sign in
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setMode('code')}>
          <Mail /> Email me a sign-in code instead
        </Button>
      </form>
    </AuthLayout>
  );
}

function EmailCodeSignIn({ onBack }: { onBack: () => void }) {
  const { auth } = useBackend();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  return (
    <AuthLayout title={sent ? 'Check your email' : 'Sign in with a code'} subtitle={sent ? `We sent a 6-digit code to ${email}.` : 'We’ll email you a one-time code.'}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          try {
            if (!sent) {
              if (!z.string().email().safeParse(email.trim()).success) throw new Error('Enter a valid email address.');
              await auth.sendEmailOtp(email.trim(), callbackUrl());
              setSent(true);
            } else {
              await auth.verifyEmailOtp(email.trim(), code.trim());
            }
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        {!sent ? (
          <Field label="Email" htmlFor="otp-email">
            <Input id="otp-email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        ) : (
          <Field label="Code" htmlFor="otp-code">
            <Input id="otp-code" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} className="tabular tracking-[0.3em]" maxLength={10} />
          </Field>
        )}
        {error ? <InlineError error={error instanceof Error && !('code' in error) ? { message: error.message, hint: 'validation' } : error} /> : null}
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          {sent ? 'Verify and sign in' : 'Send code'}
        </Button>
        <Button variant="ghost" className="w-full" onClick={onBack}>
          <ArrowLeft /> Use password instead
        </Button>
      </form>
    </AuthLayout>
  );
}

export function SignUpPage() {
  const { auth } = useBackend();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<unknown>(null);
  const form = useZodForm(signUpSchema, { defaultValues: { fullName: '', email: '', password: '' } });
  const { register, handleSubmit, formState } = form;
  const next = params.get('next');

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await auth.signUp({ email: values.email, password: values.password, fullName: values.fullName, redirectTo: callbackUrl() });
      if (result.needsVerification) {
        navigate(`/verify-email?email=${encodeURIComponent(values.email)}${next ? `&next=${encodeURIComponent(next)}` : ''}`);
      }
    } catch (e) {
      setError(e);
    }
  });

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start managing your PG in a few minutes. No credit card required."
      footer={
        <>
          Already have an account?{' '}
          <Link to={next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'} className="font-medium text-accent-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Your name" htmlFor="fullName" error={formState.errors.fullName?.message}>
          <Input id="fullName" autoComplete="name" autoFocus aria-invalid={!!formState.errors.fullName} {...register('fullName')} />
        </Field>
        <Field label="Work email" htmlFor="email" error={formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!formState.errors.email} {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={formState.errors.password?.message} hint="At least 8 characters.">
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.password} {...register('password')} />
        </Field>
        <InlineError error={error} />
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          Create account
        </Button>
        <p className="text-center text-xs leading-relaxed text-gray-500">We’ll send a link to verify your email before your workspace is created.</p>
      </form>
    </AuthLayout>
  );
}

export function VerifyEmailPage() {
  const { auth } = useBackend();
  const { state } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state.status === 'signed_in' && state.session.emailConfirmed) navigate(params.get('next') ?? '/app', { replace: true });
  }, [state, navigate, params]);

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={
        <>
          We sent a confirmation link to <strong className="font-medium text-gray-900">{email || 'your inbox'}</strong>. Open it on this device to continue.
        </>
      }
      footer={
        <Link to="/sign-in" className="font-medium text-accent-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-[13px] text-gray-600 shadow-xs">
        <div className="flex gap-3">
          <Mail className="mt-0.5 size-5 shrink-0 text-accent-600" aria-hidden />
          <div>
            <p>Can’t find it? Check spam or promotions, or resend the email.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              loading={busy}
              disabled={!email}
              onClick={async () => {
                setBusy(true);
                try {
                  await auth.resendVerification(email, callbackUrl());
                  toast.success('Verification email sent');
                } catch (e) {
                  toast.error(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Resend email
            </Button>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}

/** Landing page for email links (signup confirmation, magic link, recovery). */
export function AuthCallbackPage() {
  const { state } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [timedOut, setTimedOut] = useState(false);
  const errorDescription = params.get('error_description');

  useEffect(() => {
    if (state.status === 'signed_in') navigate('/app', { replace: true });
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [state, navigate]);

  return (
    <AuthLayout title={errorDescription || timedOut ? 'This link didn’t work' : 'Signing you in…'} subtitle={errorDescription ?? (timedOut ? 'The link may have expired or was already used.' : 'Just a moment.')}>
      {(errorDescription || timedOut) && (
        <Button asChild className="w-full">
          <Link to="/sign-in">Go to sign in</Link>
        </Button>
      )}
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const { auth } = useBackend();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <AuthLayout
      title="Reset your password"
      subtitle={sent ? 'If an account exists for that email, a reset link is on its way.' : 'Enter your email and we’ll send a reset link.'}
      footer={
        <Link to="/sign-in" className="font-medium text-accent-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="flex items-center gap-2 rounded-lg border border-success-100 bg-success-50 p-3 text-[13px] text-success-700">
          <CheckCircle2 className="size-4" aria-hidden /> Check your inbox.
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await auth.requestPasswordReset(email.trim(), `${window.location.origin}/reset-password`);
              setSent(true);
            } catch (err) {
              setError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Email" htmlFor="reset-email">
            <Input id="reset-email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <InlineError error={error} />
          <Button type="submit" className="w-full" size="lg" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { auth } = useBackend();
  const { state } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const valid = passwordField.safeParse(password);

  return (
    <AuthLayout title="Choose a new password" subtitle={state.status === 'signed_in' ? undefined : 'Open the reset link from your email to continue.'}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid.success) return;
          setBusy(true);
          setError(null);
          try {
            await auth.updatePassword(password);
            toast.success('Password updated');
            navigate('/app', { replace: true });
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="New password" htmlFor="new-password" hint="At least 8 characters." error={password && !valid.success ? valid.error.issues[0]?.message : undefined}>
          <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={state.status !== 'signed_in'} />
        </Field>
        <InlineError error={error} />
        <Button type="submit" className="w-full" size="lg" loading={busy} disabled={state.status !== 'signed_in' || !valid.success}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
