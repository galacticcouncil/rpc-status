import test from 'node:test';
import assert from 'node:assert/strict';

import {
  annotateHealth,
  blockLag,
  categorizeStatus,
  maxHeightsByChain,
  networkOf,
  chainOf,
  LAG_STALE,
  LAG_WARN,
} from '../lag.js';
import { serializeStatus } from '../status-contract.js';

const ok = (name, blockHeight, extra = {}) => ({
  endpoint: { url: `https://${name}`, name, location: '?', kind: 'gateway', ...extra },
  status: 'success',
  responseTime: 50,
  blockHeight,
  timestamp: '2026-08-17T00:00:00.000Z',
  method: 'chain_getBlock',
});

test('a responsive but far-behind endpoint is not success', () => {
  // the reported case: coke answered fine while ~29500 blocks behind
  const result = ok('coke', 13_000_000);
  assert.equal(categorizeStatus(result, 13_029_500), 'stale');
});

test('threshold boundaries', () => {
  const head = 1000;
  assert.equal(categorizeStatus(ok('a', head), head), 'success');
  assert.equal(categorizeStatus(ok('a', head - LAG_WARN), head), 'success');
  assert.equal(categorizeStatus(ok('a', head - LAG_WARN - 1), head), 'warning');
  assert.equal(categorizeStatus(ok('a', head - LAG_STALE + 1), head), 'warning');
  assert.equal(categorizeStatus(ok('a', head - LAG_STALE), head), 'stale');
});

test('errors and timeouts still win over lag', () => {
  assert.equal(categorizeStatus({ status: 'error', error: 'boom' }, 1000), 'error');
  assert.equal(categorizeStatus({ status: 'error', timeout: true }, 1000), 'timeout');
});

test('methods that report no height stay success', () => {
  const version = { ...ok('a', undefined), method: 'system_version', version: '49.2.2' };
  assert.equal(categorizeStatus(version, 13_000_000), 'success');
  assert.equal(blockLag(version, 13_000_000), undefined);
});

test('an unknown head does not manufacture lag', () => {
  assert.equal(blockLag(ok('a', 100), 0), undefined);
  assert.equal(categorizeStatus(ok('a', 100), 0), 'success');
});

test('each chain is graded against its own head', () => {
  const results = [
    ok('coke', 13_000_003),
    ok('tarn', 13_000_005),
    // independent forks, not peers — lark1 is not 2.5M blocks "behind" paseo
    ok('lark1', 375_801, { testnet: true }),
    ok('paseo', 2_919_026, { testnet: true }),
  ];

  const heights = maxHeightsByChain(results);
  assert.deepEqual(heights, { hydration: 13_000_005, lark1: 375_801, paseo: 2_919_026 });
  assert.equal(networkOf(results[2].endpoint), 'testnet');
  assert.equal(chainOf(results[2].endpoint), 'lark1');
  // mainnet nodes are judged against 13_000_005, not the paseo fork
  assert.equal(categorizeStatus(results[0], heights.hydration), 'success');

  annotateHealth(results);
  assert.deepEqual(
    results.map((r) => r.health),
    ['ok', 'ok', 'ok', 'ok']
  );
});

test('an explicit chain tag groups endpoints that share one', () => {
  const results = [
    ok('lark-a', 1000, { testnet: true, chain: 'lark' }),
    ok('lark-b', 1000 - LAG_STALE, { testnet: true, chain: 'lark' }),
  ];

  annotateHealth(results);
  assert.deepEqual(
    results.map((r) => [r.chain, r.health]),
    [
      ['lark', 'ok'],
      ['lark', 'stale'],
    ]
  );
});

test('failed endpoints do not lower the head', () => {
  const down = { endpoint: { url: 'https://down', name: 'down' }, status: 'error', blockHeight: 1 };
  assert.equal(maxHeightsByChain([ok('a', 500), down]).hydration, 500);
});

test('annotateHealth marks lag, network and verdict per result', () => {
  const results = [
    ok('tarn', 13_000_000),
    ok('coke', 13_000_000 - LAG_STALE),
    ok('lark1', 100, { testnet: true }),
    { endpoint: { url: 'https://down', name: 'down' }, status: 'error', responseTime: 5000 },
  ];

  const heads = annotateHealth(results);

  assert.deepEqual(heads, { hydration: 13_000_000, lark1: 100 });
  assert.deepEqual(
    results.map((r) => [r.health, r.blockLag, r.network]),
    [
      ['ok', 0, 'mainnet'],
      ['stale', LAG_STALE, 'mainnet'],
      ['ok', 0, 'testnet'],
      ['error', undefined, 'mainnet'],
    ]
  );
});

test('the stale threshold is configurable', () => {
  const results = [ok('tarn', 1000), ok('coke', 997)];
  annotateHealth(results, 2);
  assert.equal(results[1].health, 'stale');
});

test('/api/status serialises the documented contract', () => {
  const results = [ok('coke', 13_000_000 - 50), ok('tarn', 13_000_000)];
  const monitor = {
    staleThreshold: LAG_STALE,
    chainHead: annotateHealth(results),
    getLatestResults: () => results,
  };

  const body = serializeStatus(monitor, '2026-08-17T00:00:00.000Z');

  assert.equal(body.version, 1);
  assert.equal(body.generatedAt, '2026-08-17T00:00:00.000Z');
  assert.deepEqual(body.thresholds, { maxBlockLag: LAG_STALE });
  assert.deepEqual(body.chainHead, { hydration: 13_000_000 });
  assert.deepEqual(body.endpoints[0], {
    name: 'coke',
    url: 'https://coke',
    location: '?',
    kind: 'gateway',
    network: 'mainnet',
    chain: 'hydration',
    status: 'success',
    health: 'stale',
    blockHeight: 13_000_000 - 50,
    blockLag: 50,
    responseTime: 50,
    method: 'chain_getBlock',
    error: null,
    checkedAt: '2026-08-17T00:00:00.000Z',
  });
  // block bodies must not ride along, they made the response ~1MB
  assert.equal('blockDetails' in body.endpoints[0], false);
});
