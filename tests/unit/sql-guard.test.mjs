import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMigrationSql } from '../../dist/packages/database/src/sql-guard.js';

for (const sql of ['BEGIN;', 'SELECT 1; COMMIT;', 'SELECT 1; -- comment\nROLLBACK;', '/* outer /* nested */ done */ START TRANSACTION;', 'END;', "PREPARE TRANSACTION 'x';"]) {
  test(`transaction control rejected: ${sql}`, () => assert.throws(() => validateMigrationSql(sql), /transaction/));
}
for (const sql of ["SELECT 'COMMIT;';", 'SELECT "BEGIN" FROM sample;', '-- BEGIN;\nSELECT 1;', 'DO $body$ BEGIN PERFORM 1; END $body$;', "SELECT 'doubled '' quote';", "SELECT E'escaped \\' quote';"]) {
  test(`literal/comment is not mistaken for top-level control: ${sql}`, () => assert.doesNotThrow(() => validateMigrationSql(sql)));
}
for (const sql of ["SELECT 'unterminated", '/* missing', 'DO $body$ missing']) {
  test(`unterminated SQL rejected: ${sql}`, () => assert.throws(() => validateMigrationSql(sql), /Unclosed/));
}
