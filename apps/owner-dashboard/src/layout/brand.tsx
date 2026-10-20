import { Loader2 } from 'lucide-react';
import { cn } from '@pg/ui-web/utils';
import { PRODUCT_NAME, PgSathiMark } from '@pg/ui-web/brand';

export { PRODUCT_NAME } from '@pg/ui-web/brand';

export function LogoMark({ className }: { className?: string }) {
  return <PgSathiMark className={className} />;
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
