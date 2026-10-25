
import { useState } from 'react';
import { Activity, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (mode === 'register') {
        await register({ name: name.trim(), email: email.trim(), password });
      } else {
        await login({ email: email.trim(), password });
      }
    } catch (err) {
      setError(err.message || 'Unable to authenticate');
    } finally {
      setSubmitting(false);
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setError('');
  }

  return (
    <main className="auth-screen">
      <section className="auth-brand-panel">
        <div className="auth-brand">
          <div className="brand-mark"><Activity size={24} /></div>
          <div>
            <strong>CivicLens</strong>
            <small>CIVIC INTELLIGENCE</small>
          </div>
        </div>

        <div className="auth-pitch">
          <div className="auth-kicker">BETTER STREETS START HERE</div>
          <h1>Make your community a better place.</h1>
          <p>
            Report civic issues, follow their progress, and help your
            community focus on what needs attention most.
          </p>

          <div className="auth-feature">
            <span><ShieldCheck size={19} /></span>
            <div>
              <strong>Transparent reporting</strong>
              <small>Track issues from submission to resolution.</small>
            </div>
          </div>
          <div className="auth-feature">
            <span><Activity size={19} /></span>
            <div>
              <strong>Data-driven action</strong>
              <small>Help identify recurring issues in your area.</small>
            </div>
          </div>
        </div>

        <div className="auth-panel-footer">
          CivicLens · AI-powered civic issue detection
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand">
            <div className="brand-mark"><Activity size={22} /></div>
            <strong>CivicLens</strong>
          </div>

          <div className="auth-heading">
            <div className="eyebrow">
              {mode === 'login' ? 'WELCOME BACK' : 'JOIN YOUR COMMUNITY'}
            </div>
            <h2>{mode === 'login' ? 'Sign in to CivicLens' : 'Create your account'}</h2>
            <p>
              {mode === 'login'
                ? 'Enter your details to access your workspace.'
                : 'Create an account to report and track civic issues.'}
            </p>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={mode === 'login' ? 'selected' : ''}
              onClick={() => changeMode('login')}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'selected' : ''}
              onClick={() => changeMode('register')}
            >
              Create account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === 'register' && (
              <label>
                Full name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Enter your full name"
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  required
                />
              </label>
            )}

            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>

            <label>
              Password
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  maxLength={72}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {error && <div className="auth-error" role="alert">{error}</div>}

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting
                ? 'Please wait...'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
              {!submitting && <ArrowRight size={17} />}
            </button>
          </form>

          <p className="auth-legal">
            By continuing, you agree to use CivicLens responsibly and submit
            accurate civic issue information.
          </p>
        </div>
      </section>
    </main>
  );
}
