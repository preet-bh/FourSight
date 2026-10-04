import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { AuthApi, AuthRole, AuthState } from '../../platform/contracts';
import { supabase } from '../../platform/backend';

const roles = new Set<AuthRole>(['resident', 'city_admin', 'moderator']);

export function validateEmail(email: string): boolean {
  const value = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requiredClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) throw new Error('Account access is not configured. Please try again later.');
  return client;
}

async function stateForUser(client: SupabaseClient, user: User | null): Promise<AuthState> {
  if (!user) return { status: 'signed_out', user: null };

  let displayName = typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : '';
  let role: AuthRole = 'resident';
  try {
    const { data } = await client.from('profiles').select('display_name, role').eq('id', user.id).maybeSingle();
    if (typeof data?.display_name === 'string' && data.display_name.trim()) displayName = data.display_name.trim();
    if (typeof data?.role === 'string' && roles.has(data.role as AuthRole)) role = data.role as AuthRole;
  } catch {
    // The protected profile is authoritative. If it cannot be read, use resident access.
  }

  return {
    status: 'signed_in',
    user: { id: user.id, displayName: displayName.trim() || 'Community member', role },
  };
}

export function createAuthApi(client: SupabaseClient | null = supabase): AuthApi {
  return {
    async getState() {
      const configured = requiredClient(client);
      const { data, error } = await configured.auth.getSession();
      if (error) throw error;
      return stateForUser(configured, data.session?.user ?? null);
    },

    subscribe(listener) {
      if (!client) {
        listener({ status: 'signed_out', user: null });
        return () => undefined;
      }

      let active = true;
      let revision = 0;
      const emit = async (user: User | null) => {
        const currentRevision = ++revision;
        const state = await stateForUser(client, user);
        if (active && currentRevision === revision) listener(state);
      };
      void client.auth.getSession().then(({ data }) => emit(data.session?.user ?? null)).catch(() => {
        if (active) listener({ status: 'signed_out', user: null });
      });
      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        // Defer profile I/O until Supabase finishes its auth callback and releases its lock.
        queueMicrotask(() => { void emit(session?.user ?? null); });
      });
      return () => {
        active = false;
        subscription.unsubscribe();
      };
    },

    async signUp(input) {
      const displayName = input.displayName.trim();
      if (!displayName) throw new Error('Enter your display name.');
      if (!validateEmail(input.email)) throw new Error('Enter a valid email address.');
      if (!input.password) throw new Error('Enter a password.');
      const { error } = await requiredClient(client).auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: { data: { display_name: displayName } },
      });
      if (error) throw error;
      return { confirmationRequired: true };
    },

    async signIn(input) {
      if (!validateEmail(input.email)) throw new Error('Enter a valid email address.');
      if (!input.password) throw new Error('Enter your password.');
      const { error } = await requiredClient(client).auth.signInWithPassword({ email: input.email.trim(), password: input.password });
      if (error) throw error;
    },

    async signOut() {
      const { error } = await requiredClient(client).auth.signOut();
      if (error) throw error;
    },
  };
}

export const authApi = createAuthApi();
