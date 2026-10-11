import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseConfig } from '../../dist/packages/database/src/config.js';

const remote = 'postgresql://test_user:test_only@db.example.invalid/lde';
test('remote TLS verifies certificates and strips URI overrides', () => {
  const config = databaseConfig(`${remote}?sslmode=require&channel_binding=prefer`);
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.equal(new URL(config.connectionString).search, '');
  assert.equal(config.enableChannelBinding, true);
});
for (const input of ['not a url', 'https://example.invalid/db', 'postgresql://localhost/']) {
  test(`invalid database URL rejected: ${input}`, () => assert.throws(() => databaseConfig(input), /Invalid database URL/));
}
for (const option of ['sslmode=disable', 'sslmode=no-verify', 'sslcert=secret.pem', 'host=evil.invalid', 'options=bad', 'channel_binding=require', 'channel_binding=disable']) {
  test(`unapproved connection option rejected: ${option}`, () => assert.throws(() => databaseConfig(`${remote}?${option}`), /Unsupported/));
}
test('ambiguous duplicate options are rejected before normalization', () => {
  for (const option of ['channel_binding=prefer&channel_binding=require', 'sslmode=require&sslmode=disable']) {
    assert.throws(() => databaseConfig(`${remote}?${option}`), /duplicate/);
  }
});
test('plaintext is opt-in and restricted to local non-production', () => {
  const local = 'postgresql://test_user:test_only@127.0.0.1/lde_dev?sslmode=disable';
  assert.equal(databaseConfig(local, { NODE_ENV: 'development', LDE_ALLOW_INSECURE_LOCAL_DB: '1' }).ssl, false);
  assert.throws(() => databaseConfig(local, { NODE_ENV: 'production', LDE_ALLOW_INSECURE_LOCAL_DB: '1' }), /restricted/);
  assert.throws(() => databaseConfig(remote, { LDE_ALLOW_INSECURE_LOCAL_DB: '1' }), /restricted/);
});
test('invalid environment fails closed', () => assert.throws(() => databaseConfig(remote, { NODE_ENV: 'prodution' }), /environment/));
