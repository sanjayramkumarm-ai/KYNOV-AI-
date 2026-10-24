import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BrainCircuit,
  FileSearch,
  FolderLock,
  Gauge,
  Mail,
  Mic,
  ShieldCheck,
  Sparkles,
  Waypoints,
} from 'lucide-react';
import { AiOrb } from '../components/common/AiOrb';

const FEATURES = [
  {
    icon: FileSearch,
    title: 'Ask your documents',
    body: 'Hybrid vector + keyword retrieval finds the exact file and page, then answers with citations to the real document.',
  },
  {
    icon: Mail,
    title: 'Gmail, without leaving',
    body: 'Read, search and summarise your inbox through the official Gmail API. Sending stays behind an extra permission and a confirmation step.',
  },
  {
    icon: Mic,
    title: 'Voice-first control',
    body: 'Push-to-talk or “Hey KYNOV” wake word where supported. Spoken answers, live transcripts, and honest permission prompts.',
  },
  {
    icon: FolderLock,
    title: 'Private by architecture',
    body: 'Every query is scoped to your user id. OAuth tokens are AES-256-GCM encrypted and never reach the browser.',
  },
  {
    icon: Waypoints,
    title: 'One workspace',
    body: 'Files, folders, tasks, reminders, conversations and notifications in a single, fast, keyboard-friendly interface.',
  },
  {
    icon: Gauge,
    title: 'Runs on your stack',
    body: 'React + Express + MongoDB Atlas. Point it at OpenAI, Groq, Ollama or any compatible endpoint — or run retrieval-only with no AI key.',
  },
];

const STEPS = [
  { title: 'Create your workspace', body: 'Sign up with email or Google. Your vault is created instantly and scoped to you.' },
  { title: 'Drop in your files', body: 'PDF, Word, Excel, PowerPoint, images and text are stored in object storage and indexed.' },
  { title: 'Connect Gmail (optional)', body: 'Grant read-only access first. Sending asks for one extra scope, only when you enable it.' },
  { title: 'Ask, speak, act', body: 'Search by meaning, listen to answers, and turn deadlines into tasks you confirm.' },
];

export default function LandingPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
      {/* Hero */}
      <section className="relative grid items-center gap-10 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="chip border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
            <Sparkles className="h-3 w-3" /> Retrieval-augmented workspace
          </span>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Your files, your inbox,
            <br />
            <span className="gradient-text">answered by AI.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            KYNOV AI is an intelligent personal workspace. Upload documents, connect Gmail, and ask questions in plain language
            or by voice. Every answer points back to the file and page it came from.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to="/signup" className="btn-primary px-5 py-3 text-sm">
              Create your workspace <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login" className="btn-secondary px-5 py-3 text-sm">
              I already have an account
            </Link>
          </div>
          <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 border-t pt-6">
            {[
              { k: 'Hybrid search', v: 'Vector + lexical' },
              { k: 'Voice', v: 'Web Speech API' },
              { k: 'Scopes', v: 'Least privilege' },
            ].map((s) => (
              <div key={s.k}>
                <dt className="text-[11px] uppercase tracking-wider text-muted">{s.k}</dt>
                <dd className="mt-1 text-sm font-medium text-content">{s.v}</dd>
              </div>
            ))}
          </dl>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="relative mx-auto flex w-full max-w-md items-center justify-center"
        >
          <div className="absolute inset-0 rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-violet-500/10 via-transparent to-cyan-400/10 blur-2xl" />
          <div className="panel relative w-full overflow-hidden p-6">
            <div className="flex items-center gap-2 border-b pb-3 text-[11px] text-muted">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Live workspace preview
            </div>
            <div className="mt-5 flex flex-col items-center gap-4">
              <AiOrb state="speaking" size={150} />
              <div className="w-full space-y-2">
                <div className="rounded-xl border border-white/10 bg-ink-900/70 px-3 py-2 text-[12px] text-content">
                  “Find my AI project PDF and summarise the abstract.”
                </div>
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-2 text-[12px] leading-relaxed text-content/90">
                  Found <span className="font-medium">College Project Report.pdf</span> · 24 pages. The abstract covers a
                  retrieval-augmented personal workspace built on React, Node.js and MongoDB Atlas{' '}
                  <span className="text-cyan-300">[1, page 1]</span>.
                </div>
              </div>
              <div className="grid w-full grid-cols-2 gap-2">
                {['Open file', 'Download', 'View page 1', 'Ask follow-up'].map((a, i) => (
                  <div
                    key={a}
                    className={`rounded-lg border px-2.5 py-1.5 text-center text-[11px] ${
                      i === 0 ? 'border-violet-400/30 bg-violet-500/10 text-violet-200' : 'border-white/10 text-muted'
                    }`}
                  >
                    {a}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24 py-12">
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">Built for real work, not demos</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Every feature below is wired to a live API. When a provider is not configured, KYNOV tells you exactly which
          environment variable is missing instead of showing invented results.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="panel card-hover p-5"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-400/25 bg-violet-500/10 text-violet-300">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-content">{title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-24 py-12">
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">How it works</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="panel-flat relative p-5">
              <span className="font-mono text-xs text-cyan-300">0{i + 1}</span>
              <h3 className="mt-2 text-sm font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Security */}
      <section id="security" className="scroll-mt-24 py-12">
        <div className="panel relative overflow-hidden p-6 sm:p-10">
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-2">
            <div>
              <span className="chip border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                <ShieldCheck className="h-3 w-3" /> Security model
              </span>
              <h2 className="mt-3 font-display text-2xl font-semibold">Least privilege, enforced server-side</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                The browser never sees an API key, a database URI or a Google refresh token. Access tokens live in
                httpOnly cookies; OAuth tokens are encrypted at rest; each query includes your user id so one account can
                never read another's files, email or chat history.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-muted">
                {[
                  'bcrypt password hashing with rotating refresh-token sessions',
                  'CSRF header + SameSite cookies on every state change',
                  'Upload allow-list, size caps and SHA-256 checksums',
                  'Documents treated as untrusted data — never as instructions',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <BrainCircuit className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border bg-ink-950/60 p-5">
              <p className="text-[11px] uppercase tracking-wider text-muted">Request path</p>
              <pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-relaxed text-content/80">{`Browser  ──cookie──▶  Express API
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   MongoDB Atlas   Object storage   AI provider
   (scoped by user)  (files only)    (server key)`}</pre>
              <p className="mt-4 text-[11px] leading-relaxed text-muted">
                Retrieval runs against your own chunks. If you have no AI key, KYNOV still returns files with match
                reasons — never fabricated answers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-violet-600/20 via-ink-900 to-cyan-500/15 p-8 text-center sm:p-14">
          <h2 className="font-display text-2xl font-semibold sm:text-4xl">Ready to talk to your workspace?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
            Set up in a minute. Bring your own OpenAI-compatible key and a MongoDB Atlas cluster, or run it locally with the
            built-in development database.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/signup" className="btn-primary px-6 py-3">
              Get started free <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#features" className="btn-secondary px-6 py-3">
              Explore features
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
