import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { handler } from '../build/handler.js';
import { PolkadotRpcMonitor } from '../core-monitor.js';
import { LAG_STALE } from '../lag.js';
import { serializeStatus } from '../status-contract.js';
import * as client from 'prom-client';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Configure Prometheus metrics
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

// Custom metrics
const rpcBlockHeight = new client.Gauge({
  name: 'polkadot_rpc_block_height',
  help: 'Block height reported by Polkadot RPC endpoint',
  labelNames: ['endpoint', 'name'],
});

const rpcResponseTime = new client.Gauge({
  name: 'polkadot_rpc_response_time_ms',
  help: 'Response time in milliseconds for Polkadot RPC endpoint',
  labelNames: ['endpoint', 'name'],
});

const rpcStatus = new client.Gauge({
  name: 'polkadot_rpc_status',
  help: 'Status of Polkadot RPC endpoint (1 = healthy and current, 0 = down or stale)',
  labelNames: ['endpoint', 'name'],
});

const rpcBlockLag = new client.Gauge({
  name: 'polkadot_rpc_block_lag',
  help: 'Blocks behind the best head seen on the same network',
  labelNames: ['endpoint', 'name'],
});

const rpcChainHead = new client.Gauge({
  name: 'polkadot_rpc_chain_head',
  help: 'Best block height seen across all monitored endpoints of a chain',
  labelNames: ['chain'],
});

registry.registerMetric(rpcBlockHeight);
registry.registerMetric(rpcResponseTime);
registry.registerMetric(rpcStatus);
registry.registerMetric(rpcBlockLag);
registry.registerMetric(rpcChainHead);

// Configuration
const config = {
  prometheusUrl: process.env.PROMETHEUS_URL || 'http://prometheus:9090',
  checkInterval: parseInt(process.env.CHECK_INTERVAL, 10) || 5000,
  port: parseInt(process.env.PORT, 10) || 3000,
  maxBlockLag: parseInt(process.env.MAX_BLOCK_LAG, 10) || LAG_STALE,
};

// Create and configure RPC monitor
const monitor = new PolkadotRpcMonitor(undefined, config.maxBlockLag);

monitor.setUpdateCallback((results) => {
  Object.entries(monitor.chainHead).forEach(([chain, height]) => {
    // a chain whose endpoints all failed has no head — don't publish it as 0
    if (height > 0) rpcChainHead.set({ chain }, height);
  });

  // Update Prometheus metrics
  results.forEach((result) => {
    const { endpoint, health, responseTime, blockHeight, blockLag } = result;
    const labels = { endpoint: endpoint.url, name: endpoint.name };

    // Update response time metric
    rpcResponseTime.set(labels, responseTime);

    // 1 only when the endpoint answered AND is current — a node serving
    // week-old state is not up, no matter how fast it replies
    rpcStatus.set(labels, health === 'ok' ? 1 : 0);

    // Update block height metric if available
    if (blockHeight !== undefined) {
      rpcBlockHeight.set(labels, blockHeight);
    }

    if (blockLag !== undefined) {
      rpcBlockLag.set(labels, blockLag);
    }
  });
});

// Start the monitor
monitor.start(config.checkInterval);

// API routes
app.get('/api', (req, res) => {
  res.json({ status: 'ok', message: 'Polkadot RPC Monitor API' });
});

// Get current RPC status — stable contract, see README.md
app.get('/api/status', (req, res) => {
  res.json(serializeStatus(monitor));
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Query historical data from Prometheus
app.get('/api/history', async (req, res) => {
  try {
    const { endpoint, metric = 'polkadot_rpc_block_height', timeRange = '1h' } = req.query;

    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint parameter is required' });
    }

    const query = `${metric}{endpoint="${endpoint}"}[${timeRange}]`;
    const response = await axios.get(`${config.prometheusUrl}/api/v1/query`, {
      params: { query },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error querying Prometheus:', error);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

// Serve API routes before SvelteKit handler
app.use('/api', (req, res, next) => {
  // This is to ensure that API routes take precedence over SvelteKit routes
  next();
});

// Serve static assets in production
if (isProduction) {
  app.use(express.static('build/client'));
}

// Use SvelteKit as middleware (handles SSR)
app.use(handler);

// Start server
const server = app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  console.log(`Environment: ${isProduction ? 'production' : 'development'}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  monitor.stop();
  server.close(() => {
    console.log('HTTP server closed');
  });
});

export default server;
