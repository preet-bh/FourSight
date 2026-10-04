import { describe, expect, it, vi } from 'vitest';
import { createAuthApi, validateEmail } from './auth-service';

function makeClient(overrides: Record<string, unknown> = {}) {
  const auth = {
    signUp: vi.fn(async () => ({ data: { user: { id: 'user-1' }, session: null }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { user: { id: 'user-1' }, session: {} }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    ...((overrides.auth as object | undefined) ?? {}),
  };
  const profileQuery = {
    select: vi.fn(() => profileQuery),
    eq: vi.fn(() => profileQuery),
    maybeSingle: vi.fn(async () => ({ data: { display_name: 'Ada Resident', role: 'resident' }, error: null })),
    ...((overrides.profileQuery as object | undefined) ?? {}),
  };
  const client = {
    auth,
    from: vi.fn(() => profileQuery),
    ...((overrides.client as object | undefined) ?? {}),
  };
  return { client, auth, profileQuery };
}

describe('auth service', () => {
  it('validates email syntax before sending signup requests', async () => {
    expect(validateEmail('resident@example.org')).toBe(true);
    expect(validateEmail('not-an-email')).toBe(false);

    const { client, auth } = makeClient();
    const api = createAuthApi(client as never);
    await expect(api.signUp({ displayName: 'Ada', email: 'not-an-email', password: 'long-enough-password' })).rejects.toThrow(/email/i);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('sends only the display name as signup metadata and requires email confirmation', async () => {
    const { client, auth } = makeClient();
    const api = createAuthApi(client as never);

    await expect(api.signUp({ displayName: 'Ada Resident', email: 'ada@example.org', password: 'correct-horse-battery' }))
      .resolves.toEqual({ confirmationRequired: true });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'ada@example.org',
      password: 'correct-horse-battery',
      options: { data: { display_name: 'Ada Resident' } },
    });
  });

  it('maps a confirmed session using the protected profile role lookup', async () => {
    const { client, profileQuery } = makeClient({ auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'staff-1', user_metadata: { display_name: 'Morgan', role: 'city_admin' } } } }, error: null })),
    }, profileQuery: {
      maybeSingle: vi.fn(async () => ({ data: { display_name: 'Morgan City', role: 'moderator' }, error: null })),
    } });
    const api = createAuthApi(client as never);

    await expect(api.getState()).resolves.toEqual({
      status: 'signed_in',
      user: { id: 'staff-1', displayName: 'Morgan City', role: 'moderator' },
    });
    const state = await api.getState();
    expect(state.user).not.toHaveProperty('email');
    expect(client.from).toHaveBeenCalledWith('profiles');
    expect(profileQuery.select).toHaveBeenCalledWith('display_name, role');
    expect(profileQuery.eq).toHaveBeenCalledWith('id', 'staff-1');
  });

  it('defaults an unknown or unavailable protected role to resident', async () => {
    const { client } = makeClient({ auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1', user_metadata: { role: 'city_admin', display_name: 'Ari' } } } }, error: null })),
    }, profileQuery: { maybeSingle: vi.fn(async () => ({ data: null, error: new Error('profile unavailable') })) } });
    const api = createAuthApi(client as never);

    await expect(api.getState()).resolves.toMatchObject({
      status: 'signed_in',
      user: { id: 'user-1', displayName: 'Ari', role: 'resident' },
    });
  });

  it('observes auth changes and stops notifying after unsubscribe', async () => {
    let onChange: ((event: string, session: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    const { client } = makeClient({
      auth: {
        onAuthStateChange: vi.fn((callback: (event: string, session: unknown) => void) => {
          onChange = callback;
          return { data: { subscription: { unsubscribe } } };
        }),
      },
    });
    const api = createAuthApi(client as never);
    const listener = vi.fn();
    const stop = api.subscribe(listener);
    await new Promise(resolve => setTimeout(resolve, 0));
    onChange?.('SIGNED_IN', { user: { id: 'user-1', user_metadata: { display_name: 'Ada' } } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(listener).toHaveBeenLastCalledWith({ status: 'signed_in', user: { id: 'user-1', displayName: 'Ada Resident', role: 'resident' } });

    stop();
    onChange?.('SIGNED_OUT', null);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('signs out through Supabase Auth', async () => {
    const { client, auth } = makeClient();
    await createAuthApi(client as never).signOut();
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
});
