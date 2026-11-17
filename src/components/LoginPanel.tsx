import { useState, useEffect } from 'react';
import { FEATURES } from '../../core/feature-flags.js';
import { LetterbirdForm } from './LetterbirdForm.jsx';
import './LoginPanel.css';

/**
 * LoginPanel — Self-contained auth panel (sign-in, sign-up, offline mode).
 * When the SIGNUPS feature flag is off, the sign-up tab becomes
 * "Request Access" and shows a contact form instead.
 *
 * Props:
 *   onAuthSuccess  — () => void  called when auth is complete
 *   initialView    — 'signin' | 'signup'  optional; allows parent to switch views
 */
export function LoginPanel({ onAuthSuccess, initialView }: any) {
  const [view, setView] = useState(initialView || 'signin');
  const [signinEmail, setSigninEmail] = useState('');
  const [signinPass, setSigninPass] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPass, setSignupPass] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signinMsg, setSigninMsg] = useState({ text: '', type: '' });
  const [signupMsg, setSignupMsg] = useState({ text: '', type: '' });
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [showGalaxyChoice, setShowGalaxyChoice] = useState(false);

  // Detect offline mode on mount
  useEffect(() => {
    (async () => {
      const { dataBridge } = await import('../../core/data-bridge.js');
      setIsOfflineMode(dataBridge.offlineMode);
    })();
  }, []);

  // Sync view when parent changes initialView (e.g. CTA "Sign Up" button)
  useEffect(() => {
    if (initialView && initialView !== view) {
      setView(initialView);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialView]);

  const handleSignIn = async () => {
    if (!signinEmail || !signinPass) {
      setSigninMsg({ text: 'Please fill all fields', type: 'err' });
      return;
    }
    setSigninMsg({ text: 'Signing in...', type: 'ok' });
    const { dataBridge } = await import('../../core/data-bridge.js');
    const result = await dataBridge.signIn(signinEmail, signinPass);
    if (result.success) {
      onAuthSuccess();
    } else {
      setSigninMsg({ text: result.error || 'Sign in failed', type: 'err' });
    }
  };

  const handleSignUp = async () => {
    if (!signupEmail || !signupPass || !signupName) {
      setSignupMsg({ text: 'Please fill all fields', type: 'err' });
      return;
    }
    setSignupMsg({ text: 'Creating account...', type: 'ok' });
    const { dataBridge } = await import('../../core/data-bridge.js');
    const result = await dataBridge.signUp(signupEmail, signupPass, signupName);
    if (result.success) {
      onAuthSuccess();
    } else {
      setSignupMsg({ text: result.error || 'Sign up failed', type: 'err' });
    }
  };

  const handleGalaxyChoice = async (useConsistentId: any) => {
    const { dataBridge } = await import('../../core/data-bridge.js');
    const playerId = useConsistentId ? 'dev-player' : `dev-${Date.now()}`;
    dataBridge.currentPlayer = { id: playerId, email: 'dev@local' };
    onAuthSuccess();
  };

  if (showGalaxyChoice) {
    return (
      <div className="lp-box">
        <div className="lp-galaxy-choice">
          <h3>Choose Your Galaxy</h3>
          <button className="lp-btn lp-btn--galaxy" onClick={() => handleGalaxyChoice(true)}>
            <div className="lp-galaxy-title">Continue Dev Game</div>
            <div className="lp-galaxy-desc">Same galaxy seed &bull; Saved progress</div>
          </button>
          <button className="lp-btn lp-btn--galaxy" onClick={() => handleGalaxyChoice(false)}>
            <div className="lp-galaxy-title">Start New Game</div>
            <div className="lp-galaxy-desc">Fresh galaxy seed &bull; New universe</div>
          </button>
          <button className="lp-btn lp-btn--alt" onClick={() => setShowGalaxyChoice(false)}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lp-box">
      {/* Tab switcher */}
      <div className="lp-tabs">
        <button
          className={`lp-tab ${view === 'signin' ? 'lp-tab--active' : ''}`}
          onClick={() => setView('signin')}
        >
          Sign In
        </button>
        <button
          className={`lp-tab ${view === 'signup' ? 'lp-tab--active' : ''}`}
          onClick={() => setView('signup')}
        >
          {FEATURES.SIGNUPS ? 'Create Account' : 'Request Access'}
        </button>
      </div>

      {view !== 'signin' && !FEATURES.SIGNUPS ? (
        <div className="lp-form">
          <p className="lp-closed-note">
            Sign-ups are closed for now. Leave a note and I&rsquo;ll get in touch.
          </p>
          <LetterbirdForm />
        </div>
      ) : view === 'signin' ? (
        <div className="lp-form">
          <div className="lp-field">
            <label>Email</label>
            <input
              type="email"
              value={signinEmail}
              onChange={(e) => setSigninEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
              autoComplete="email"
            />
          </div>
          <div className="lp-field">
            <label>Password</label>
            <input
              type="password"
              value={signinPass}
              onChange={(e) => setSigninPass(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
              autoComplete="current-password"
            />
          </div>
          <button className="lp-btn lp-btn--main" onClick={handleSignIn}>
            Sign In
          </button>
          {signinMsg.text && (
            <div className={`lp-msg lp-msg--${signinMsg.type}`}>{signinMsg.text}</div>
          )}
        </div>
      ) : (
        <div className="lp-form">
          <div className="lp-field">
            <label>Email</label>
            <input
              type="email"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSignUp()}
              autoComplete="email"
            />
          </div>
          <div className="lp-field">
            <label>Password</label>
            <input
              type="password"
              value={signupPass}
              onChange={(e) => setSignupPass(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSignUp()}
              autoComplete="new-password"
            />
          </div>
          <div className="lp-field">
            <label>Display Name</label>
            <input
              type="text"
              value={signupName}
              onChange={(e) => setSignupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSignUp()}
              autoComplete="username"
            />
          </div>
          <button className="lp-btn lp-btn--main" onClick={handleSignUp}>
            Create Account
          </button>
          {signupMsg.text && (
            <div className={`lp-msg lp-msg--${signupMsg.type}`}>{signupMsg.text}</div>
          )}
        </div>
      )}

      {isOfflineMode && (
        <div className="lp-offline">
          <div className="lp-divider"><span>OR</span></div>
          <button className="lp-btn lp-btn--offline" onClick={() => setShowGalaxyChoice(true)}>
            Play Offline
          </button>
          <div className="lp-offline-hint">No credentials needed &bull; Local galaxy only</div>
        </div>
      )}
    </div>
  );
}
