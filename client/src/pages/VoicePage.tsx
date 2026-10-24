import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Info,
  Loader2,
  Mic,
  MicOff,
  Settings2,
  Shield,
  Square,
  Volume2,
  VolumeX,
  Wand2,
} from 'lucide-react';
import { useVoice, type VoiceController } from '../hooks/useVoice';
import { tasksApi, voiceApi } from '../services/endpoints';
import { ApiError, fileContentUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { VoiceCommandResult } from '../types';
import { AiOrb } from '../components/common/AiOrb';
import { FileResultCard } from '../components/files/FileResultCard';
import { Markdownish } from '../components/common/Markdownish';
import { FilePreviewModal } from '../components/files/FilePreviewModal';
import { Spinner } from '../components/ui/Spinner';

const LANGUAGES = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'hi-IN', label: 'Hindi (India)' },
  { code: 'ta-IN', label: 'Tamil (India)' },
  { code: 'es-ES', label: 'Spanish (Spain)' },
  { code: 'fr-FR', label: 'French (France)' },
  { code: 'de-DE', label: 'German (Germany)' },
];

const QUICK_COMMANDS = [
  'Find my AI project PDF',
  'Open my tasks',
  'Search my files for MongoDB notes',
  'What deadlines are in my project report?',
  'Find the email about my college fees',
];

export default function VoicePage() {
  const navigate = useNavigate();
  const { preferences, features } = useAuth();
  const { error: toastError, success } = useToast();

  const [response, setResponse] = useState<VoiceCommandResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(preferences?.voice.autoSpeak ?? true);
  const [wakeOn, setWakeOn] = useState(false);
  const [savedTask, setSavedTask] = useState(false);
  const processingRef = useRef(false);
  const voiceRef = useRef<VoiceController | null>(null);

  const handleTranscript = useCallback(
    async (text: string) => {
      if (processingRef.current) return;
      processingRef.current = true;
      setProcessing(true);
      setSavedTask(false);
      try {
        const { data } = await voiceApi.command(text);
        setResponse(data);
        if (autoSpeak && data.spoken) voiceRef.current?.speak(data.spoken);
        if (data.results?.route) {
          window.setTimeout(() => navigate(data.results!.route!), 900);
        }
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Voice command failed.';
        toastError('Could not process that', message);
        setResponse({
          transcript: text,
          action: { type: 'ask' },
          spoken: message,
          results: null,
        });
      } finally {
        setProcessing(false);
        processingRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autoSpeak],
  );

  const voice = useVoice({
    lang: preferences?.voice.lang ?? 'en-IN',
    rate: preferences?.voice.rate ?? 1,
    pitch: preferences?.voice.pitch ?? 1,
    voiceURI: preferences?.voice.voiceURI ?? null,
    onResult: handleTranscript,
    onWake: () => {
      success('Wake word detected', 'Listening for your request…');
      voice.start();
    },
  });

  voiceRef.current = voice;

  useEffect(() => {
    setAutoSpeak(preferences?.voice.autoSpeak ?? true);
  }, [preferences?.voice.autoSpeak]);

  const micLabel =
    voice.state === 'listening'
      ? 'Listening… speak now'
      : voice.state === 'processing' || processing
        ? 'Thinking…'
        : voice.state === 'speaking'
          ? 'Speaking…'
          : 'Tap the microphone to start';

  const orbState = voice.state === 'listening' ? 'listening' : voice.state === 'speaking' ? 'speaking' : processing ? 'thinking' : 'idle';

  const saveSuggestedTask = async () => {
    const suggestion = response?.results?.suggestedTask;
    if (!suggestion) return;
    try {
      await tasksApi.create({ title: suggestion.title, source: { type: 'ai' } });
      setSavedTask(true);
      success('Task saved', suggestion.title);
    } catch (err) {
      toastError('Could not save task', err instanceof ApiError ? err.message : 'Unknown error');
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Voice Assistant</h1>
          <p className="mt-1 text-xs text-muted">
            Push-to-talk works everywhere KYNOV runs. Wake word is available only while this tab is open and visible.
          </p>
        </div>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}>
          <Settings2 className="h-3.5 w-3.5" /> Voice settings
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Main orb panel */}
        <section className="panel relative flex min-h-[520px] flex-col items-center justify-between overflow-hidden p-6">
          <div className="pointer-events-none absolute inset-0 bg-grid-fade opacity-70" />

          <div className="relative flex flex-col items-center">
            <span
              className={`chip ${voice.listening ? 'chip-active' : ''} ${voice.state === 'error' ? 'border-rose-400/40 text-rose-300' : ''}`}
            >
              {voice.listening ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" /> : null}
              {micLabel}
            </span>

            <button
              type="button"
              onClick={() => (voice.listening ? voice.stop() : voice.start())}
              className="mt-6 rounded-full transition hover:scale-[1.02] active:scale-95 disabled:opacity-60"
              disabled={processing}
              aria-label={voice.listening ? 'Stop listening' : 'Start voice input'}
              aria-pressed={voice.listening}
            >
              <AiOrb state={orbState} size={230} />
            </button>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className={voice.listening ? 'btn-danger' : 'btn-primary'}
                onClick={() => (voice.listening ? voice.stop() : voice.start())}
                disabled={processing || !voice.supported}
              >
                {voice.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {voice.listening ? 'Stop' : 'Push to talk'}
              </button>
              {voice.speaking && (
                <button type="button" className="btn-secondary" onClick={voice.stopSpeaking}>
                  <Square className="h-4 w-4" /> Stop speaking
                </button>
              )}
              <button type="button" className="btn-ghost" onClick={() => setAutoSpeak((v) => !v)} aria-pressed={autoSpeak}>
                {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                {autoSpeak ? 'Spoken replies on' : 'Spoken replies off'}
              </button>
            </div>

            <p className="mt-3 min-h-[20px] text-center text-xs text-muted">
              {voice.interim ? <span className="text-content">“{voice.interim}”</span> : voice.transcript ? `“${voice.transcript}”` : ''}
            </p>
          </div>

          {/* Response area */}
          <div className="relative mt-4 w-full">
            <AnimatePresence mode="wait">
              {processing ? (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center gap-2 rounded-xl border bg-ink-900/70 p-4 text-sm text-muted"
                >
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching your workspace…
                </motion.div>
              ) : response ? (
                <motion.div
                  key="response"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-xl border bg-ink-900/70 p-4"
                >
                  <p className="text-[10px] uppercase tracking-wider text-cyan-300">KYNOV</p>
                  <p className="mt-1 text-sm leading-relaxed text-content">{response.spoken}</p>

                  {response.results?.answer && (
                    <div className="mt-2 border-t pt-2">
                      <Markdownish content={response.results.answer} />
                    </div>
                  )}

                  {response.results?.suggestedTask && (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-violet-400/25 bg-violet-500/[0.07] p-2.5">
                      <p className="min-w-0 truncate text-xs text-content">{response.results.suggestedTask.title}</p>
                      <button type="button" className="btn-primary btn-sm shrink-0" onClick={saveSuggestedTask} disabled={savedTask}>
                        {savedTask ? 'Saved' : 'Confirm task'}
                      </button>
                    </div>
                  )}

                  {Array.isArray(response.results?.files) && response.results!.files!.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {response.results!.files!.slice(0, 4).map((f) => (
                        <FileResultCard
                          key={f.id}
                          hit={f}
                          compact
                          onOpen={(hit) => setPreviewId(hit.id)}
                          onDownload={(hit) => {
                            window.location.href = fileContentUrl(hit.id, true);
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {Array.isArray(response.results?.emails) && response.results!.emails!.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {response.results!.emails!.slice(0, 3).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => navigate(`/gmail/${m.gmailId}`)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border bg-ink-900/60 px-3 py-2 text-left text-[11px] hover:border-cyan-400/30"
                        >
                          <span className="min-w-0 truncate text-content">{m.subject}</span>
                          <ArrowRight className="h-3 w-3 shrink-0 text-muted" />
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-[11px] text-muted">
                  Try “Hey KYNOV, find my AI project PDF” or tap a command below.
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Side panel */}
        <div className="space-y-4">
          <section className="panel p-4">
            <h2 className="text-[10px] uppercase tracking-wider text-muted">Supported commands</h2>
            <div className="mt-2 space-y-1.5">
              {QUICK_COMMANDS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => void handleTranscript(c)}
                  className="w-full rounded-lg border bg-ink-900/50 px-2.5 py-2 text-left text-[11px] text-muted transition hover:border-cyan-400/30 hover:text-content"
                >
                  “{c}”
                </button>
              ))}
            </div>
            <ul className="mt-3 space-y-1 text-[10px] text-muted">
              <li>• “Open my files / tasks / settings”</li>
              <li>• “Find the email sent by my professor last week”</li>
              <li>• “Remind me to submit the report on Friday”</li>
            </ul>
          </section>

          <section className="panel p-4">
            <h2 className="text-[10px] uppercase tracking-wider text-muted">Wake word</h2>
            <label className="mt-2 flex items-start gap-2 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={wakeOn}
                onChange={(e) => {
                  setWakeOn(e.target.checked);
                  voice.setWakeWord(e.target.checked);
                }}
                className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-ink-900"
                disabled={!voice.supported}
              />
              <span>
                Listen for “Hey KYNOV” while this tab is open.
                {voice.wakeActive && <span className="ml-1 text-emerald-300">Active</span>}
              </span>
            </label>
            <p className="mt-2 text-[10px] leading-relaxed text-muted/80">
              Browsers cannot keep a microphone open when the page is closed, backgrounded by the OS, or when the device
              blocks it. Use push-to-talk as the always-available option.
            </p>
          </section>

          <section className="panel p-4">
            <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
              <Shield className="h-3 w-3" /> Privacy
            </h2>
            <ul className="mt-2 space-y-1 text-[10px] leading-relaxed text-muted">
              <li>• The browser asks for microphone permission once — KYNOV records only after you press the mic.</li>
              <li>• Speech recognition is performed by your browser’s engine (Chrome/Edge use a cloud service).</li>
              <li>• Audio is not uploaded to the KYNOV server; only the recognised text is sent.</li>
              <li>• Spoken replies are generated locally by your device’s speech synthesiser.</li>
            </ul>
          </section>

          {!features?.ai && (
            <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.07] p-3 text-[10px] leading-relaxed text-amber-200">
              <AlertTriangle className="mr-1 inline h-3 w-3" /> AI answers are in retrieval mode: voice still searches files and
              emails, but spoken answers are limited to result summaries until <code>AI_API_KEY</code> is set.
            </div>
          )}
        </div>
      </div>

      {voice.error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200" role="alert">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {voice.error}
        </div>
      )}

      {!voice.supported && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This browser does not expose the Web Speech API. Use Chrome, Edge or another Chromium browser, or type your request in
          AI chat.
        </div>
      )}

      {/* Voice settings drawer */}
      <AnimatePresence>
        {showSettings && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="panel grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label" htmlFor="voice-lang">Language</label>
                <select
                  id="voice-lang"
                  className="input py-2"
                  value={voice.lang}
                  onChange={(e) => voice.setLang(e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="voice-name">Voice</label>
                <select
                  id="voice-name"
                  className="input py-2"
                  value={voice.voiceURI ?? ''}
                  onChange={(e) => voice.setVoiceURI(e.target.value || null)}
                >
                  <option value="">System default</option>
                  {voice.voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="voice-rate">Rate · {voice.rate.toFixed(1)}×</label>
                <input
                  id="voice-rate"
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={voice.rate}
                  onChange={(e) => voice.setRate(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>
              <div>
                <label className="label" htmlFor="voice-pitch">Pitch · {voice.pitch.toFixed(1)}</label>
                <input
                  id="voice-pitch"
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={voice.pitch}
                  onChange={(e) => voice.setPitch(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => voice.speak('Good morning! KYNOV AI is ready. How can I help you today?')}
                >
                  <Wand2 className="h-3.5 w-3.5" /> Test this voice
                </button>
                <span className="ml-2 text-[10px] text-muted">{voice.voices.length} voices available on this device</span>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <FilePreviewModal fileId={previewId} onClose={() => setPreviewId(null)} onOpenFull={(f) => navigate(`/files/${f.id}`)} />
    </div>
  );
}
