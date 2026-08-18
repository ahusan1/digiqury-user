/**
 * Security Testing Utility
 *
 * Run: node api/_utils/test-security.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../../.env');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=').trim();
    if (key && !key.startsWith('#') && value) {
      process.env[key.trim()] = value;
    }
  });
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const IS_LOCAL_TARGET = /localhost|127\.0\.0\.1/i.test(BASE_URL);
const IS_REMOTE_TARGET = !IS_LOCAL_TARGET;

console.log('Security Implementation Test Suite\n');
console.log(`Testing: ${BASE_URL}\n`);

function testEnvironmentConfig() {
  console.log('Test 1: Environment Configuration');

  if (IS_REMOTE_TARGET) {
    console.log('  INFO Remote target detected; local .env check skipped.');
    console.log('  INFO Vercel project environment is used for this test target.');
    console.log('\n  Configuration: READY (REMOTE_MANAGED)\n');
    return;
  }

  const requiredVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ALLOWED_ORIGINS'];
  const optionalVars = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'RATE_LIMIT_WINDOW_MS',
    'RATE_LIMIT_MAX_REQUESTS',
    'RATE_LIMIT_MAX_REQUESTS_AUTH',
  ];

  let allSet = true;

  console.log('  Required:');
  for (const varName of requiredVars) {
    const isSet = !!process.env[varName];
    console.log(`  ${isSet ? 'OK' : 'MISSING'} ${varName}`);
    if (!isSet) allSet = false;
  }

  console.log('\n  Optional:');
  for (const varName of optionalVars) {
    const isSet = !!process.env[varName];
    console.log(`  ${isSet ? 'OK' : 'DEFAULT'} ${varName}`);
  }

  console.log(`\n  Configuration: ${allSet ? 'READY' : 'INCOMPLETE'}\n`);
}

async function testSecurityHeaders() {
  console.log('Test 2: Security Headers');

  try {
    const response = await fetch(`${BASE_URL}/api/product/test`);
    const headers = {
      'X-RateLimit-Limit': response.headers.get('X-RateLimit-Limit'),
      'X-RateLimit-Remaining': response.headers.get('X-RateLimit-Remaining'),
      'X-RateLimit-Reset': response.headers.get('X-RateLimit-Reset'),
      'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
    };

    for (const [header, value] of Object.entries(headers)) {
      console.log(`  ${value ? 'OK' : 'N/A'} ${header}: ${value || 'Not present'}`);
    }
  } catch (err) {
    console.log('  ERROR Failed to fetch headers:', err.message);
  }

  console.log('');
}

async function testCORS() {
  console.log('Test 3: CORS Configuration');

  const testOrigins = [
    { origin: 'https://plusvexora.vercel.app', shouldAllow: true },
    { origin: 'https://evil-site.com', shouldAllow: false },
    { origin: 'http://localhost:3000', shouldAllow: IS_LOCAL_TARGET },
  ];

  for (const test of testOrigins) {
    try {
      const response = await fetch(`${BASE_URL}/api/product/test`, {
        method: 'OPTIONS',
        headers: {
          Origin: test.origin,
          'Access-Control-Request-Method': 'GET',
        },
      });

      const allowedOrigin = response.headers.get('Access-Control-Allow-Origin');
      const allowed = allowedOrigin === test.origin;

      if (allowed && test.shouldAllow) {
        console.log(`  OK ${test.origin}: correctly allowed`);
      } else if (!allowed && !test.shouldAllow) {
        console.log(`  OK ${test.origin}: correctly blocked`);
      } else {
        console.log(`  WARN ${test.origin}: unexpected result`);
      }
    } catch (err) {
      console.log(`  ERROR ${test.origin}:`, err.message);
    }
  }

  console.log('');
}

async function fetchAuthEndpoint(options = {}) {
  const paths = [
    '/api/examples/authenticated-endpoint',
    '/api/_examples/authenticated-endpoint',
  ];

  for (const endpoint of paths) {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    if (response.status !== 404) {
      return { endpoint, response };
    }
  }

  return { endpoint: paths[0], response: { status: 404 } };
}

async function testAuthentication() {
  console.log('Test 4: Authentication');

  try {
    const anon = await fetchAuthEndpoint();
    if (anon.response.status === 401) {
      console.log(`  OK Unauthenticated request rejected (401) at ${anon.endpoint}`);
    } else if (anon.response.status === 404) {
      console.log('  WARN Authentication example endpoint not found');
    } else {
      console.log(`  WARN Unauthenticated request returned ${anon.response.status}`);
    }

    const invalid = await fetchAuthEndpoint({
      headers: { Authorization: 'Bearer invalid-token-12345' },
    });

    if (invalid.response.status === 401) {
      console.log(`  OK Invalid token rejected (401) at ${invalid.endpoint}`);
    } else if (invalid.response.status === 404) {
      console.log('  WARN Authentication example endpoint not found');
    } else {
      console.log(`  WARN Invalid token returned ${invalid.response.status}`);
    }
  } catch (err) {
    console.log('  ERROR Authentication check failed:', err.message);
  }

  console.log('');
}

async function testRateLimit() {
  console.log('Test 5: Rate Limiting');
  console.log('Sending 105 requests...');

  let successCount = 0;
  let rateLimitedCount = 0;
  let minRemaining = Number.POSITIVE_INFINITY;
  let sawRateHeaders = false;

  for (let i = 1; i <= 105; i++) {
    try {
      const response = await fetch(`${BASE_URL}/api/product/test`);
      const remainingRaw = response.headers.get('X-RateLimit-Remaining');
      const remaining = Number.parseInt(remainingRaw || '', 10);
      if (Number.isFinite(remaining)) {
        sawRateHeaders = true;
        minRemaining = Math.min(minRemaining, remaining);
      }

      if (response.status === 200) {
        successCount++;
      } else if (response.status === 429) {
        rateLimitedCount++;
      }
    } catch (err) {
      console.log(`  ERROR Request ${i}:`, err.message);
    }
  }

  const working = rateLimitedCount > 0 || (sawRateHeaders && minRemaining < 100);

  console.log(`  Successful requests: ${successCount}`);
  console.log(`  Rate limited requests: ${rateLimitedCount}`);
  console.log(`  Lowest remaining header: ${sawRateHeaders ? minRemaining : 'N/A'}`);
  console.log(`  Rate limiting: ${working ? 'WORKING' : 'NOT DETECTED'}\n`);
}

async function runTests() {
  console.log('Starting security tests...\n');
  testEnvironmentConfig();
  await testSecurityHeaders();
  await testCORS();
  await testAuthentication();
  await testRateLimit();

  console.log('===============================================');
  console.log('Security test suite completed.');
  console.log('===============================================\n');
  console.log('For production testing:');
  console.log('BASE_URL=https://yourdomain.com node api/_utils/test-security.js');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});