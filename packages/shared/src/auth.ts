import { z } from 'zod';

export const signUpBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
});

export const signInBodySchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
});

export const forgotPasswordBodySchema = z.object({
  email: z.string().trim().email().max(320),
  redirectTo: z.string().url().optional(),
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export type SignUpBody = z.infer<typeof signUpBodySchema>;
export type SignInBody = z.infer<typeof signInBodySchema>;
