import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveBrand } from '../../dist/packages/ui/src/brands.js';
import { Button, Field, Notice, Status, DataTable, PageHeader } from '../../dist/packages/ui/src/components.js';
import { ApiError, safeError } from '../../dist/packages/ui/src/api.js';

const render = (component, props, children) => renderToStaticMarkup(createElement(component, props, children));
test('deployment-selected brands are bounded, immutable and separate from tenant identity', () => {
  for (const id of ['engine', 'forum-house', 'civic-exchange']) assert.ok(Object.isFrozen(resolveBrand(id)));
  assert.notEqual(resolveBrand('forum-house').name, resolveBrand('civic-exchange').name);
  for (const id of ['constructor', '__proto__', 'UBC', '<script>', 'https://other.example']) assert.throws(() => resolveBrand(id));
});
test('field labels, error descriptions and native password semantics are preserved', () => {
  const html = render(Field, { id: 'password-field', label: 'Password', type: 'password', autoComplete: 'new-password', required: true, hint: 'Use a strong password.', error: 'Too short' });
  assert.match(html, /for="password-field"/); assert.match(html, /type="password"/); assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="password-field-hint password-field-error"/); assert.match(html, /autoComplete="new-password"/i);
});
test('status is communicated with text, not just color or decoration', () => {
  for (const [state, label] of [['quarantined', 'Awaiting safety check'], ['released', 'Available'], ['revoked', 'Access revoked']]) {
    const html = render(Status, { state }); assert.ok(html.includes(label)); assert.match(html, /aria-hidden="true"/);
  }
});
test('buttons declare native type and busy state, tables retain caption/header semantics', () => {
  const button = render(Button, { busy: true, type: 'submit' }, 'Save'); assert.match(button, /type="submit"/); assert.match(button, /disabled/); assert.match(button, /aria-busy="true"/);
  const table = render(DataTable, { caption: 'Private sessions', headings: ['Session', 'Action'] }); assert.match(table, /<caption>Private sessions<\/caption>/); assert.match(table, /scope="col"/);
});
test('errors are announced and arbitrary response details never become UI messages', () => {
  assert.match(render(Notice, { tone: 'error', focus: true }, 'Check the form'), /role="alert"/);
  assert.ok(!safeError(new Error('postgres://private-password@database')).includes('private-password'));
  assert.equal(new ApiError(429, 'rate_limit').message, 'Too many attempts. Please pause before trying again.');
});
test('untrusted displayed names are escaped, not interpreted as markup', () => {
  const html = render(PageHeader, { label: 'Event', title: '<img src=x onerror=alert(1)>' }); assert.ok(!html.includes('<img')); assert.ok(html.includes('&lt;img'));
});
