import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../services/api';
import { AiOrb } from '../components/common/AiOrb';
import { Spinner } from '../components/ui/Spinner';

const rules = [
  { test: (v: string) => v.length >= 8, label: 'At least 8 characters' },
  { test: (v: string) => /[a-zA-Z]/.test(v), label: 'Contains a letter' },
  { test: (v: string) => /[0-9]/.test(v), label: 'Contains a number' },
];

export default function SignupPage() {
  const { signup } = useAuth();
  const { success } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = rules.every((r) => r.test(form.password));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.name.trim().length < 2) return setError('Tell us your name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return setError('Enter a valid email address.');
    if (!valid) return setError('Choose a stronger password that meets all three rules.');

    setBusy(true);
    try {
      await signup(form.name.trim(), form.email.trim().toLowerCase(), form.password);
      success('Workspace created', 'Upload your first document to unlock AI search.');
      navigate('/dashboard?welcome=1', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
      <div className="hidden lg:block">
        <AiOrb state="listening" size={200} className="mx-auto" />
        <h1 className="mt-8 font-display text-3xl font-semibold leading-tight">
          Set up your <span className="gradient-text">intelligent workspace</span>
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
          One account, one private vault. Upload documents, connect Gmail when you are ready, and ask questions in plain
          language or by voice.
        </p>
        <ul className="mt-6 space-y-2 text-xs text-muted">
          {['5 GB of private document storage', 'Semantic search with citations', 'Optional Gmail integration with least-privilege scopes', 'Voice commands and spoken answers'].map(
            (item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-300" /> {item}
              </li>
            ),
          )}
        </ul>
      </div>

      <div className="panel w-full p-6 sm:p-8">
        <h2 className="font-display text-xl font-semibold">Create your account</h2>
        <p className="mt-1 text-xs text-muted">Takes less than a minute. No credit card.</p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="label" htmlFor="name">
              Full name
            </label>
            <input
              id="name"
              className="input"
              autoComplete="name"
              placeholder="Arjun Mehta"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="input"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
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
                className="input pr-10"
                autoComplete="new-password"
                placeholder="Create a password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
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
            <ul className="mt-2 grid gap-1 sm:grid-cols-3">
              {rules.map((r) => {
                const ok = r.test(form.password);
                return (
                  <li key={r.label} className={`flex items-center gap-1 text-[10px] ${ok ? 'text-emerald-300' : 'text-muted'}`}>
                    <Check className={`h-3 w-3 ${ok ? 'opacity-100' : 'opacity-30'}`} /> {r.label}
                  </li>
                );
              })}
            </ul>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200" role="alert">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            Create account <ArrowRight className="h-4 w-4" />
          </button>
          <p className="text-center text-[10px] leading-relaxed text-muted">
            By creating an account you agree that documents you upload are stored in your own workspace and are never shared
            with other users.
          </p>
        </form>

        <p className="mt-5 text-center text-xs text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-cyan-300 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
