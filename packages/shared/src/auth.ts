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

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.').max(200),
    newPassword: password,
  })
  .refine((input) => input.newPassword !== input.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from your current one.',
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const meResponseSchema = z.object({
  user: publicUserSchema.extend({
    email: z.string(),
    /** True after an admin set a temporary password; the app asks for a new one first. */
    mustChangePassword: z.boolean(),
  }),
  /** Both seats, the signed-in user first. Has one entry until the partner registers. */
  pod: z.array(publicUserSchema),
  /**
   * Acceptance rate: questions accepted on the first try / questions answered, across check
   * questions, checkpoints and exercises. Null before the first answer.
   */
  stats: z.object({
    answered: z.number().int(),
    acceptedFirstTry: z.number().int(),
    acceptanceRate: z.number().nullable(),
    /** Consecutive study days ending today or yesterday. */
    uptime: z.number().int(),
  }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const authErrorCodes = [
  'validation_failed',
  'invalid_invite',
  'invite_spent',
  'pod_full',
  'email_taken',
  'invalid_credentials',
  'wrong_password',
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
