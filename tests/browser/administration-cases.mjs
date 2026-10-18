import assert from 'node:assert/strict';
/** Reused by the real identity/PostgreSQL browser suite; all records are synthetic. */
export async function administrationJourney({ page, origin, tenant, expect, audit, grantEvent }) {
  await page.goto(`${origin}/administration?tenant=${tenant}`);
  await expect(page.getByLabel('Series name', { exact: true })).toBeVisible();
  await page.getByLabel('Series name', { exact: true }).fill('Synthetic organizer series');
  await page.getByLabel('Season', { exact: true }).fill('2027');
  await page.getByLabel('Series starts on').fill('2027-01-01'); await page.getByLabel('Series ends on').fill('2027-12-31');
  await page.getByRole('button', { name: 'Create series', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review series · revision 1', exact: true })).toBeVisible();
  await page.getByLabel('Series name', { exact: true }).fill('Synthetic organizer series revised'); await page.getByRole('button', { name: 'Save new revision', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review series · revision 2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New motion', exact: true }).click();
  await page.getByLabel('Series', { exact: true }).selectOption({ label: 'Synthetic organizer series revised' });
  await page.getByLabel('Motion wording', { exact: true }).fill('Resolved: cities should remove parking minimums.');
  await page.getByLabel('Motion description', { exact: true }).fill('Synthetic urban policy discussion.'); await page.getByLabel('Categories, separated by commas').fill('Housing, Transport');
  await page.getByRole('button', { name: 'Create motion', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review motion · revision 1', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'I reviewed revision 1 and want to publish it.', exact: true }).check(); await page.getByRole('button', { name: 'Publish motion', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review motion · revision 2', exact: true })).toBeVisible();
  await expect(page.getByLabel('Motion wording', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'New event', exact: true }).click();
  await page.getByLabel('Series', { exact: true }).selectOption({ label: 'Synthetic organizer series revised' });
  await page.getByLabel('Published motion').selectOption({ label: 'Resolved: cities should remove parking minimums. · revision 2' });
  await page.getByLabel('Event title').fill('Synthetic housing debate'); await page.getByLabel('Venue', { exact: true }).fill('Synthetic town hall'); await page.getByLabel('Broadcast mode').selectOption('private-stream');
  const response = page.waitForResponse(r => /\/administration\/events\/[^/]+$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  const created = await (await response).json(); await grantEvent(created.current.snapshot.entityId);
  await expect(page.getByRole('heading', { name: 'Review event · revision 1', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'I reviewed revision 1 and want to publish it.', exact: true }).check(); await page.getByRole('button', { name: 'Publish event', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review event · revision 2', exact: true })).toBeVisible();
  await page.getByLabel('Motion wording', { exact: true }).fill('Resolved: cities should repeal mandatory parking minimums.');
  await page.getByLabel('Reason for the amendment').fill('Clarify the scope of the mandatory minimum rule.');
  await page.getByRole('checkbox', { name: 'I reviewed the prior and replacement wording and want to record this amendment.', exact: true }).check();
  await page.getByRole('button', { name: 'Record published motion amendment' }).click();
  await expect(page.getByRole('heading', { name: 'Review event · revision 3', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resolved: cities should repeal mandatory parking minimums. · revision 3 · published', exact: true }).click();
  await page.getByRole('button', { name: 'Load revision history' }).click();
  await expect(page.getByText('Amendment reason: Clarify the scope of the mandatory minimum rule.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Revision 1 · draft', exact: true })).toBeVisible();
  if (audit) await audit(page);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px overflow`);
    if (audit) await audit(page);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'New series', exact: true }).click();
  await page.getByLabel('Series name', { exact: true }).fill('Synthetic retry series'); await page.getByLabel('Season', { exact: true }).fill('2028');
  await page.getByLabel('Series starts on').fill('2028-01-01'); await page.getByLabel('Series ends on').fill('2028-12-31');
  let command;
  const routePattern = '**/api/tenants/*/administration/series/*';
  await page.route(routePattern, async route => {
    command = route.request().postDataJSON().commandId;
    // Let the real server commit, then lose only the response.
    const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort('failed');
  }, { times: 1 });
  await page.getByRole('button', { name: 'Create series', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'could not reach the service' })).toBeVisible();
  await expect(page.getByLabel('Series name', { exact: true })).toHaveValue('Synthetic retry series');
  const retried = page.waitForRequest(r => /\/administration\/series\/[^/]+$/.test(new URL(r.url()).pathname) && r.method() === 'POST');
  await page.getByRole('button', { name: 'Create series', exact: true }).click();
  assert.equal((await retried).postDataJSON().commandId, command);
  await expect(page.getByRole('heading', { name: 'Review series · revision 1', exact: true })).toBeVisible();
  await page.route(routePattern, route => route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"administration_conflict"}' }), { times: 1 });
  await page.getByLabel('Series name', { exact: true }).fill('Synthetic unsaved revision'); await page.getByRole('button', { name: 'Save new revision', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'server revision changed' })).toBeVisible();
  await expect(page.getByLabel('Series name', { exact: true })).toHaveValue('Synthetic unsaved revision'); await expect(page.getByLabel('Series name', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Refresh current records' }).click(); await expect(page.getByRole('heading', { name: 'Create series', exact: true })).toBeVisible();
}

