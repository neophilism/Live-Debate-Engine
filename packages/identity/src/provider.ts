import { randomUUID } from 'node:crypto';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { PostgresDialect } from 'kysely';
import type { Pool } from 'pg';
import { identityConfig, type IdentityConfig } from './config.js';

export type IdentityMail = Readonly<{ to: string; kind: 'verify-email' | 'reset-password'; url: string }>;
export type IdentityMailer = (message: IdentityMail) => Promise<void>;
export type IdentityOptions = Readonly<{ pool: Pool; config: IdentityConfig; sendMail: IdentityMailer; backgroundTask?: (task: Promise<unknown>) => void }>;
const successful = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !(value instanceof Error);

/** Only the identity process holds this pool; competition code uses a non-owner runtime role. */
export function createIdentity(options: IdentityOptions) {
  const config = identityConfig(options.config.origin, options.config.secret, options.config.environment);
  const { pool, sendMail } = options;
  const requireRecentProof = async (sessionId: string, userId: string) => {
    const result = await pool.query<{ allowed: boolean }>('SELECT lde_security.provider_recent_proof($1,$2) AS allowed', [sessionId, userId]);
    if (result.rows[0]?.allowed !== true) throw new APIError('FORBIDDEN', { message: 'Complete a fresh second-factor challenge', code: 'MFA_REQUIRED' });
  };
  const settings = {
    appName: 'Live Debate Engine', baseURL: config.origin, basePath: '/api/auth', secret: config.secret,
    database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: 'lde_auth', transaction: true },
    trustedOrigins: [config.origin],
    emailAndPassword: {
      enabled: true, requireEmailVerification: true, minPasswordLength: 12, maxPasswordLength: 128,
      autoSignIn: false, revokeSessionsOnPasswordReset: true, resetPasswordTokenExpiresIn: 900,
      sendResetPassword: async ({ user, token }) => {
        const target = new URL('/reset-password', config.origin); target.searchParams.set('token', token);
        await sendMail({ to: user.email, kind: 'reset-password', url: target.href });
      },
      onPasswordReset: async ({ user }) => { await pool.query('SELECT lde_security.provider_revoke_identity($1,NULL)', [user.id]); },
    },
    emailVerification: {
      sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: false, expiresIn: 1800,
      sendVerificationEmail: async ({ user, url }) => sendMail({ to: user.email, kind: 'verify-email', url }),
    },
    account: { accountLinking: { enabled: false } },
    session: { expiresIn: 28800, updateAge: 3600, cookieCache: { enabled: false } },
    user: { changeEmail: { enabled: false }, deleteUser: { enabled: false } },
    advanced: {
      ...(options.backgroundTask ? { backgroundTasks: { handler: options.backgroundTask } } : {}),
      database: { generateId: () => randomUUID() },
      cookiePrefix: 'lde', useSecureCookies: config.environment === 'production' || config.origin.startsWith('https:'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      crossSubDomainCookies: { enabled: false },
      // The HTTP adapter supplies the transport-derived peer; it removes caller-supplied forwarding headers.
      ipAddress: { ipAddressHeaders: ['x-lde-peer-address'] },
    },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 100, customRules: {
      '/sign-in/email': { window: 60, max: 10 }, '/sign-up/email': { window: 60, max: 5 },
      '/request-password-reset': { window: 60, max: 5 }, '/two-factor/*': { window: 60, max: 10 },
    } },
    logger: { disabled: true },
    plugins: [twoFactor({ issuer: 'Live Debate Engine', skipVerificationOnEnable: false, accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 } })],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/change-password') {
          const current = await getSessionFromCtx(ctx);
          if (current && 'twoFactorEnabled' in current.user && current.user.twoFactorEnabled === true) await requireRecentProof(current.session.id, current.user.id);
          if (ctx.body) ctx.body.revokeOtherSessions = true;
        }
        if (ctx.path.startsWith('/two-factor/')) {
          if (ctx.body?.trustDevice === true) throw new APIError('BAD_REQUEST', { message: 'Remembered MFA is disabled', code: 'TRUSTED_DEVICE_DISABLED' });
          if (ctx.path === '/two-factor/enable' && ctx.body?.method && ctx.body.method !== 'totp') throw new APIError('BAD_REQUEST', { message: 'Use an authenticator app', code: 'TOTP_REQUIRED' });
          const current = await getSessionFromCtx(ctx);
          if (current && ['/two-factor/disable', '/two-factor/generate-backup-codes', '/two-factor/get-totp-uri'].includes(ctx.path)) {
            await requireRecentProof(current.session.id, current.user.id);
          }
          if (current && ['/two-factor/verify-totp', '/two-factor/verify-backup-code'].includes(ctx.path)) {
            const result = await pool.query<{ allowed: boolean }>('SELECT lde_security.provider_attempt($1) AS allowed', [current.user.id]);
            if (!result.rows[0]?.allowed) throw new APIError('TOO_MANY_REQUESTS', { message: 'Second-factor attempt budget exhausted', code: 'MFA_RATE_LIMITED' });
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const returned = ctx.context.returned;
        if (!successful(returned)) return;
        if (['/two-factor/verify-totp', '/two-factor/verify-backup-code'].includes(ctx.path) && typeof returned.token === 'string') {
          const active = ctx.context.newSession ?? ctx.context.session;
          if (!active) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'No verified session', code: 'SESSION_BINDING_FAILED' });
          try {
            await pool.query('SELECT lde_security.provider_record_proof($1,$2,$3)', [active.session.id, active.user.id, ctx.path.endsWith('verify-totp') ? 'totp' : 'recovery']);
          } catch {
            // A partially completed challenge must not leave a usable newly issued session.
            if (ctx.context.newSession) await pool.query('DELETE FROM lde_auth.session WHERE id=$1', [active.session.id]);
            throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Second-factor session binding failed', code: 'SESSION_BINDING_FAILED' });
          }
        }
        if ((ctx.path === '/two-factor/disable' && returned.status === true) || (ctx.path === '/change-password' && typeof returned.token === 'string')) {
          const active = ctx.context.newSession ?? ctx.context.session;
          if (active) await pool.query('SELECT lde_security.provider_revoke_identity($1,$2)', [active.user.id, active.session.id]);
        }
      }),
    },
    databaseHooks: {
      session: { create: { before: async (session) => {
        const result = await pool.query<{ enabled: boolean }>('SELECT lde_security.provider_identity_enabled($1) AS enabled', [session.userId]);
        return result.rows[0]?.enabled === true ? { data: session } : false;
      } } },
    },
  } satisfies BetterAuthOptions;
  return betterAuth(settings);
}
export type IdentityProvider = ReturnType<typeof createIdentity>;
