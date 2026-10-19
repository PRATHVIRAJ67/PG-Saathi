import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { useBackend, queryKeys } from '@pg/api-client/react';
import { Button } from '@pg/ui-web/ui/button';
import { Card } from '@pg/ui-web/ui/surfaces';
import { InlineError } from '@pg/ui-web/common';
import { Logo } from '@/layout/brand';
import { useAuth } from '@/app/auth';
import { useSessionStore } from '@/app/stores';

/** Accepts a staff or resident invitation for the signed-in user. */
export function AcceptInvitationPage() {
  const { token = '' } = useParams();
  const { data } = useBackend();
  const { state, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActiveTenant = useSessionStore((s) => s.setActiveTenant);
  const [error, setError] = useState<unknown>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    data
      .acceptInvitation(token)
      .then(async (res) => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.me() });
        if (res.kind === 'member') {
          setActiveTenant(res.tenant_id);
          navigate('/app', { replace: true });
        } else {
          navigate('/portal', { replace: true });
        }
      })
      .catch(setError);
  }, [data, token, navigate, queryClient, setActiveTenant]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-8">
        <Logo />
        <div className="mt-8 flex size-11 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
          <MailCheck className="size-5" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-gray-900">{error ? 'We couldn’t accept this invitation' : 'Accepting invitation…'}</h1>
        {error ? (
          <div className="mt-4 space-y-4">
            <InlineError error={error} />
            <p className="text-[13px] text-gray-500">
              You’re signed in as <strong>{state.status === 'signed_in' ? state.session.email : ''}</strong>. Invitations only work for the email address they were sent to.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void signOut().then(() => navigate(`/sign-in?next=/invite/${token}`))}>
                Use a different account
              </Button>
              <Button onClick={() => navigate('/app')}>Go to app</Button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-gray-500">Just a moment.</p>
        )}
      </Card>
    </div>
  );
}
