import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, LogOut, Mail, MapPin, Settings } from 'lucide-react';
import type { AuthApi } from '../../platform/contracts';
import { validateEmail } from './auth-service';
import './account-settings.css';

type AccountSettingsProps = {
  authApi: AuthApi;
  signedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onBack: () => void;
};

export default function AccountSettings({
  authApi,
  signedIn,
  onSignIn,
  onSignOut,
  onBack,
}: AccountSettingsProps) {
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!signedIn) {
      setCurrentEmail(null);
      setEmail('');
      return;
    }

    let active = true;
    setError('');
    setLoadingEmail(true);
    void authApi.getEmail().then(value => {
      if (!active) return;
      setCurrentEmail(value);
      setEmail('');
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load your account email.');
    }).finally(() => {
      if (active) setLoadingEmail(false);
    });

    return () => { active = false; };
  }, [authApi, signedIn]);

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const nextEmail = email.trim();
    if (!validateEmail(nextEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (nextEmail.toLowerCase() === currentEmail?.toLowerCase()) {
      setError('Enter an email address different from your current one.');
      return;
    }

    setBusy(true);
    try {
      await authApi.updateEmail(nextEmail);
      setNotice('Email change requested. Check the new address for a confirmation link; the change takes effect after confirmation.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update your email. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setError('');
    setSigningOut(true);
    try {
      await authApi.signOut();
      onSignOut();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return <section className="account-settings subpage" aria-labelledby="account-settings-title">
    <header className="page-heading">
      <div>
        <div className="eyebrow">PREFERENCES & ACCOUNT</div>
        <h1 id="account-settings-title">Settings</h1>
        <p>Manage your FourSight account.</p>
      </div>
      <button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={15}/>Back to map</button>
    </header>

    <section className="settings-card" aria-labelledby="region-setting-title">
      <div className="settings-card-icon"><MapPin size={17}/></div>
      <div className="settings-card-content">
        <h2 id="region-setting-title">Dearborn community board</h2>
        <p>Reports and discussions are focused on Dearborn, Michigan.</p>
      </div>
    </section>

    <section className="settings-card" aria-labelledby="email-setting-title">
      <div className="settings-card-icon"><Mail size={17}/></div>
      <div className="settings-card-content">
        <h2 id="email-setting-title">Account email</h2>
        {signedIn ? <>
          <p>Your email is private and is not shown on community reports or posts.</p>
          <form className="settings-email-form" onSubmit={submitEmail}>
            <label className="settings-field">Current email
              <input type="email" value={currentEmail ?? ''} placeholder={loadingEmail ? 'Loading email…' : 'Email unavailable'} readOnly aria-busy={loadingEmail}/>
            </label>
            <label className="settings-field">New email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
                disabled={loadingEmail || busy}
              />
            </label>
            <button className="primary-button" type="submit" disabled={loadingEmail || busy || !currentEmail}>
              {busy ? 'Sending confirmation…' : 'Change email'}
            </button>
          </form>
        </> : <>
          <p>Sign in to view or change the email associated with your account.</p>
          <button type="button" className="secondary-button" onClick={onSignIn}>Sign in</button>
        </>}
      </div>
    </section>

    {error && <p className="settings-message error" role="alert">{error}</p>}
    {notice && <p className="settings-message success" role="status" aria-live="polite">{notice}</p>}

    <section className="settings-card settings-account-actions" aria-labelledby="account-actions-title">
      <div className="settings-card-icon"><Settings size={17}/></div>
      <div className="settings-card-content">
        <h2 id="account-actions-title">Account access</h2>
        <p>{signedIn ? 'You are signed in. Sign out when you are finished using this device.' : 'You are browsing as a guest or in local demo mode.'}</p>
        {signedIn && <button type="button" className="secondary-button" onClick={() => void signOut()} disabled={signingOut}>
          <LogOut size={15}/>{signingOut ? 'Signing out…' : 'Sign out'}
        </button>}
      </div>
    </section>
  </section>;
}
