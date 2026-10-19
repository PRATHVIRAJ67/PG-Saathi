import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Settings2 } from 'lucide-react';
import { AppError } from '@pg/api-client';
import { BackendProvider } from '@pg/api-client/react';
import '@fontsource-variable/inter';
import './index.css';
import { bootBackend, type BootResult } from './app/backend';
import { AuthProvider } from './app/auth';
import { AppRoutes } from './app/router';
import { Splash } from './layout/brand';
import { TooltipProvider } from '@pg/ui-web/ui/overlays';
import { EmptyState } from '@pg/ui-web/common';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Retry only transient failures; authorisation and validation errors are final.
      retry: (count, error) => {
        if (error instanceof AppError && error.code !== 'network' && error.code !== 'unknown') return false;
        return count < 2;
      },
    },
  },
});

function Root() {
  const [boot, setBoot] = useState<BootResult | null>(null);
  const [progress, setProgress] = useState<string>('Starting…');

  useEffect(() => {
    void bootBackend(setProgress).then(setBoot);
  }, []);

  if (!boot) return <Splash message={progress} />;
  if (!boot.ok) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <EmptyState
          icon={Settings2}
          title={boot.reason === 'not_configured' ? 'This app is not configured yet' : 'The app could not start'}
          description={
            <>
              {boot.message}
              <br />
              See README.md → “Connect Supabase”.
            </>
          }
        />
      </div>
    );
  }

  return (
    <BackendProvider backend={boot.backend}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BrowserRouter>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </BrowserRouter>
          <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
        </TooltipProvider>
      </QueryClientProvider>
    </BackendProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
