import { searchFiles } from './search';
import { emailSearchFilter } from './emailSearch';
import { answerQuestion } from './rag';
import { features } from '../config/features';
import { parseDateRange, stripDatePhrases } from '../utils/dateParse';
import { clamp } from '../utils/text';

export type VoiceActionType = 'navigate' | 'file_search' | 'email_search' | 'ask' | 'create_task' | 'summarize' | 'none';

export interface VoiceAction {
  type: VoiceActionType;
  route?: string;
  query?: string;
  spoken: string;
  data?: Record<string, unknown>;
}

const ROUTES: { route: string; patterns: RegExp; label: string }[] = [
  { route: '/dashboard', patterns: /\b(dashboard|home|overview)\b/i, label: 'dashboard' },
  { route: '/chat', patterns: /\b(chat|assistant|kynov ai chat)\b/i, label: 'AI chat' },
  { route: '/files', patterns: /\b(files|file manager|documents)\b/i, label: 'files' },
  { route: '/gmail', patterns: /\b(inbox|gmail|mail)\b/i, label: 'Gmail inbox' },
  { route: '/search', patterns: /\b(smart search|search page)\b/i, label: 'smart search' },
  { route: '/voice', patterns: /\b(voice|microphone)\b/i, label: 'voice assistant' },
  { route: '/tasks', patterns: /\b(tasks|reminders|todo|to-do)\b/i, label: 'tasks' },
  { route: '/settings', patterns: /\b(settings|preferences|profile|account)\b/i, label: 'settings' },
];

const NAV_ONLY = /^(open|go to|show|take me to|navigate to)\s+(the\s+)?(dashboard|home|chat|assistant|files|file manager|inbox|gmail|mail|smart search|voice|tasks|reminders|settings|preferences|profile)\s*$/i;

export function parseVoiceCommand(rawTranscript: string): { action: VoiceActionType; route?: string; query?: string } {
  const transcript = (rawTranscript || '').trim().replace(/^(hey|hi|ok|okay)\s+kynov[,!.]?\s*/i, '');
  if (!transcript) return { action: 'none' };

  if (NAV_ONLY.test(transcript) || /^(open|go to|take me to|navigate to)\b/i.test(transcript)) {
    const hit = ROUTES.find((r) => r.patterns.test(transcript));
    if (hit) return { action: 'navigate', route: hit.route };
  }

  if (/\b(new task|create (a )?task|add (a )?task|remind me)\b/i.test(transcript)) {
    return { action: 'create_task', query: transcript };
  }
  if (/\b(summarize|summarise|tl;?dr)\b/i.test(transcript)) {
    return { action: 'summarize', query: transcript };
  }
  if (/\b(email|emails|mail|inbox|gmail)\b/i.test(transcript)) {
    return { action: 'email_search', query: transcript };
  }
  if (/\b(find|search|show|locate|open|where is|look for)\b/i.test(transcript)) {
    return { action: 'file_search', query: transcript };
  }
  return { action: 'ask', query: transcript };
}

/**
 * Executes an authorised voice command server-side and returns a spoken reply
 * plus structured results the client renders. No hidden actions: the client
 * still performs navigation, and task creation requires confirmation.
 */
export async function handleVoiceCommand(userId: string, transcript: string, opts: { includeEmails?: boolean } = {}) {
  const parsed = parseVoiceCommand(transcript);

  if (parsed.action === 'none') {
    return {
      transcript,
      action: parsed,
      spoken: 'I did not catch that. Tap the microphone and try again.',
      results: null,
    } satisfies Record<string, unknown>;
  }

  if (parsed.action === 'navigate') {
    const label = ROUTES.find((r) => r.route === parsed.route)?.label ?? 'that page';
    return {
      transcript,
      action: parsed,
      spoken: `Opening ${label}.`,
      results: { route: parsed.route },
    };
  }

  if (parsed.action === 'create_task') {
    // Strip the trigger phrase to get a usable title; the user confirms before saving.
    const title = (parsed.query ?? transcript)
      .replace(/^.*?(new task|create (a )?task|add (a )?task|remind me( to)?)\s*/i, '')
      .trim();
    return {
      transcript,
      action: parsed,
      spoken: title ? `I can add “${clamp(title, 70)}”. Confirm it on screen and I will save it.` : 'What should the task be?',
      results: { suggestedTask: { title: clamp(title || transcript, 200) } },
    };
  }

  const dateRange = parseDateRange(transcript);
  const cleaned = stripDatePhrases(transcript) || transcript;

  if (parsed.action === 'file_search' || parsed.action === 'summarize') {
    const { results: files } = await searchFiles(userId, cleaned, {
      from: dateRange?.from,
      to: dateRange?.to,
      limit: 8,
    });
    const spoken = files.length
      ? `I found ${files.length} ${files.length === 1 ? 'file' : 'files'}${dateRange?.label ? ` from ${dateRange.label}` : ''}. ${files
          .slice(0, 2)
          .map((f) => f.name)
          .join(', ')}${files.length > 2 ? ' and more' : ''}. They are on your screen now.`
      : `I could not find a file matching that${dateRange?.label ? ` from ${dateRange.label}` : ''}. Try different words, or upload it first.`;
    return { transcript, action: parsed, spoken, results: { files } };
  }

  if (parsed.action === 'email_search') {
    if (!features.gmail) {
      return {
        transcript,
        action: parsed,
        spoken: 'Gmail is not connected, so I cannot search your mail yet. Add Google credentials in the server environment.',
        results: { files: [], emails: [] },
      };
    }
    const { results: emails } = await emailSearchFilter(userId, {
      text: cleaned,
      fromDate: dateRange?.from,
      toDate: dateRange?.to,
      limit: 8,
    });
    const spoken = emails.length
      ? `I found ${emails.length} matching email${emails.length > 1 ? 's' : ''}. The most recent is “${clamp(emails[0].subject, 60)}” from ${emails[0].from.name || emails[0].from.email}.`
      : 'I found no cached emails matching that. Open your inbox once so I can index the message headers.';
    return { transcript, action: parsed, spoken, results: { emails } };
  }

  // General question → full RAG answer (spoken summary, full text on screen).
  const answer = await answerQuestion({ userId, question: cleaned, includeEmails: opts.includeEmails ?? true });
  const spoken = clamp(
    answer.answer
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[*_`#>]/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
    480,
  );
  return {
    transcript,
    action: parsed,
    spoken,
    results: { answer: answer.answer, files: answer.files, sources: answer.sources, mode: answer.mode },
  };
}
