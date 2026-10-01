import { paperApi } from '@/features/paper/api';
import { apiClient } from '@/services/api/client';
import { ApiError } from '@/types/api';

import { isServerOutdated, requireFields, SERVER_OUTDATED } from '../contract';

jest.mock('@/services/api/client', () => ({ apiClient: { get: jest.fn() } }));

const get = apiClient.get as jest.Mock;

describe('requireFields', () => {
  it('passes a response that carries every field through untouched', () => {
    const data = { wallet: { value: 1 }, segments: [] as unknown[] };
    expect(requireFields(data, ['wallet', 'segments'], 'Paper trading')).toBe(data);
  });

  it('refuses a missing or null field as a non-retried SERVER_OUTDATED error', () => {
    const data = { wallet: null, segments: [] } as { wallet: unknown; segments: unknown[] };
    let thrown: unknown;
    try {
      requireFields(data, ['wallet', 'segments'], 'Paper trading');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({ status: 426, code: SERVER_OUTDATED });
    expect((thrown as ApiError).message).toMatch(/^Paper trading needs a newer server/);
    expect(isServerOutdated(thrown)).toBe(true);
  });

  it('refuses a body that is not an object at all', () => {
    expect(() => requireFields(null as unknown as { wallet: unknown }, ['wallet'], 'X')).toThrow(
      ApiError,
    );
  });

  it('tells a server-version mismatch apart from other errors', () => {
    expect(isServerOutdated(new ApiError({ status: 404, code: 'NOT_FOUND', message: 'x' }))).toBe(
      false,
    );
    expect(isServerOutdated(new Error('x'))).toBe(false);
  });
});

describe('paper API against an older server', () => {
  beforeEach(() => get.mockReset());

  it('refuses the per-segment account overview instead of handing it to the screens', async () => {
    // The pre-2026-09-30 shape: `combined` + per-segment pools, no `wallet`.
    get.mockResolvedValue({ data: { combined: { equity: 1_000_000 }, segments: [] } });
    await expect(paperApi.segments()).rejects.toMatchObject({ code: SERVER_OUTDATED });
  });

  it('refuses the per-pool wallet', async () => {
    get.mockResolvedValue({ data: { profileId: 'p', pools: [], changes: [], total: 0 } });
    await expect(paperApi.wallet()).rejects.toMatchObject({ code: SERVER_OUTDATED });
  });

  it('passes the one-wallet overview', async () => {
    const data = { wallet: { positionCount: 0 }, segments: [], marketOpen: false, caveats: [] };
    get.mockResolvedValue({ data });
    await expect(paperApi.segments()).resolves.toBe(data);
  });
});
