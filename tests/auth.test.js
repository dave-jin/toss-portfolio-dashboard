import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../lib/auth.js';

test('hashPassword encodes password with salt and verifyPassword accepts the original password', () => {
  const encoded = hashPassword('12345');
  assert.ok(encoded.startsWith('scrypt$'));
  assert.equal(verifyPassword('12345', encoded), true);
});

test('verifyPassword rejects a wrong password', () => {
  const encoded = hashPassword('strong-password');
  assert.equal(verifyPassword('wrong-password', encoded), false);
});

test('hashPassword uses random salt so same password hashes differently', () => {
  const first = hashPassword('same');
  const second = hashPassword('same');
  assert.notEqual(first, second);
});
