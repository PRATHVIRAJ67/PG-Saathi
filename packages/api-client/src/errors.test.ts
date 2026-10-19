import { describe, expect, it } from 'vitest';
import { AppError, toAppError } from './errors';
import { isPrivilegedKey } from './supabase';
import { newIdempotencyKey } from './uuid';
import { queryKeys } from './react/query-keys';

describe('error mapping', () => {
  it('uses database hints and messages for business errors', () => {
    const e = toAppError({ code: 'P0001', message: 'Your Starter plan allows up to 1 properties.', hint: 'plan_limit' });
    expect(e.code).toBe('plan_limit');
    expect(e.message).toMatch(/Starter/);
  });

  it('maps SQL states to safe generic messages', () => {
    expect(toAppError({ code: '23505', message: 'duplicate key value violates unique constraint "x"' }).message).toBe(
      'This record already exists.',
    );
    expect(toAppError({ code: '42501', message: 'permission denied for table residents' }).code).toBe('forbidden');
    expect(toAppError(new Error('boom')).code).toBe('unknown');
    expect(toAppError(new AppError('validation', 'x')).code).toBe('validation');
  });
});

describe('client safety', () => {
  it('detects secret keys that must never ship to clients', () => {
    const payload = btoa(JSON.stringify({ role: 'service_role', iss: 'supabase' })).replace(/=+$/, '');
    expect(isPrivilegedKey(`eyJhbGciOiJIUzI1NiJ9.${payload}.sig`)).toBe(true);
    expect(isPrivilegedKey('sb_secret_abc')).toBe(true);
    const anon = btoa(JSON.stringify({ role: 'anon' })).replace(/=+$/, '');
    expect(isPrivilegedKey(`eyJhbGciOiJIUzI1NiJ9.${anon}.sig`)).toBe(false);
    expect(isPrivilegedKey('sb_publishable_abc')).toBe(false);
  });

  it('creates unique v4 idempotency keys', () => {
    const a = newIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newIdempotencyKey()).not.toBe(a);
  });

  it('scopes every tenant query key by tenant so switching never reuses cached data', () => {
    const a = queryKeys.residents('tenant-a', { search: 'x' });
    const b = queryKeys.residents('tenant-b', { search: 'x' });
    expect(a[0]).toBe('tenant');
    expect(a[1]).toBe('tenant-a');
    expect(b[1]).toBe('tenant-b');
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(queryKeys.tenant('tenant-a')).toEqual(['tenant', 'tenant-a']);
  });
});
