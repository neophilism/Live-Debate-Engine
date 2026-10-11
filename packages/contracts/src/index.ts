export const ENGINE_VERSION = '0.0.0-foundation.2';
export type Readiness = Readonly<{
  ready: boolean;
  reason: 'schema_compatible' | 'database_unconfigured' | 'database_unavailable' | 'schema_mismatch';
}>;
export type HealthResponse = Readonly<{
  status: 'alive';
  product: 'Live Debate Engine';
  version: string;
  release: string | null;
  stage: 'foundation';
  competitionReady: false;
}>;
