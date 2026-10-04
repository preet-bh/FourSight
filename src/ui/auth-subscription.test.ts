import { describe, expect, it, vi } from 'vitest';
import type { AuthApi, AuthState } from '../platform/contracts';
import { subscribeToAuthState } from './auth-subscription';

describe('auth state subscription mode', () => {
  it('does not let an unconfigured backend replace the local demo resident', () => {
    const subscribe = vi.fn<AuthApi['subscribe']>((listener) => {
      listener({ status: 'signed_out', user: null });
      return () => undefined;
    });
    const authApi = { subscribe } as unknown as AuthApi;
    const listener = vi.fn<(state: AuthState) => void>();

    const unsubscribe = subscribeToAuthState(authApi, false, listener);

    expect(subscribe).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('subscribes when Supabase is configured', () => {
    const unsubscribe = vi.fn();
    const authApi = { subscribe: vi.fn(() => unsubscribe) } as unknown as AuthApi;
    const listener = vi.fn<(state: AuthState) => void>();

    expect(subscribeToAuthState(authApi, true, listener)).toBe(unsubscribe);
    expect(authApi.subscribe).toHaveBeenCalledWith(listener);
  });
});
