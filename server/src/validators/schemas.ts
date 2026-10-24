import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id');
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[a-zA-Z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Tell us your name').max(80),
  email,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  avatarUrl: z.string().trim().url().max(500).nullable().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const deleteAccountSchema = z.object({
  confirm: z.literal('DELETE'),
  password: z.string().max(128).optional(),
});

export const preferencesSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']).optional(),
  accent: z.string().max(20).optional(),
  voice: z
    .object({
      enabled: z.boolean().optional(),
      voiceURI: z.string().max(300).nullable().optional(),
      lang: z.string().max(20).optional(),
      rate: z.number().min(0.5).max(2).optional(),
      pitch: z.number().min(0).max(2).optional(),
      autoSpeak: z.boolean().optional(),
      wakeWordEnabled: z.boolean().optional(),
    })
    .optional(),
  notifications: z
    .object({
      inApp: z.boolean().optional(),
      reminders: z.boolean().optional(),
      reminderLeadMinutes: z.number().min(0).max(1440).optional(),
      emailDigest: z.boolean().optional(),
    })
    .optional(),
  search: z
    .object({
      includeEmails: z.boolean().optional(),
      topK: z.number().min(3).max(30).optional(),
    })
    .optional(),
  formatting: z.object({ density: z.enum(['comfortable', 'compact']).optional() }).optional(),
});

export const folderCreateSchema = z.object({
  name: z.string().trim().min(1, 'Folder name is required').max(120),
  parent: objectId.nullable().optional(),
  color: z.string().max(20).optional(),
});

export const folderUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  parent: objectId.nullable().optional(),
  color: z.string().max(20).optional(),
});

export const fileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  folder: objectId.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  favorite: z.boolean().optional(),
});

export const fileListQuery = z.object({
  folder: z.union([objectId, z.literal('root'), z.literal('all')]).optional(),
  q: z.string().max(200).optional(),
  ext: z.string().max(400).optional(),
  tag: z.string().max(40).optional(),
  favorite: z.enum(['true', 'false']).optional(),
  sort: z.enum(['recent', 'name', 'size', 'oldest']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['all', 'ready', 'processing', 'failed']).optional(),
});

export const chatSendSchema = z.object({
  conversationId: objectId.optional(),
  message: z.string().trim().min(1, 'Type a message').max(4000),
  fileId: objectId.optional(),
  includeEmails: z.boolean().optional(),
});

export const conversationCreateSchema = z.object({
  title: z.string().trim().max(120).optional(),
});

export const conversationUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export const searchSchema = z.object({
  q: z.string().trim().max(400).optional(),
  scope: z.enum(['all', 'files', 'emails']).optional(),
  type: z.enum(['all', 'files', 'emails']).optional(),
  ext: z.string().max(400).optional(),
  folder: z.string().max(24).optional(),
  tag: z.string().max(40).optional(),
  favorite: z.enum(['true', 'false']).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  sender: z.string().max(200).optional(),
  subject: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const askSchema = z.object({
  question: z.string().trim().min(2).max(4000),
  fileId: objectId.optional(),
  includeEmails: z.boolean().optional(),
});

export const gmailListQuery = z.object({
  q: z.string().max(400).optional(),
  pageToken: z.string().max(500).optional(),
  maxResults: z.coerce.number().int().min(1).max(50).optional(),
  unreadOnly: z.enum(['true', 'false']).optional(),
});

export const gmailSendSchema = z.object({
  to: z.string().trim().email('Recipient must be a valid email').max(320),
  cc: z.string().trim().max(320).optional(),
  subject: z.string().trim().min(1, 'Subject is required').max(300),
  body: z.string().trim().min(1, 'Message body is required').max(20000),
  threadId: z.string().max(100).optional(),
  confirmed: z.literal(true, { errorMap: () => ({ message: 'You must review and confirm before sending.' }) }),
});

export const draftReplySchema = z.object({
  instruction: z.string().trim().max(500).optional(),
  tone: z.enum(['professional', 'friendly', 'brief', 'formal']).optional(),
});

export const voiceCommandSchema = z.object({
  transcript: z.string().trim().min(1, 'No speech detected').max(1000),
  includeEmails: z.boolean().optional(),
});

export const taskCreateSchema = z.object({
  title: z.string().trim().min(2, 'Give the task a name').max(200),
  notes: z.string().trim().max(4000).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  remindAt: z.string().datetime({ offset: true }).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  status: z.enum(['todo', 'done']).optional(),
  tags: z.array(z.string().trim().max(30)).max(10).optional(),
  source: z
    .object({
      type: z.enum(['manual', 'email', 'file', 'ai']),
      refId: z.string().max(120).optional(),
      label: z.string().max(200).optional(),
    })
    .optional(),
});

export const taskUpdateSchema = taskCreateSchema.partial().extend({
  completed: z.boolean().optional(),
});

export const taskListQuery = z.object({
  status: z.enum(['todo', 'done', 'all']).optional(),
  filter: z.enum(['upcoming', 'overdue', 'today', 'all']).optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const extractTasksSchema = z
  .object({
    fileId: objectId.optional(),
    gmailId: z.string().max(100).optional(),
  })
  .refine((v) => Boolean(v.fileId || v.gmailId), { message: 'Provide fileId or gmailId' });

export const idParam = z.object({ id: objectId });
export const conversationIdParam = z.object({ id: objectId });
export const gmailIdParam = z.object({ id: z.string().min(5).max(100) });
