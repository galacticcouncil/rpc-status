// /api/status response shape. Documented in README.md — treat field removals
// and renames as breaking changes for third-party monitoring.

export const STATUS_CONTRACT_VERSION = 1;

export function serializeEndpoint(result) {
  const { endpoint = {} } = result;

  return {
    name: endpoint.name ?? null,
    url: endpoint.url ?? null,
    location: endpoint.location ?? null,
    kind: endpoint.kind ?? 'node',
    network: result.network ?? (endpoint.testnet ? 'testnet' : 'mainnet'),
    chain: result.chain ?? null,
    status: result.status ?? null,
    health: result.health ?? null,
    blockHeight: result.blockHeight ?? null,
    blockLag: result.blockLag ?? null,
    responseTime: result.responseTime ?? null,
    method: result.method ?? null,
    error: result.error ?? null,
    checkedAt: result.timestamp ?? null,
  };
}

export function serializeStatus(monitor, generatedAt = new Date().toISOString()) {
  const results = monitor.getLatestResults();

  return {
    version: STATUS_CONTRACT_VERSION,
    generatedAt,
    thresholds: { maxBlockLag: monitor.staleThreshold },
    chainHead: monitor.chainHead,
    endpoints: results.map(serializeEndpoint),
  };
}
