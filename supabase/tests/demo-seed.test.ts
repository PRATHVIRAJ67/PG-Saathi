import { describe, expect, it } from 'vitest';
import { createDataService } from '@pg/api-client';
import { DEMO_ACCOUNT, createPgliteTransport, isDemoSeeded, seedDemoWorkspace } from '@pg/demo-db';
import { createTestBackend } from './helpers';

describe('demo seed', () => {
  it('builds a consistent sample workspace through the public API', async () => {
    const t = await createTestBackend();
    const result = await seedDemoWorkspace(t.db, t.auth);
    expect(result).not.toBeNull();
    expect(await isDemoSeeded(t.db)).toBe(true);
    expect(await seedDemoWorkspace(t.db, t.auth)).toBeNull();

    const api = createDataService(createPgliteTransport(t.db, () => result!.userId));
    const session = await t.auth.signIn({ email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
    expect(session.userId).toBe(result!.userId);

    const dash = await api.dashboard(result!.tenantId);
    expect(dash.occupancy.occupied).toBe(14);
    expect(dash.occupancy.unavailable).toBe(1);
    expect(dash.finance!.outstanding_paise).toBeGreaterThan(0);
    expect(dash.finance!.overdue_paise).toBeGreaterThan(0);
    expect(dash.finance!.series).toHaveLength(6);
    const properties = await api.listProperties(result!.tenantId);
    expect(properties).toHaveLength(2);
    const residents = await api.listResidents(result!.tenantId, { status: 'all' });
    expect(residents.total).toBe(16);
  });
});
