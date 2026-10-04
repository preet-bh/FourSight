import { useEffect, useState, type FormEvent } from 'react';
import type { AuthApi, AuthState } from '../../platform/contracts';
import './auth.css';

type AuthPanelProps = { authApi: AuthApi };
type Mode = 'sign_in' | 'sign_up';

export default function AuthPanel({ authApi }: AuthPanelProps) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });
  const [mode, setMode] = useState<Mode>('sign_in');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = authApi.subscribe(next => { if (active) setState(next); });
    return () => { active = false; unsubscribe(); };
  }, [authApi]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice('');
    setError('');
    setBusy(true);
    try {
      if (mode === 'sign_up') {
        await authApi.signUp({ displayName, email, password });
        setNotice('Check your email for a confirmation link. Open the link to activate your account, then sign in here.');
        setPassword('');
      } else {
        await authApi.signIn({ email, password });
        setPassword('');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Account access could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setError('');
    try { await authApi.signOut(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not sign out. Please try again.'); }
  };

  const signInWithGoogle = async () => {
    setNotice('');
    setError('');
    setBusy(true);
    try {
      await authApi.signInWithGoogle();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Google sign-in could not be started. Please try again.');
      setBusy(false);
    }
  };

  if (state.status === 'loading') return <section className="auth-panel" aria-busy="true"><p role="status">Checking your account…</p></section>;
  if (state.status === 'signed_in' && state.user) return <section className="auth-panel auth-session" aria-label="Account">
    <div className="auth-session-avatar" aria-hidden="true">{state.user.displayName.slice(0, 1).toUpperCase()}</div>
    <div className="auth-session-copy"><strong>{state.user.displayName}</strong><span>{state.user.role === 'resident' ? 'Community member' : state.user.role === 'city_admin' ? 'City administrator' : 'Moderator'}</span></div>
    <button className="auth-secondary" type="button" onClick={signOut}>Sign out</button>
    {error && <p className="auth-error" role="alert">{error}</p>}
  </section>;

  return <section className="auth-panel" aria-labelledby="auth-heading">
    <header className="auth-heading">
      <span className="auth-eyebrow">YOUR FOUR SIGHT ACCOUNT</span>
      <h2 id="auth-heading">{mode === 'sign_up' ? 'Join your community' : 'Welcome back'}</h2>
      <p>{mode === 'sign_up' ? 'Create an account to report issues and join local conversations.' : 'Sign in to report issues and join local conversations.'}</p>
    </header>
    <div className="auth-mode-switch" aria-label="Account access">
      <button type="button" aria-pressed={mode === 'sign_in'} onClick={() => { setMode('sign_in'); setNotice(''); setError(''); }}>Sign in</button>
      <button type="button" aria-pressed={mode === 'sign_up'} onClick={() => { setMode('sign_up'); setNotice(''); setError(''); }}>Create account</button>
    </div>
    <button className="auth-google" type="button" onClick={() => void signInWithGoogle()} disabled={busy}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.24c0-.71-.06-1.4-.19-2.06H12v3.9h5.24a4.48 4.48 0 0 1-1.94 2.94v2.44h3.14c1.84-1.7 2.91-4.21 2.91-7.22Z"/><path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.29l-3.14-2.44c-.87.58-1.98.93-3.31.93a5.96 5.96 0 0 1-5.6-4.13H3.16v2.52A9.75 9.75 0 0 0 12 21.75Z"/><path fill="#FBBC05" d="M6.4 13.82a5.86 5.86 0 0 1 0-3.64V7.66H3.16a9.75 9.75 0 0 0 0 8.68l3.24-2.52Z"/><path fill="#EA4335" d="M12 6.05c1.43 0 2.71.49 3.72 1.45l2.79-2.79A9.36 9.36 0 0 0 12 2.25a9.75 9.75 0 0 0-8.84 5.41l3.24 2.52A5.96 5.96 0 0 1 12 6.05Z"/></svg>
      Continue with Google
    </button>
    <div className="auth-divider"><span>or use email and password</span></div>
    <form className="auth-form" onSubmit={submit}>
      {mode === 'sign_up' && <label>Display name<input required autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={80} /></label>}
      <label>Email address<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Password<input required type="password" autoComplete={mode === 'sign_up' ? 'new-password' : 'current-password'} minLength={mode === 'sign_up' ? 6 : undefined} value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'sign_up' ? 'Create account' : 'Sign in'}</button>
    </form>
    {notice && <p className="auth-notice" role="status" aria-live="polite">{notice}</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    <p className="auth-privacy">Your email stays private. Your name may appear beside your community contributions.</p>
  </section>;
}
