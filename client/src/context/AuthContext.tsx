import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../services/api';
import { authApi, preferencesApi } from '../services/endpoints';
import type { FeatureFlags, GoogleStatus, Preferences, User } from '../types';

interface AuthCtx {
  user: User | null;
  preferences: Preferences | null;
  features: FeatureFlags | null;
  google: GoogleStatus | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (body: { name?: string }) => Promise<void>;
  updatePreferences: (patch: DeepPartial<Preferences>) => Promise<void>;
  setGoogle: (g: GoogleStatus | null) => void;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  accent: 'cyan',
  voice: { enabled: true, voiceURI: null, lang: 'en-IN', rate: 1, pitch: 1, autoSpeak: true, wakeWordEnabled: false },
  notifications: { inApp: true, reminders: true, reminderLeadMinutes: 15, emailDigest: false },
  search: { includeEmails: true, topK: 8 },
  formatting: { density: 'comfortable' },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [features, setFeatures] = useState<FeatureFlags | null>(null);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  const applyPayload = useCallback((payload: { user: User; preferences: Preferences; features: FeatureFlags; google?: any }) => {
    setUser(payload.user);
    setPreferences(payload.preferences ?? DEFAULT_PREFERENCES);
    setFeatures(payload.features ?? null);
    if (payload.google) {
      setGoogle({
        configured: payload.google.configured,
        connected: payload.google.connected,
        email: payload.google.email,
        scopes: payload.google.scopes ?? [],
        canSend: Boolean(payload.google.canSend),
      });
    }
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await authApi.me();
      applyPayload(data);
    } catch (err) {
      setUser(null);
      if (err instanceof ApiError && err.status !== 401) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await authApi.login({ email, password });
      applyPayload(data);
    },
    [applyPayload],
  );

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const { data } = await authApi.signup({ name, email, password });
      applyPayload(data);
    },
    [applyPayload],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setPreferences(null);
      setGoogle(null);
    }
  }, []);

  const updateProfile = useCallback(async (body: { name?: string }) => {
    const { data } = await authApi.updateProfile(body);
    setUser(data.user);
  }, []);

  const updatePreferences = useCallback(
    async (patch: DeepPartial<Preferences>) => {
      // Optimistic merge so switches feel instant; server response is authoritative.
      setPreferences((prev) => mergeDeep(prev ?? DEFAULT_PREFERENCES, patch));
      const { data } = await preferencesApi.update(patch);
      setPreferences(data.preferences);
    },
    [],
  );

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      preferences,
      features,
      google,
      loading,
      error,
      login,
      signup,
      logout,
      refresh,
      updateProfile,
      updatePreferences,
      setGoogle,
    }),
    [user, preferences, features, google, loading, error, login, signup, logout, refresh, updateProfile, updatePreferences],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function mergeDeep<T>(base: T, patch: any): T {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch as T;
  const out: any = { ...(base as any) };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? mergeDeep((base as any)?.[k] ?? {}, v) : v;
  }
  return out as T;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
