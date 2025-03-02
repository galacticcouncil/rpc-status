import defaultRpcEndpoints from './endpoints.js';

class PolkadotRpcMonitor {
  constructor(rpcEndpoints = defaultRpcEndpoints) {
    this.rpcEndpoints = rpcEndpoints;
    this.results = [];
    this.interval = null;
    this.onUpdate = null;
    this.currentMethod = 'chain_getBlock'; // Default RPC method
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

  async checkBlockHeight(endpoint, timeoutMs = 5000, method = 'chain_getBlock') {
    const startTime = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Define request parameters based on method
    let rpcMethod = method;
    let params = [];

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: rpcMethod,
          params: params
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
          details: response,
          responseTime,
          method: rpcMethod
        };
      }

      const data = await response.json();

      if (data.error) {
        return {
          endpoint,
          status: 'error',
          error: data.error.message || JSON.stringify(data.error),
          details: data,
          responseTime,
          method: rpcMethod
        };
      }

      // Parse response based on method
      let blockHeight;
      if (method === 'chain_getBlock') {
        blockHeight = parseInt(data.result.block.header.number, 16);
      } else {
        // For other methods, we may not have block height
        blockHeight = undefined;
      }

      return {
        endpoint,
        status: 'success',
        blockHeight,
        responseTime,
        timestamp: new Date().toISOString(),
        method: rpcMethod
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
          timeout: true,
          method: rpcMethod
        };
      }

      return {
        endpoint,
        status: 'error',
        error: error.message || String(error),
        details: error,
        responseTime: endTime - startTime,
        method: rpcMethod
      };
    }
  }

  async checkAllEndpoints(method = null) {
    // Use provided method or fall back to current method
    const rpcMethod = method || this.currentMethod;

    const results = await Promise.all(
      this.rpcEndpoints.map(endpoint => this.checkBlockHeight(endpoint, 5000, rpcMethod))
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

  start(intervalMs = 10000, method = 'chain_getBlock') {
    if (this.interval) {
      this.stop();
    }

    // Update current method
    this.currentMethod = method;

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

  // Set new method and restart monitoring
  setMethod(method) {
    if (this.currentMethod !== method) {
      this.currentMethod = method;

      // If monitoring is active, restart it with the new method
      if (this.interval) {
        const wasRunning = true;
        this.stop();
        this.start(10000, method);
      }
    }
    return this;
  }
}

// ES Module exports
export {PolkadotRpcMonitor};

// Support for browser global when not using modules
if (typeof window !== 'undefined') {
  window.PolkadotRpcMonitor = PolkadotRpcMonitor;
}
