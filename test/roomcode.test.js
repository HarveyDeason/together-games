import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomCode, normaliseCode, isValidCode } from '../src/roomcode.js';

test('a generated code is four uppercase letters', () => {
  for (let i = 0; i < 200; i++) {
    assert.match(randomCode(), /^[A-Z]{4}$/);
  }
});

test('generated codes are not all identical', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(randomCode());
  assert.ok(seen.size > 1, 'randomCode returned the same value 50 times');
});

test('input is normalised to uppercase and trimmed', () => {
  assert.equal(normaliseCode('  hdxx '), 'HDXX');
});

test('valid codes are accepted', () => {
  assert.equal(isValidCode('HDXX'), true);
  assert.equal(isValidCode(' hdxx '), true);
});

test('invalid codes are rejected', () => {
  assert.equal(isValidCode('HDX'), false);
  assert.equal(isValidCode('HDXXX'), false);
  assert.equal(isValidCode('HD1X'), false);
  assert.equal(isValidCode(''), false);
  assert.equal(isValidCode(null), false);
  assert.equal(isValidCode(undefined), false);
});
