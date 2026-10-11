import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile } from 'node:fs/promises';
import { BRANDS, selectBrand } from '../../dist/packages/ui/src/branding.js';
import { AppShell, TimerDisplay, Field, DataTable, Notice, StatusBadge } from '../../dist/packages/ui/src/components.js';
import { readSession } from '../../dist/packages/ui/src/client.js';
import { createUiRuntime } from '../../dist/packages/ui/src/http.js';

const html = (component, props) => renderToStaticMarkup(createElement(component, props));
test('two neutral brands share a shell without changing authorization or embedding UBC identity', () => {
  for (const brand of Object.values(BRANDS)) {
    const output = html(AppShell, { brand, path: '/workspaces', signedIn: true, children: 'Contents' });
    assert.ok(output.includes(brand.name)); assert.ok(output.includes('aria-current="page"')); assert.ok(output.includes('Skip to main content'));
    assert.ok(!output.includes('UBC')); assert.ok(!output.includes('localStorage'));
  }
  assert.throws(() => selectBrand('constructor')); assert.throws(() => selectBrand('<script>'));
});
test('component text is escaped and labels and descriptions are connected', () => {
  const output = html(Field, { label: '<img src=x>', name: 'email', hint: 'Example description' });
  assert.ok(output.includes('&lt;img src=x&gt;')); assert.ok(output.includes('aria-describedby=')); assert.ok(output.includes('<label for='));
  assert.ok(html(Notice, { children: '<script>x</script>', tone: 'error' }).includes('role="alert"'));
  assert.ok(html(StatusBadge, { label: 'Review needed', tone: 'warning' }).includes('Review needed'));
  assert.ok(html(DataTable, { caption: 'Records', headings: ['Name'], children: null }).includes('scope="col"'));
});
test('timer is a static accessible display, with warnings in text and invalid values rejected', () => {
  assert.ok(html(TimerDisplay, { remainingSeconds: 30 }).includes('Thirty seconds or less remaining'));
  assert.ok(html(TimerDisplay, { remainingSeconds: 0 }).includes('Time has expired'));
  assert.ok(html(TimerDisplay, { remainingSeconds: 60, paused: true }).includes('Paused'));
  for (const remainingSeconds of [-1, NaN, Infinity, 1.5, 86401]) assert.throws(() => html(TimerDisplay, { remainingSeconds }));
});
test('session response parsing rejects unavailable or malformed identity', () => {
  for (const value of [null, {}, { principalId: 'x', sessionId: 'y', assurance: 'admin', mfaVerifiedAt: null }]) assert.throws(() => readSession(value));
});
test('static UI fails on unknown branding and browser bundle excludes server authority', async () => {
  await assert.rejects(createUiRuntime('unknown', true));
  const bundle = await readFile('dist/ui/assets/ui.js', 'utf8');
  for (const forbidden of ['lde.credential', 'LDE_IDENTITY_SECRET', 'DATABASE_URL', 'PRIVATE KEY', 'localStorage', 'sessionStorage']) assert.equal(bundle.includes(forbidden), false, forbidden);
});
