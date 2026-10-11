import { loadMigrations } from '../dist/packages/database/src/migrations.js';
const migrations = await loadMigrations();
console.log(JSON.stringify({ migrationFiles: migrations.length, checksumsValidated: true }));
