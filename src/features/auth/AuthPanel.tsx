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
    <form className="auth-form" onSubmit={submit}>
      {mode === 'sign_up' && <label>Display name<input required autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={80} /></label>}
      <label>Email address<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Password<input required type="password" autoComplete={mode === 'sign_up' ? 'new-password' : 'current-password'} minLength={mode === 'sign_up' ? 6 : undefined} value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'sign_up' ? 'Create account' : 'Sign in'}</button>
    </form>
    {notice && <p className="auth-notice" role="status" aria-live="polite">{notice}</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    <p className="auth-privacy">Your email stays private. Your display name may appear beside your community contributions.</p>
  </section>;
}
