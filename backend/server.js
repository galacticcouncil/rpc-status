import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { handler } from '../build/handler.js';
import { PolkadotRpcMonitor } from '../core-monitor.js';
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
  help: 'Status of Polkadot RPC endpoint (1 = up, 0 = down)',
  labelNames: ['endpoint', 'name'],
});

registry.registerMetric(rpcBlockHeight);
registry.registerMetric(rpcResponseTime);
registry.registerMetric(rpcStatus);

// Configuration
const config = {
  prometheusUrl: process.env.PROMETHEUS_URL || 'http://prometheus:9090',
  checkInterval: parseInt(process.env.CHECK_INTERVAL, 10) || 10000,
  port: parseInt(process.env.PORT, 10) || 3000,
};

// Create and configure RPC monitor
const monitor = new PolkadotRpcMonitor();

monitor.setUpdateCallback((results) => {
  // Update Prometheus metrics
  results.forEach((result) => {
    const { endpoint, status, responseTime, blockHeight } = result;
    const labels = { endpoint: endpoint.url, name: endpoint.name };

    // Update response time metric
    rpcResponseTime.set(labels, responseTime);

    // Update status metric (1 = up, 0 = down)
    rpcStatus.set(labels, status === 'success' ? 1 : 0);

    // Update block height metric if available
    if (blockHeight !== undefined) {
      rpcBlockHeight.set(labels, blockHeight);
    }
  });
});

// Start the monitor
monitor.start(config.checkInterval);

// API routes
app.get('/api', (req, res) => {
  res.json({ status: 'ok', message: 'Polkadot RPC Monitor API' });
});

// Get current RPC status
app.get('/api/status', (req, res) => {
  res.json(monitor.getLatestResults());
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
