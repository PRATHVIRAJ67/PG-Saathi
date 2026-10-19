import { Loader2 } from 'lucide-react';
import { cn } from '@pg/ui-web/utils';

export const PRODUCT_NAME = 'Staywise';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#14213D" />
      <path d="M9 21V13.5L16 9l7 4.5V21" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
      <rect x="13" y="16" width="6" height="5" rx="1" fill="#5B5CE2" />
    </svg>
  );
}

export function Logo({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      {!collapsed && <span className="text-[15px] font-semibold tracking-tight text-gray-900">{PRODUCT_NAME}</span>}
    </span>
  );
}

export function Splash({ message }: { message?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background" role="status" aria-live="polite">
      <LogoMark className="size-10" />
      <div className="flex items-center gap-2 text-[13px] text-gray-500">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {message ?? 'Loading…'}
      </div>
    </div>
  );
}
