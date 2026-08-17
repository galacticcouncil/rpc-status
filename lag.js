// head-lag classification, shared by the browser monitor and the backend.
// lives at the repo root because the production image ships core-monitor.js
// without the SvelteKit sources.

// lag thresholds, in blocks behind the best head we saw this round (~6s per block)
export const LAG_WARN = 2;
export const LAG_STALE = 10;

// mainnet vs testnet, used for filtering the table
export function networkOf(endpoint) {
  return endpoint?.testnet ? 'testnet' : 'mainnet';
}

// the comparison group. heights are only meaningful within one chain — the lark
// forks and paseo are independent chains, not peers lagging behind each other.
export function chainOf(endpoint) {
  if (endpoint?.chain) return endpoint.chain;
  return endpoint?.testnet ? (endpoint.name ?? endpoint.url) : 'hydration';
}

// best head per chain among endpoints that actually answered with one
export function maxHeightsByChain(results = []) {
  const heights = {};

  results.forEach((result) => {
    const chain = chainOf(result.endpoint);
    if (heights[chain] === undefined) heights[chain] = 0;
    if (result.status !== 'success' || result.blockHeight === undefined) return;
    heights[chain] = Math.max(heights[chain], result.blockHeight);
  });

  return heights;
}

// blocks behind the best head, or undefined when the check reports no height
export function blockLag(result, maxBlockHeight = 0) {
  if (!result || result.blockHeight === undefined || !(maxBlockHeight > 0)) {
    return undefined;
  }
  return Math.max(0, maxBlockHeight - result.blockHeight);
}

// Categorize endpoint status. maxBlockHeight is the best head seen across the
// same network this round — responding is not the same as being current.
export function categorizeStatus(result, maxBlockHeight = 0) {
  // If the endpoint timed out
  if (result.timeout) {
    return 'timeout';
  }

  // If the endpoint is down or has an error
  if (result.status !== 'success') {
    return 'error';
  }

  // If block height isn't reported but status is success
  if (result.blockHeight === undefined) {
    return 'success';
  }

  const lag = blockLag(result, maxBlockHeight);

  // far enough behind that it is serving stale state
  if (lag >= LAG_STALE) {
    return 'stale';
  }

  // drifting, but within a block or two of the head
  if (lag > LAG_WARN) {
    return 'warning';
  }

  // Default to success for any other case
  return 'success';
}

// annotate a round of results with lag and a health verdict, in place
export function annotateHealth(results, staleThreshold = LAG_STALE) {
  const heights = maxHeightsByChain(results);

  results.forEach((result) => {
    const chain = chainOf(result.endpoint);
    const lag = blockLag(result, heights[chain]);

    result.network = networkOf(result.endpoint);
    result.chain = chain;
    result.blockLag = lag;

    if (result.status !== 'success') {
      result.health = 'error';
    } else if (lag !== undefined && lag >= staleThreshold) {
      result.health = 'stale';
    } else {
      result.health = 'ok';
    }
  });

  return heights;
}
