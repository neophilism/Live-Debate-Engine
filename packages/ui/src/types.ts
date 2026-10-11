import type { Action } from '../../contracts/src/access.js';

export type Brand = Readonly<{ id: 'engine' | 'forum-house' | 'civic-exchange'; name: string; monogram: string; description: string }>;
export type InterfaceConfig = Readonly<{ brand: Brand; features: { identity: boolean; storage: boolean }; stage: 'foundation' }>;
export type Session = Readonly<{ principalId: string; sessionId: string; assurance: 'mfa' | 'single-factor'; mfaVerifiedAt: string | null; twoFactorEnabled: boolean }>;
export type Workspace = Readonly<{ tenantId: string; eventId: string; title: string; format: string; mode: string; capabilities: readonly Action[] }>;
export type ObjectPurpose = 'identity-document' | 'judge-note' | 'finance-document' | 'production-asset';
export type FileRecord = Readonly<{ id: string; purpose: ObjectPurpose; contentType: string; byteLength: number; state: 'quarantined' | 'released' | 'rejected' | 'revoked'; generation: number; createdAt: string; canRevoke: boolean }>;
export type Page<T> = Readonly<{ items: readonly T[]; nextCursor: string | null }>;
export const purposeLabels: Readonly<Record<ObjectPurpose, string>> = Object.freeze({
  'identity-document': 'Identity document', 'judge-note': 'Private judging note',
  'finance-document': 'Financial document', 'production-asset': 'Production asset',
});
