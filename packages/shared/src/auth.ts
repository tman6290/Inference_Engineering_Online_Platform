import { z } from 'zod';

export const POD_SIZE = 2;
export const PASSWORD_MIN_LENGTH = 10;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address.' }));

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(200, 'Use at most 200 characters.');

export const registerRequestSchema = z.object({
  email,
  password,
  displayName: z.string().trim().min(1, 'Enter your name.').max(40, 'Use at most 40 characters.'),
  inviteCode: z.string().trim().min(1, 'An invite code is required.'),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.').max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const podColourSchema = z.enum(['lime', 'butter']);
export type PodColour = z.infer<typeof podColourSchema>;

export const publicUserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  initial: z.string(),
  colour: podColourSchema,
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const meResponseSchema = z.object({
  user: publicUserSchema.extend({ email: z.string() }),
  /** Both seats, the signed-in user first. Has one entry until the partner registers. */
  pod: z.array(publicUserSchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const authErrorCodes = [
  'validation_failed',
  'invalid_invite',
  'invite_spent',
  'pod_full',
  'email_taken',
  'invalid_credentials',
  'unauthenticated',
  'rate_limited',
] as const;
export type AuthErrorCode = (typeof authErrorCodes)[number];

export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  fields: z.record(z.string(), z.string()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
