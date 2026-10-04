import type { AuthApi, AuthState } from '../platform/contracts';

export function subscribeToAuthState(
  authApi: Pick<AuthApi, 'subscribe'>,
  backendConfigured: boolean,
  listener: (state: AuthState) => void,
): () => void {
  if (!backendConfigured) return () => undefined;
  return authApi.subscribe(listener);
}
