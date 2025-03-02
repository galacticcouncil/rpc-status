import defaultRpcEndpoints from './endpoints.js';

class PolkadotRpcMonitor {
  constructor(rpcEndpoints = defaultRpcEndpoints) {
    this.rpcEndpoints = rpcEndpoints;
    this.results = [];
    this.interval = null;
    this.onUpdate = null;
  }

  addRpcEndpoint(url, name = '') {
    const endpoint = {url, name: name || url};
    this.rpcEndpoints.push(endpoint);
    return this;
  }

  setUpdateCallback(callback) {
    if (typeof callback === 'function') {
      this.onUpdate = callback;
    }
    return this;
  }

  async checkBlockHeight(endpoint, timeoutMs = 5000) {
    const startTime = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'chain_getBlock',
          params: []
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const endTime = performance.now();
      const responseTime = endTime - startTime;

      if (!response.ok) {
        return {
          endpoint,
          status: 'error',
          error: `HTTP error ${response.status}`,
          responseTime
        };
      }

      const data = await response.json();

      if (data.error) {
        return {
          endpoint,
          status: 'error',
          error: data.error.message || JSON.stringify(data.error),
          responseTime
        };
      }

      // Parse block height (Polkadot returns hex)
      const blockHeight = parseInt(data.result.block.header.number, 16);

      return {
        endpoint,
        status: 'success',
        blockHeight,
        responseTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const endTime = performance.now();

      // Check if it was a timeout error
      if (error.name === 'AbortError') {
        return {
          endpoint,
          status: 'error',
          error: `Request timed out after ${timeoutMs}ms`,
          responseTime: timeoutMs,
          timeout: true
        };
      }

      return {
        endpoint,
        status: 'error',
        error: error.message || String(error),
        responseTime: endTime - startTime
      };
    }
  }

  async checkAllEndpoints() {
    const results = await Promise.all(
      this.rpcEndpoints.map(endpoint => this.checkBlockHeight(endpoint))
    );

    // Sort by block height (descending) and then by response time (ascending)
    results.sort((a, b) => {
      // First priority: sort by block height (if available)
      if (a.blockHeight !== undefined && b.blockHeight !== undefined) {
        if (a.blockHeight !== b.blockHeight) {
          return b.blockHeight - a.blockHeight; // Descending by height
        }
      } else if (a.blockHeight !== undefined) {
        return -1; // a has height, b doesn't, a comes first
      } else if (b.blockHeight !== undefined) {
        return 1;  // b has height, a doesn't, b comes first
      }

      // Second priority: sort by response time
      return a.responseTime - b.responseTime;
    });

    this.results = results;

    if (this.onUpdate) {
      this.onUpdate(this.results);
    }

    return this.results;
  }

  start(intervalMs = 10000) {
    if (this.interval) {
      this.stop();
    }

    // Run immediately
    this.checkAllEndpoints();

    // Then set interval
    this.interval = setInterval(() => {
      this.checkAllEndpoints();
    }, intervalMs);

    return this;
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    return this;
  }

  getLatestResults() {
    return this.results;
  }
}

// ES Module exports
export {PolkadotRpcMonitor};

// Support for browser global when not using modules
if (typeof window !== 'undefined') {
  window.PolkadotRpcMonitor = PolkadotRpcMonitor;
}
