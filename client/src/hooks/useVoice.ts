import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* Minimal Web Speech API typings (not in lib.dom for all TS versions). */
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface UseVoiceOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
  voiceURI?: string | null;
  /** Called with every finalised transcript chunk. */
  onResult?: (transcript: string) => void;
  /** Called when the wake phrase is heard while idle. */
  onWake?: () => void;
  wakePhrase?: RegExp;
}

const DEFAULT_WAKE = /\b(hey|hi|ok|okay|hello)\s+k?ynov\b/i;

export function useVoice(options: UseVoiceOptions = {}) {
  const { onResult, onWake, wakePhrase = DEFAULT_WAKE } = options;

  const ctor = useMemo(getRecognitionCtor, []);
  const supported = Boolean(ctor) && typeof window !== 'undefined' && 'speechSynthesis' in window;

  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied' | 'prompt'>('unknown');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string | null>(options.voiceURI ?? null);
  const [lang, setLang] = useState(options.lang ?? 'en-IN');
  const [rate, setRate] = useState(options.rate ?? 1);
  const [pitch, setPitch] = useState(options.pitch ?? 1);
  const [wakeActive, setWakeActive] = useState(false);
  const [wakeFlash, setWakeFlash] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wakeRef = useRef<SpeechRecognitionLike | null>(null);
  const manualStop = useRef(false);
  const wakeEnabled = useRef(false);

  /* Keep TTS settings in sync with user preferences. */
  useEffect(() => {
    if (options.voiceURI !== undefined) setVoiceURI(options.voiceURI);
  }, [options.voiceURI]);
  useEffect(() => {
    if (options.lang) setLang(options.lang);
  }, [options.lang]);
  useEffect(() => {
    if (options.rate) setRate(options.rate);
  }, [options.rate]);
  useEffect(() => {
    if (options.pitch) setPitch(options.pitch);
  }, [options.pitch]);

  /* Load system voices (Chrome populates them asynchronously). */
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length) setVoices(list);
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  /* Microphone permission state (best effort; Safari has no Permissions API entry). */
  useEffect(() => {
    let alive = true;
    const nav = navigator as Navigator & { permissions?: Permissions };
    if (!nav.permissions?.query) return;
    nav.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((status) => {
        if (!alive) return;
        setPermission(status.state as any);
        status.onchange = () => setPermission(status.state as any);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text?.trim()) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.replace(/[*_`#>]/g, '').slice(0, 3000));
      const chosen =
        voices.find((v) => v.voiceURI === voiceURI) ??
        voices.find((v) => v.lang === lang) ??
        voices.find((v) => v.lang?.startsWith(lang.split('-')[0])) ??
        null;
      if (chosen) utterance.voice = chosen;
      utterance.lang = chosen?.lang ?? lang;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.onstart = () => setState('speaking');
      utterance.onend = () => setState((s) => (s === 'speaking' ? 'idle' : s));
      utterance.onerror = () => setState('idle');
      window.speechSynthesis.speak(utterance);
    },
    [voices, voiceURI, lang, rate, pitch],
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setState((s) => (s === 'speaking' ? 'idle' : s));
  }, []);

  /* ── One-shot dictation (push-to-talk / click-to-talk) ── */
  const start = useCallback(() => {
    if (!ctor) {
      setError('Speech recognition is not supported in this browser. Use Chrome or Edge, or type your request instead.');
      setState('error');
      return;
    }
    if (recognitionRef.current) return;

    stopSpeaking();
    const rec = new ctor();
    recognitionRef.current = rec;
    manualStop.current = false;
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalText = '';

    rec.onstart = () => {
      setState('listening');
      setError(null);
      setInterim('');
      setTranscript('');
    };
    rec.onresult = (event) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const chunk = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += `${chunk} `;
        else interimText += chunk;
      }
      setInterim(interimText);
      if (finalText.trim()) setTranscript(finalText.trim());
    };
    rec.onerror = (event) => {
      const map: Record<string, string> = {
        'not-allowed': 'Microphone access was blocked. Allow the microphone in your browser settings, then try again.',
        'service-not-allowed': 'Speech recognition was blocked by the browser. Check site permissions or use typed input.',
        'no-speech': 'I did not hear anything. Tap the microphone and speak a little closer.',
        'audio-capture': 'No microphone was found. Connect a microphone and retry.',
        network: 'Speech recognition needs a network connection in this browser.',
        aborted: '',
      };
      const message = map[event.error] ?? `Speech recognition error: ${event.error}`;
      if (message) {
        setError(message);
        setState('error');
      }
      recognitionRef.current = null;
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setInterim('');
      const text = finalText.trim();
      if (text) {
        setState('processing');
        onResult?.(text);
      } else {
        setState((s) => (s === 'listening' ? 'idle' : s));
      }
      // Resume wake-word listening if it was on.
      if (wakeEnabled.current) window.setTimeout(() => startWakeWatcher(), 400);
    };

    try {
      rec.start();
    } catch {
      // start() throws if a recogniser is already active.
      recognitionRef.current = null;
    }
  }, [ctor, lang, onResult, stopSpeaking]);

  const stop = useCallback(() => {
    manualStop.current = true;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setState((s) => (s === 'listening' ? 'idle' : s));
  }, []);

  /* ── Wake-word watcher (only while this tab is open & visible) ── */
  function startWakeWatcher() {
    if (!ctor || !wakeEnabled.current || document.visibilityState !== 'visible') return;
    if (wakeRef.current || recognitionRef.current) return;
    const rec = new ctor();
    wakeRef.current = rec;
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let said = '';
      for (let i = event.resultIndex; i < event.results.length; i++) said += event.results[i][0]?.transcript ?? '';
      if (wakePhrase.test(said)) {
        setWakeFlash(true);
        window.setTimeout(() => setWakeFlash(false), 1600);
        try {
          rec.stop();
        } catch {
          /* noop */
        }
        wakeRef.current = null;
        onWake?.();
      }
    };
    rec.onerror = () => {
      wakeRef.current = null;
    };
    rec.onend = () => {
      wakeRef.current = null;
      if (wakeEnabled.current) window.setTimeout(startWakeWatcher, 1200);
    };
    try {
      rec.start();
      setWakeActive(true);
    } catch {
      wakeRef.current = null;
    }
  }

  const setWakeWord = useCallback(
    (enabled: boolean) => {
      wakeEnabled.current = enabled;
      if (enabled) {
        startWakeWatcher();
      } else {
        setWakeActive(false);
        try {
          wakeRef.current?.abort();
        } catch {
          /* noop */
        }
        wakeRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctor, lang, onWake],
  );

  useEffect(() => {
    const onVisibility = () => {
      if (!wakeEnabled.current) return;
      if (document.visibilityState === 'visible') startWakeWatcher();
      else {
        try {
          wakeRef.current?.abort();
        } catch {
          /* noop */
        }
        wakeRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, onWake, ctor]);

  useEffect(
    () => () => {
      try {
        recognitionRef.current?.abort();
        wakeRef.current?.abort();
        window.speechSynthesis?.cancel();
      } catch {
        /* noop */
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setTranscript('');
    setInterim('');
    setError(null);
    setState('idle');
  }, []);

  return {
    supported,
    state,
    setState,
    listening: state === 'listening',
    speaking: state === 'speaking',
    transcript,
    interim,
    error,
    permission,
    voices,
    voiceURI,
    setVoiceURI,
    lang,
    setLang,
    rate,
    setRate,
    pitch,
    setPitch,
    wakeActive,
    wakeFlash,
    setWakeWord,
    start,
    stop,
    speak,
    stopSpeaking,
    reset,
  };
}

export type VoiceController = ReturnType<typeof useVoice>;
