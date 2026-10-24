import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Eye, EyeOff, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { authApi, metaApi } from '../services/endpoints';
import { ApiError } from '../services/api';
import { AiOrb } from '../components/common/AiOrb';
import { Spinner } from '../components/ui/Spinner';
import type { FeatureFlags } from '../types';

export default function LoginPage() {
  const { login } = useAuth();
  const { success } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<FeatureFlags | null>(null);

  useEffect(() => {
    metaApi.features().then(({ data }) => setFeatures(data)).catch(() => undefined);
  }, []);

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await login(email.trim(), password);
      success('Welcome back', 'Your workspace is ready.');
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const googleSignIn = async () => {
    try {
      const { data } = await authApi.googleSignInUrl();
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Google sign-in is unavailable.');
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
      <div className="hidden lg:block">
        <AiOrb state="idle" size={200} className="mx-auto" />
        <h1 className="mt-8 font-display text-3xl font-semibold leading-tight">
          Welcome back to <span className="gradient-text">KYNOV AI</span>
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
          Your files, conversations, tasks and connected inbox are exactly where you left them. Sign in to continue where you
          stopped.
        </p>
        <ul className="mt-6 space-y-2 text-xs text-muted">
          <li>• Sessions use httpOnly cookies with rotating refresh tokens.</li>
          <li>• Signing out invalidates the refresh token server-side.</li>
          <li>• Google sign-in never shares your password with KYNOV.</li>
        </ul>
      </div>

      <div className="panel w-full p-6 sm:p-8">
        <h2 className="font-display text-xl font-semibold">Sign in</h2>
        <p className="mt-1 text-xs text-muted">Use your email and password, or continue with Google.</p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                className="input pr-10"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:text-content"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200" role="alert">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            Sign in
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[11px] text-muted">
          <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
        </div>

        <button
          type="button"
          onClick={googleSignIn}
          disabled={!features?.googleSignIn}
          className="btn-secondary w-full py-3"
          title={features && !features.googleSignIn ? 'Google sign-in is not configured on the server yet' : undefined}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
            <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12S6.8 21.5 12 21.5c5.4 0 9-3.8 9-9.1 0-.6-.1-1.1-.2-1.6H12z" />
          </svg>
          Continue with Google
        </button>
        {features && !features.googleSignIn && (
          <p className="mt-2 text-center text-[11px] text-muted">
            Google sign-in appears once <code className="text-cyan-300">GOOGLE_CLIENT_ID</code> and{' '}
            <code className="text-cyan-300">GOOGLE_CLIENT_SECRET</code> are set on the server.
          </p>
        )}

        <p className="mt-6 text-center text-xs text-muted">
          New here?{' '}
          <Link to="/signup" className="font-medium text-cyan-300 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
