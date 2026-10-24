/**
 * End-to-end API smoke test for KYNOV AI.
 *
 *   npm --prefix server run test        (server must be running)
 *   BASE_URL=http://127.0.0.1:4000 npm --prefix server run test
 *
 * Exercises the real HTTP surface: auth, uploads (text + generated PDF),
 * extraction, semantic search, RAG chat, folders, tasks, notifications,
 * trash/restore, CSRF and cross-tenant isolation. No mocks.
 */
import PDFDocument from 'pdfkit';

const BASE = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 4000}`;

let passed = 0;
let failed = 0;
const failures: string[] = [];

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`${green('✓')} ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`${red('✗')} ${name}${detail !== undefined ? dim(` → ${JSON.stringify(detail).slice(0, 400)}`) : ''}`);
  }
}

class Session {
  cookies = new Map<string, string>();
  constructor(public label: string) {}

  private cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private absorb(res: Response) {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const cookie of raw) {
      const [pair] = cookie.split(';');
      const idx = pair.indexOf('=');
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(path: string, init: RequestInit & { csrf?: boolean } = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set('Cookie', this.cookieHeader());
    const unsafe = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (init.csrf !== false && (!init.method || unsafe.includes(init.method))) {
      headers.set('X-Requested-With', 'kynov-web');
    }
    if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: 'manual' });
    this.absorb(res);
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    return { status: res.status, body: json, res };
  }

  get = (p: string) => this.request(p);
  post = (p: string, body?: unknown, opts: { csrf?: boolean } = {}) =>
    this.request(p, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}), ...opts });
  patch = (p: string, body?: unknown) => this.request(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
  del = (p: string) => this.request(p, { method: 'DELETE' });
}

async function makePdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(20).text('KYNOV AI College Project Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text('Chapter 1 — Abstract');
    doc.moveDown(0.5);
    doc.text(
      'This project presents an intelligent personal workspace built with React, Node.js and MongoDB Atlas. ' +
        'The system uses retrieval-augmented generation over a vector index of the user documents so that ' +
        'questions about the abstract are answered with citations to the original PDF pages.',
    );
    doc.moveDown();
    doc.fontSize(12).text('Chapter 2 — Deadlines');
    doc.moveDown(0.5);
    doc.text('The final submission deadline is 15 November 2026. The mid-term review is scheduled for 3 October 2026.');
    doc.end();
  });
}

function formData(fields: Record<string, string>, file: { name: string; type: string; data: Buffer }[]) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  for (const f of file) fd.append('files', new Blob([f.data], { type: f.type }), f.name);
  return fd;
}

async function main() {
  console.log(`\nKYNOV AI · API smoke test → ${BASE}\n`);

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json() as any);
  check('health endpoint reports ok', health?.data?.status === 'ok', health?.data?.status);
  console.log(dim(`  features: ${JSON.stringify(health?.data?.features)}`));

  /* ── Auth ── */
  const alice = new Session('alice');
  const email = `smoke.${Date.now()}@kynov.test`;

  const badSignup = await alice.post('/api/auth/signup', { name: 'A', email: 'nope', password: '123' });
  check('signup rejects invalid payload (400)', badSignup.status === 400, badSignup.body);

  const signup = await alice.post('/api/auth/signup', { name: 'Alice Sharma', email, password: 'Passw0rd123' });
  check('signup creates account (201)', signup.status === 201 && signup.body?.data?.user?.email === email, signup.body);

  const me = await alice.get('/api/auth/me');
  check('session cookie authenticates /me', me.status === 200 && me.body?.data?.user?.email === email, me.status);

  const csrfAttempt = await alice.post('/api/tasks', { title: 'csrf probe' }, { csrf: false });
  check('cookie POST without CSRF header is blocked (403)', csrfAttempt.status === 403, csrfAttempt.status);

  const unauth = await new Session('anon').get('/api/files');
  check('unauthenticated file access is rejected (401)', unauth.status === 401, unauth.status);

  /* ── Folders ── */
  const folder = await alice.post('/api/folders', { name: 'College Project' });
  check('create folder (201)', folder.status === 201, folder.body);
  const folderId = folder.body?.data?.folder?.id as string;

  const subFolder = folderId ? await alice.post('/api/folders', { name: 'Report', parent: folderId }) : null;
  check('create subfolder', subFolder?.status === 201, subFolder?.body);

  /* ── Uploads ── */
  const txt = Buffer.from(
    `MongoDB Notes\n\nMongoDB Atlas provides a managed document database with vector search support. ` +
      `Indexes on the embedding field enable semantic retrieval. Compound indexes on user and created date ` +
      `keep per-tenant queries fast.\n\nThe internship report references MongoDB aggregation pipelines and $vectorSearch.`,
  );
  const uploadTxt = await alice.post('/api/files', formData({ folder: folderId ?? '', tags: 'notes,mongodb' }, [
    { name: 'MongoDB Notes.txt', type: 'text/plain', data: txt },
  ]));
  check('upload text file (201)', uploadTxt.status === 201 && uploadTxt.body?.data?.uploaded?.length === 1, uploadTxt.body);
  const txtId = uploadTxt.body?.data?.uploaded?.[0]?.id as string;
  check('text file is extracted and indexed', uploadTxt.body?.data?.uploaded?.[0]?.textExtracted === true, uploadTxt.body?.data?.uploaded?.[0]);

  const pdfBuffer = await makePdf();
  const uploadPdf = await alice.post('/api/files', formData({ folder: folderId ?? '' }, [
    { name: 'College Project Report.pdf', type: 'application/pdf', data: pdfBuffer },
  ]));
  const pdfFile = uploadPdf.body?.data?.uploaded?.[0];
  const pdfId = pdfFile?.id as string;
  check('upload PDF (201)', uploadPdf.status === 201 && Boolean(pdfId), uploadPdf.body);
  check('PDF text extracted with page count', pdfFile?.textExtracted === true && (pdfFile?.pageCount ?? 0) >= 1, pdfFile);

  const blocked = await alice.post('/api/files', formData({}, [
    { name: 'malware.exe', type: 'application/x-msdownload', data: Buffer.from('MZ') },
  ]));
  check('disallowed extension rejected (400)', blocked.status === 400, blocked.status);

  const list = await alice.get('/api/files?limit=10');
  check('file listing returns uploaded files', list.body?.data?.files?.length >= 2, list.body?.data?.files?.length);

  /* ── Content + access control ── */
  const content = await alice.get(`/api/files/${pdfId}/content`);
  check('file content downloads with correct type', content.status === 200, content.status);

  /* ── Search + RAG ── */
  const search = await alice.get('/api/search?q=which%20document%20contains%20my%20project%20abstract');
  const fileHits = search.body?.data?.files ?? [];
  check('smart search finds the project report', fileHits.some((f: any) => /project report/i.test(f.name)), fileHits.map((f: any) => f.name));
  check('search returns a match reason', Boolean(fileHits[0]?.reason), fileHits[0]?.reason);

  const searchByDate = await alice.get('/api/search?q=files%20I%20uploaded%20today');
  check('natural-language date filter works', (searchByDate.body?.data?.files ?? []).length >= 1, searchByDate.body?.data?.dateRange);

  const chat = await alice.post('/api/chat/message', { message: 'Which document contains my project abstract?' });
  const assistant = chat.body?.data?.assistantMessage;
  check('chat returns an assistant message (201)', chat.status === 201 && Boolean(assistant?.content), chat.status);
  check('chat attaches real file records', (assistant?.attachments ?? []).length > 0, assistant?.attachments);
  check('attached file id exists in the workspace', (assistant?.attachments ?? []).some((a: any) => a.id === pdfId || a.id === txtId), assistant?.attachments?.map((a: any) => a.id));
  console.log(dim(`  answer: ${String(assistant?.content ?? '').slice(0, 160).replace(/\n/g, ' ')}…`));
  check('chat response declares its mode', ['ai', 'retrieval'].includes(chat.body?.data?.mode), chat.body?.data?.mode);

  const convId = chat.body?.data?.conversation?.id;
  const convList = await alice.get('/api/chat/conversations');
  check('conversation appears in history', (convList.body?.data ?? []).some((c: any) => c.id === convId), convList.body?.data?.length);

  const renamed = await alice.patch(`/api/chat/conversations/${convId}`, { title: 'Abstract lookup' });
  check('rename conversation', renamed.body?.data?.conversation?.title === 'Abstract lookup', renamed.body?.data?.conversation?.title);

  const chatAgain = await alice.post('/api/chat/message', { conversationId: convId, message: 'Find the deadline mentioned in my document.' });
  check('follow-up message in same conversation', chatAgain.status === 201 && chatAgain.body?.data?.conversation?.id === convId, chatAgain.status);

  const detail = await alice.get(`/api/chat/conversations/${convId}`);
  check('conversation loads with messages', (detail.body?.data?.messages ?? []).length >= 4, detail.body?.data?.messages?.length);

  const noHits = await alice.post('/api/chat/message', { message: 'Find the recipe for chocolate lava cake in my files.' });
  check('no-match question is answered honestly', /could not find|no .*match|did not find/i.test(String(noHits.body?.data?.assistantMessage?.content)), String(noHits.body?.data?.assistantMessage?.content).slice(0, 160));

  /* ── Files: rename / move / favorite / trash ── */
  const renamedFile = await alice.patch(`/api/files/${txtId}`, { name: 'MongoDB Notes v2', favorite: true, tags: ['db'] });
  check('rename + favorite file', renamedFile.body?.data?.file?.name === 'MongoDB Notes v2.txt' && renamedFile.body?.data?.file?.favorite, renamedFile.body?.data?.file?.name);

  const moved = await alice.patch(`/api/files/${txtId}`, { folder: subFolder?.body?.data?.folder?.id });
  check('move file into subfolder', moved.status === 200, moved.status);

  const storage = await alice.get('/api/files/storage');
  check('storage usage tracked', (storage.body?.data?.usedBytes ?? 0) > 0, storage.body?.data?.usedBytes);

  const del = await alice.del(`/api/files/${txtId}`);
  check('soft delete moves file to trash', del.status === 200 && del.body?.data?.permanent === false, del.body);
  const trash = await alice.get('/api/files/trash');
  check('trash lists the deleted file', (trash.body?.data ?? []).some((f: any) => f.id === txtId), trash.body?.data?.length);
  const restore = await alice.post(`/api/files/${txtId}/restore`);
  check('restore from trash', restore.status === 200, restore.body);

  const reindex = await alice.post(`/api/files/${pdfId}/reindex`);
  check('re-index rebuilds embeddings', reindex.status === 200 && (reindex.body?.data?.indexed ?? 0) > 0, reindex.body?.data);

  const summary = await alice.post(`/api/files/${pdfId}/summarize`);
  check('AI summary is gated when no provider is configured', summary.status === 503 && summary.body?.error?.code === 'FEATURE_NOT_CONFIGURED', summary.body?.error?.code);

  /* ── Tasks ── */
  const task = await alice.post('/api/tasks', {
    title: 'Submit college project report',
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    priority: 'high',
  });
  check('create task (201)', task.status === 201, task.body);
  const taskId = task.body?.data?.task?.id;
  const doneTask = await alice.patch(`/api/tasks/${taskId}`, { completed: true });
  check('complete task', doneTask.body?.data?.task?.status === 'done', doneTask.body?.data?.task?.status);
  const upcoming = await alice.get('/api/tasks/upcoming');
  check('upcoming/overdue endpoint works', upcoming.status === 200, upcoming.status);

  /* ── Notifications ── */
  const notes = await alice.get('/api/notifications');
  check('notifications list generated activity', (notes.body?.data?.notifications ?? []).length > 0, notes.body?.data?.notifications?.length);
  const readAll = await alice.post('/api/notifications/read-all');
  check('mark all notifications read', readAll.status === 200, readAll.status);

  /* ── Preferences ── */
  const prefs = await alice.request('/api/preferences', { method: 'PUT', body: JSON.stringify({ theme: 'light', voice: { rate: 1.2 } }) });
  check('update preferences', prefs.body?.data?.preferences?.theme === 'light', prefs.body?.data?.preferences?.theme);

  /* ── Gmail / integrations (honest not-configured states) ── */
  const gmail = await alice.get('/api/gmail/status');
  check('gmail status endpoint responds', gmail.status === 200, gmail.status);
  const inbox = await alice.get('/api/gmail/inbox');
  check('gmail inbox reports unconnected state instead of fake mail', inbox.body?.data?.connected === false && Array.isArray(inbox.body?.data?.messages), inbox.body?.data?.notice);
  const connect = await alice.get('/api/gmail/oauth/start');
  check('gmail connect explains missing configuration (503)', connect.status === 503 && connect.body?.error?.code === 'FEATURE_NOT_CONFIGURED', connect.status);

  /* ── Voice command ── */
  const voice = await alice.post('/api/voice/command', { transcript: 'find my mongodb notes' });
  check('voice command executes a real file search', voice.status === 200 && (voice.body?.data?.results?.files ?? []).length > 0, voice.body?.data?.spoken);
  console.log(dim(`  spoken: ${voice.body?.data?.spoken}`));
  const nav = await alice.post('/api/voice/command', { transcript: 'open my tasks' });
  check('voice navigation returns a route', nav.body?.data?.results?.route === '/tasks', nav.body?.data?.results);

  /* ── Cross-tenant isolation ── */
  const bob = new Session('bob');
  const bobEmail = `smoke.bob.${Date.now()}@kynov.test`;
  await bob.post('/api/auth/signup', { name: 'Bob Verma', email: bobEmail, password: 'Passw0rd123' });
  const steal = await bob.get(`/api/files/${pdfId}`);
  check("another user cannot read Alice's file (404)", steal.status === 404, steal.status);
  const stealChat = await bob.get(`/api/chat/conversations/${convId}`);
  check("another user cannot read Alice's conversation (404)", stealChat.status === 404, stealChat.status);
  const bobSearch = await bob.get('/api/search?q=project%20abstract');
  check("another user's search returns nothing from Alice", (bobSearch.body?.data?.files ?? []).length === 0, bobSearch.body?.data?.files?.length);
  const bobDelete = await bob.del(`/api/files/${pdfId}`);
  check("another user cannot delete Alice's file (404)", bobDelete.status === 404, bobDelete.status);

  /* ── Session lifecycle ── */
  const logout = await alice.post('/api/auth/logout');
  check('logout clears cookies', logout.status === 200, logout.status);
  const afterLogout = await alice.get('/api/auth/me');
  check('access is denied after logout (401)', afterLogout.status === 401, afterLogout.status);

  const relogin = await alice.post('/api/auth/login', { email, password: 'Passw0rd123' });
  check('login with correct password', relogin.status === 200, relogin.status);
  const wrongPass = await new Session('x').post('/api/auth/login', { email, password: 'WrongPass1' });
  check('login rejects wrong password (401)', wrongPass.status === 401, wrongPass.status);

  console.log(`\n${failed === 0 ? green('ALL CHECKS PASSED') : red('FAILURES')} — ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log(red('\nFailed checks:'));
    for (const f of failures) console.log(`  • ${f}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(red(`\nSmoke test crashed: ${err?.stack ?? err}`));
  process.exit(1);
});
