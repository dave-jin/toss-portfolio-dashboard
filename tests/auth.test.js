import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../lib/auth.js';
import { fetchPasswordConfig } from '../lib/supabase.js';

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

test('fetchPasswordConfig includes upstream Supabase response body in thrown errors', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
  process.env.SUPABASE_DB_SCHEMA = 'rich_dad_dashboard';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({
      code: 'PGRST106',
      details: null,
      hint: null,
      message: 'The schema must be one of the following: public, graphql_public'
    }),
    {
      status: 406,
      headers: { 'Content-Type': 'application/json' }
    }
  );

  try {
    await assert.rejects(
      fetchPasswordConfig(),
      /Supabase read failed: 406.*PGRST106.*public, graphql_public/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
