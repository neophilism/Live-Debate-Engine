/** Strip SQL literals/comments for a conservative transaction-control check.
 * Not a general SQL authorization boundary: migrations remain trusted reviewed source.
 */
export function validateMigrationSql(sql: string): void {
  let plain = '';
  let index = 0;
  while (index < sql.length) {
    if (sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index + 2);
      index = end === -1 ? sql.length : end;
      plain += ' ';
      continue;
    }
    if (sql.startsWith('/*', index)) {
      let depth = 1;
      index += 2;
      while (index < sql.length && depth > 0) {
        if (sql.startsWith('/*', index)) { depth += 1; index += 2; }
        else if (sql.startsWith('*/', index)) { depth -= 1; index += 2; }
        else index += 1;
      }
      if (depth !== 0) throw new Error('Unclosed SQL comment');
      plain += ' ';
      continue;
    }
    const quote = sql[index];
    if (quote === "'" || quote === '"') {
      const escaped = quote === "'" && /(?:^|[^\w$])[eE]$/.test(sql.slice(0, index));
      index += 1;
      let closed = false;
      while (index < sql.length) {
        if (escaped && sql[index] === '\\') { index += 2; continue; }
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) { index += 2; continue; }
          index += 1;
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) throw new Error('Unclosed SQL literal');
      plain += ' literal ';
      continue;
    }
    const tag = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
    if (tag) {
      const end = sql.indexOf(tag, index + tag.length);
      if (end === -1) throw new Error('Unclosed SQL dollar literal');
      index = end + tag.length;
      plain += ' literal ';
      continue;
    }
    plain += sql[index];
    index += 1;
  }
  if (/(?:^|;)\s*(?:BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK|END|ABORT|PREPARE\s+TRANSACTION)(?:\s|;|$)/i.test(plain)) {
    throw new Error('Migrations cannot control their transaction');
  }
}
