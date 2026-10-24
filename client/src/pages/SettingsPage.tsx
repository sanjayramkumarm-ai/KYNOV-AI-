import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LogOut,
  Moon,
  Plug,
  Save,
  Shield,
  Sparkles,
  Sun,
  Trash2,
  Unplug,
  User as UserIcon,
  Volume2,
  Database,
  HardDrive,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { authApi, filesApi, gmailApi } from '../services/endpoints';
import { ApiError } from '../services/api';
import type { StorageInfo } from '../types';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Spinner } from '../components/ui/Spinner';
import { formatBytes } from '../components/common/FileIcon';
import { formatDate } from '../utils/format';

const LANGUAGES = ['en-IN', 'en-US', 'en-GB', 'hi-IN', 'ta-IN', 'es-ES', 'fr-FR', 'de-DE'];

export default function SettingsPage() {
  const { user, preferences, features, google, refresh, updateProfile, updatePreferences, setGoogle, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { success, error: toastError, info } = useToast();
  const [params, setParams] = useSearchParams();

  const [name, setName] = useState(user?.name ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [pwdBusy, setPwdBusy] = useState(false);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    filesApi.storage().then(({ data }) => setStorage(data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (params.get('gmail') === 'connected') {
      success('Gmail connected', 'Your inbox is now available inside KYNOV AI.');
      void refresh();
      setParams({}, { replace: true });
    }
    const err = params.get('error');
    if (err) {
      toastError('Google connection failed', err);
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateProfile({ name: name.trim() });
      success('Profile updated');
    } catch (err) {
      toastError('Could not save profile', err instanceof ApiError ? err.message : 'Unknown error');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.next !== pwd.confirm) return toastError('Passwords do not match', 'Re-enter the new password.');
    if (pwd.next.length < 8) return toastError('Password too short', 'Use at least 8 characters.');
    setPwdBusy(true);
    try {
      await authApi.changePassword({ currentPassword: pwd.current, newPassword: pwd.next });
      setPwd({ current: '', next: '', confirm: '' });
      success('Password changed', 'Please sign in again with your new password.');
      await logout();
    } catch (err) {
      toastError('Could not change password', err instanceof ApiError ? err.message : 'Unknown error');
    } finally {
      setPwdBusy(false);
    }
  };

  const connectGmail = async (mode: 'read' | 'send' = 'read') => {
    setConnecting(true);
    try {
      const { data } = await gmailApi.connectUrl(mode);
      window.location.href = data.url;
    } catch (err) {
      setConnecting(false);
      toastError('Cannot connect Google', err instanceof ApiError ? err.message : 'Unknown error');
    }
  };

  const disconnectGmail = async () => {
    const { data } = await gmailApi.disconnect();
    setGoogle(null);
    success('Google disconnected', data.message);
  };

  const deleteAccount = async () => {
    await authApi.deleteAccount({ confirm: 'DELETE' });
    info('Account deleted', 'All your files and data have been removed.');
    await logout();
  };

  const pref = preferences;
  const update = async (patch: any, label?: string) => {
    try {
      await updatePreferences(patch);
      if (label) success(label);
    } catch (err) {
      toastError('Could not save preference', err instanceof ApiError ? err.message : 'Unknown error');
      void refresh();
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold">Profile & Settings</h1>
        <p className="mt-1 text-xs text-muted">Account, appearance, voice, integrations and data controls.</p>
      </header>

      {/* Profile */}
      <section className="panel p-5">
        <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
          <UserIcon className="h-3 w-3" /> Profile
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="profile-name">Full name</label>
            <input id="profile-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="profile-email">Email</label>
            <input id="profile-email" className="input opacity-70" value={user?.email ?? ''} readOnly />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span className="chip">Signed in via {user?.authProvider === 'both' ? 'password + Google' : user?.authProvider}</span>
          <span className="chip">Member since {formatDate(user?.createdAt)}</span>
          {user?.emailVerified ? <span className="chip chip-active">Email verified</span> : <span className="chip">Email unverified</span>}
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn-primary btn-sm" onClick={saveProfile} disabled={savingProfile || name.trim().length < 2}>
            {savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save profile
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void logout()}>
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </section>

      {/* Appearance */}
      <section className="panel p-5">
        <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">Appearance</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { key: 'dark' as const, label: 'Dark', icon: Moon },
            { key: 'light' as const, label: 'Light', icon: Sun },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTheme(key);
                void update({ theme: key });
              }}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs transition ${
                theme === key ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300' : 'text-muted hover:text-content'
              }`}
              aria-pressed={theme === key}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-2 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={pref?.formatting.density === 'compact'}
            onChange={(e) => void update({ formatting: { density: e.target.checked ? 'compact' : 'comfortable' } })}
            className="h-3.5 w-3.5 rounded border-white/20 bg-ink-900"
          />
          Compact spacing (denser lists)
        </label>
      </section>

      {/* Voice */}
      <section className="panel p-5">
        <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
          <Volume2 className="h-3 w-3" /> Voice assistant
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="pref-lang">Language</label>
            <select
              id="pref-lang"
              className="input"
              value={pref?.voice.lang ?? 'en-IN'}
              onChange={(e) => void update({ voice: { lang: e.target.value } })}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pref-rate">Speech rate · {(pref?.voice.rate ?? 1).toFixed(1)}×</label>
            <input
              id="pref-rate"
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={pref?.voice.rate ?? 1}
              onChange={(e) => void update({ voice: { rate: Number(e.target.value) } })}
              className="w-full accent-cyan-400"
            />
          </div>
          <div>
            <label className="label" htmlFor="pref-pitch">Pitch · {(pref?.voice.pitch ?? 1).toFixed(1)}</label>
            <input
              id="pref-pitch"
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={pref?.voice.pitch ?? 1}
              onChange={(e) => void update({ voice: { pitch: Number(e.target.value) } })}
              className="w-full accent-cyan-400"
            />
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {[
            { key: 'autoSpeak' as const, label: 'Speak AI replies aloud', value: pref?.voice.autoSpeak ?? true },
            { key: 'wakeWordEnabled' as const, label: 'Enable “Hey KYNOV” wake word (tab must stay open)', value: pref?.voice.wakeWordEnabled ?? false },
          ].map((item) => (
            <label key={item.key} className="flex items-center gap-2 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={item.value}
                onChange={(e) => void update({ voice: { [item.key]: e.target.checked } })}
                className="h-3.5 w-3.5 rounded border-white/20 bg-ink-900"
              />
              {item.label}
            </label>
          ))}
        </div>
      </section>

      {/* Notifications & search */}
      <section className="panel p-5">
        <h2 className="text-[10px] uppercase tracking-wider text-muted">Notifications & search</h2>
        <div className="mt-3 space-y-1.5">
          {[
            { key: 'inApp' as const, label: 'In-app notifications', value: pref?.notifications.inApp ?? true },
            { key: 'reminders' as const, label: 'Task reminders', value: pref?.notifications.reminders ?? true },
            { key: 'emailDigest' as const, label: 'Email digest (queued only — no mail is sent by KYNOV)', value: pref?.notifications.emailDigest ?? false },
          ].map((item) => (
            <label key={item.key} className="flex items-center gap-2 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={item.value}
                onChange={(e) => void update({ notifications: { [item.key]: e.target.checked } })}
                className="h-3.5 w-3.5 rounded border-white/20 bg-ink-900"
              />
              {item.label}
            </label>
          ))}
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={pref?.search.includeEmails ?? true}
              onChange={(e) => void update({ search: { includeEmails: e.target.checked } })}
              className="h-3.5 w-3.5 rounded border-white/20 bg-ink-900"
            />
            Include authorised email in AI answers by default
          </label>
        </div>
      </section>

      {/* Integrations */}
      <section className="panel p-5">
        <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
          <Plug className="h-3 w-3" /> Integrations
        </h2>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {/* Google */}
          <div className="rounded-xl border bg-ink-900/50 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-content">Google / Gmail</p>
                <p className="mt-0.5 text-[10px] text-muted">
                  {google?.connected ? google.email : google?.configured ? 'Not connected' : 'Server credentials missing'}
                </p>
              </div>
              <span className={`chip ${google?.connected ? 'chip-active' : ''}`}>{google?.connected ? 'Connected' : 'Off'}</span>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              {google?.connected
                ? `Scopes: ${google.scopes.map((s) => s.split('/').pop()).join(', ')}`
                : 'Read-only Gmail access by default. Sending is requested only when you enable it.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {!google?.connected ? (
                <>
                  <button type="button" className="btn-primary btn-sm" onClick={() => connectGmail('read')} disabled={connecting || !google?.configured}>
                    {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />} Connect read-only
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => connectGmail('send')} disabled={connecting || !google?.configured}>
                    Connect with sending
                  </button>
                </>
              ) : (
                <>
                  {!google.canSend && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => connectGmail('send')}>
                      Enable sending
                    </button>
                  )}
                  <Link to="/gmail" className="btn-secondary btn-sm">Open inbox</Link>
                  <button type="button" className="btn-danger btn-sm" onClick={() => setDisconnectOpen(true)}>
                    <Unplug className="h-3.5 w-3.5" /> Disconnect
                  </button>
                </>
              )}
            </div>
            {!google?.configured && (
              <p className="mt-2 text-[10px] text-amber-200">
                Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server to enable this.
              </p>
            )}
          </div>

          {/* AI */}
          <div className="rounded-xl border bg-ink-900/50 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-content">AI provider</p>
                <p className="mt-0.5 text-[10px] text-muted">
                  {features?.ai ? `${features.chatModel} · ${features.embeddings} embeddings` : 'Not configured'}
                </p>
              </div>
              <span className={`chip ${features?.ai ? 'chip-active' : ''}`}>{features?.ai ? 'Active' : 'Off'}</span>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              {features?.ai
                ? `Vector search: ${features.vectorSearch === 'atlas' ? 'Atlas Vector Search' : 'in-process cosine'}. Keys live only in the server environment.`
                : 'Add AI_API_KEY, AI_BASE_URL and AI_CHAT_MODEL to server/.env to enable written answers, summaries and drafting. Retrieval and search already work.'}
            </p>
            {!features?.ai && (
              <div className="mt-2 flex flex-wrap gap-1">
                {['AI_API_KEY', 'AI_BASE_URL', 'AI_CHAT_MODEL'].map((v) => (
                  <code key={v} className="rounded border border-white/10 bg-ink-950/70 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                    {v}
                  </code>
                ))}
              </div>
            )}
          </div>

          {/* Storage */}
          <div className="rounded-xl border bg-ink-900/50 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-content">File storage</p>
                <p className="mt-0.5 text-[10px] text-muted">{storage?.driver === 's3' ? 'Amazon S3' : 'Local disk'}</p>
              </div>
              <span className="chip chip-active">{features?.storageDriver ?? 'local'}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-400" style={{ width: `${Math.max(2, storage?.percent ?? 0)}%` }} />
            </div>
            <p className="mt-1 text-[10px] text-muted">
              {formatBytes(storage?.usedBytes ?? 0)} of {formatBytes(storage?.quotaBytes ?? 0)} · {storage?.fileCount ?? 0} files
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">{storage?.note}</p>
          </div>

          {/* Security */}
          <div className="rounded-xl border bg-ink-900/50 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-content">Security posture</p>
                <p className="mt-0.5 text-[10px] text-muted">Server-enforced, per-user scoping</p>
              </div>
              <Shield className="h-4 w-4 text-emerald-300" />
            </div>
            <ul className="mt-2 space-y-1 text-[10px] text-muted">
              <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-300" /> Password hashing (bcrypt, cost {12})</li>
              <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-300" /> httpOnly cookies + rotating refresh tokens</li>
              <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-300" /> Google tokens encrypted (AES-256-GCM)</li>
              <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-300" /> Rate limiting + Zod validation</li>
              <li className="flex items-center gap-1"><Database className="h-3 w-3 text-cyan-300" /> Every query filtered by your user id</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Password */}
      <section className="panel p-5">
        <h2 className="text-[10px] uppercase tracking-wider text-muted">Password</h2>
        {user?.authProvider === 'google' ? (
          <p className="mt-2 text-[11px] text-muted">
            This account signs in with Google only. Set a password by adding one on the Google account, or continue using
            Google sign-in.
          </p>
        ) : (
          <form onSubmit={changePassword} className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="pwd-cur">Current password</label>
              <input id="pwd-cur" type="password" className="input" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} autoComplete="current-password" />
            </div>
            <div>
              <label className="label" htmlFor="pwd-new">New password</label>
              <input id="pwd-new" type="password" className="input" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} autoComplete="new-password" />
            </div>
            <div>
              <label className="label" htmlFor="pwd-confirm">Confirm new password</label>
              <input id="pwd-confirm" type="password" className="input" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} autoComplete="new-password" />
            </div>
            <div className="sm:col-span-3">
              <button type="submit" className="btn-primary btn-sm" disabled={pwdBusy || !pwd.current || !pwd.next}>
                {pwdBusy ? <Spinner className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />} Update password
              </button>
              <span className="ml-2 text-[10px] text-muted">Changing your password signs out every device.</span>
            </div>
          </form>
        )}
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.05] p-5">
        <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-rose-300">
          <AlertTriangle className="h-3 w-3" /> Danger zone
        </h2>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Deleting your account permanently removes every file from object storage, all embeddings, conversations, tasks,
          notifications and your Google connection. This cannot be undone.
        </p>
        <button type="button" className="btn-danger btn-sm mt-3" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-3.5 w-3.5" /> Delete account
        </button>
      </section>

      <p className="pb-4 text-center text-[10px] text-muted">
        KYNOV AI · v1.0.0 · {features?.ai ? 'AI enabled' : 'retrieval-only mode'} ·{' '}
        <HardDrive className="inline h-3 w-3" /> {storage?.driver ?? 'local'} storage
      </p>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete your account"
        message="This permanently deletes your files, index, conversations, tasks and integrations. Type DELETE to confirm."
        confirmLabel="Delete everything"
        destructive
        requireText="DELETE"
        onConfirm={deleteAccount}
        onClose={() => setDeleteOpen(false)}
      />

      <ConfirmDialog
        open={disconnectOpen}
        title="Disconnect Google"
        message="KYNOV will revoke its Google grant and delete its stored tokens. You can reconnect at any time."
        confirmLabel="Disconnect"
        destructive
        onConfirm={disconnectGmail}
        onClose={() => setDisconnectOpen(false)}
      />
    </div>
  );
}
