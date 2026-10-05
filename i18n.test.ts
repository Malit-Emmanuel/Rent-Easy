import test from 'node:test';
import assert from 'node:assert/strict';
import { dict, normaliseLang, translate } from './i18n';

test('Swahili has every English key and no extras', () => {
  assert.deepEqual(Object.keys(dict.sw).sort(), Object.keys(dict.en).sort());
});
test('no empty strings', () => {
  for (const l of ['en', 'sw'] as const) for (const [k, v] of Object.entries(dict[l])) assert.ok(v.trim(), `${l}.${k}`);
});
test('unknown languages fall back to English; unknown keys return the key', () => {
  assert.equal(normaliseLang('fr'), 'en'); assert.equal(normaliseLang('sw'), 'sw');
  assert.equal(translate('sw', 'nope'), 'nope');
});
