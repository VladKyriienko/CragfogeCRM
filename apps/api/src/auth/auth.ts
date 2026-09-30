import { randomUUID } from 'node:crypto';
import { betterAuth, type Auth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { twoFactor } from 'better-auth/plugins';
import {
  accounts,
  getAppDb,
  sessions,
  twoFactors,
  users,
  verifications,
} from '@cragfoge/db';
import type { Env } from '../config/env';
import type { EmailProvider } from '../email/email.types';
import { AuditService } from '../audit/audit.service';

/**
 * Portable auth handle for Nest DI.
 * Better Auth's inferred return type references Zod 4 `$strip` and is not
 * declaration-safe when our workspace pins Zod 3 — widen via `Auth`.
 */
export type AuthInstance = Auth;

export function createAuth(env: Env, email: EmailProvider, audit: AuditService): AuthInstance {
  const db = getAppDb(env.DATABASE_URL);

  // Cast: plugin-specific Auth<Options> is not assignable to Auth defaults.
  return betterAuth({
    baseURL: env.API_BASE_URL,
    basePath: '/api/auth',
    secret: env.AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        twoFactor: twoFactors,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification:
        env.AUTH_REQUIRE_EMAIL_VERIFICATION ?? env.NODE_ENV === 'production',
      sendResetPassword: async ({ user, url }) => {
        await email.send({
          to: user.email,
          subject: 'Reset your Cragfoge CRM password',
          text: `Reset your password: ${url}`,
          html: `<p>Reset your password:</p><p><a href="${url}">${url}</a></p>`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await email.send({
          to: user.email,
          subject: 'Verify your Cragfoge CRM email',
          text: `Verify your email: ${url}`,
          html: `<p>Verify your email:</p><p><a href="${url}">${url}</a></p>`,
        });
      },
    },
    advanced: {
      database: {
        generateId: () => randomUUID(),
      },
      crossSubDomainCookies: {
        enabled: false,
      },
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        httpOnly: true,
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      // Default covers most auth routes. get-session is much higher below —
      // the SPA calls it on navigation and must not share a 20/min bucket with
      // sign-in attempts (especially behind the Vite proxy).
      max: env.NODE_ENV === 'production' ? 100 : 1_000,
      storage: 'memory',
      customRules: {
        '/get-session': {
          window: 60,
          max: env.NODE_ENV === 'production' ? 600 : 10_000,
        },
        '/sign-in/email': {
          window: 60,
          max: 20,
        },
        '/sign-up/email': {
          window: 60,
          max: 20,
        },
        '/forget-password': {
          window: 60,
          max: 10,
        },
        '/request-password-reset': {
          window: 60,
          max: 10,
        },
      },
    },
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            await audit.log({
              actorUserId: session.userId,
              action: 'auth.sign_in',
              entityType: 'user',
              entityId: session.userId,
            });
          },
        },
      },
    },
    plugins: [
      twoFactor({
        issuer: 'Cragfoge CRM',
      }),
    ],
  }) as unknown as AuthInstance;
}
