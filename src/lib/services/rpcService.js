import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { rpcStore, maxBlockHeight } from '../stores/rpcStore';
import { parseTimeRange, categorizeStatus, processHistoricalData } from '../utils/helpers';

// Constants
const LOCAL_STORAGE_KEY = 'hydration-rpc-monitor-data-by-method';
const LOCAL_STORAGE_ENDPOINT_HISTORY_KEY = 'hydration-rpc-endpoint-history-by-method';
const LOCAL_STORAGE_ENDPOINT_ERRORS_KEY = 'hydration-rpc-endpoint-errors-by-method';
const MAX_STORAGE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

class RpcService {
  constructor() {
    this.monitor = null;
    this.intervalId = null;
    this.timeIntervalId = null;
    this.lastSaveTime = 0;
  }

  /**
   * Initialize the monitor
   */
  async initMonitor() {
    if (!browser) return false;

    try {
      // Import the monitor dynamically
      const module = await import('../../../core-monitor.js');
      this.monitor = new module.PolkadotRpcMonitor();

      // Load saved data
      this.loadLocalData();

      // Setup monitor callback
      this.monitor.setUpdateCallback(this.handleResultsUpdate.bind(this));

      // Start monitoring based on current state
      const state = get(rpcStore);
      if (state.useBackend) {
        this.fetchResultsFromBackend();
        this.startBackendPolling();
      } else {
        // Use the configured refresh frequency
        this.monitor.start(state.refreshFrequency * 1000, state.selectedMethod);
      }

      // Start time updates
      this.startTimeUpdates();

      return true;
    } catch (error) {
      console.error('Error initializing monitor:', error);
      return false;
    }
  }

  /**
   * Start time updates
   */
  startTimeUpdates() {
    if (!browser) return;

    // Clear existing interval if any
    if (this.timeIntervalId) {
      clearInterval(this.timeIntervalId);
    }

    // Update time every second
    this.timeIntervalId = setInterval(() => {
      rpcStore.updateTime();
    }, 1000);
  }

  /**
   * Handle results update from monitor
   */
  handleResultsUpdate(results) {
    rpcStore.setResults(results);
    rpcStore.updateLastRefreshTime(); // Update last refresh time
    this.updateEndpointHistory(results);

    // Update metrics
    const state = get(rpcStore);
    if (state.useBackend) {
      this.fetchResultsFromBackend();
    } else {
      this.calculateEndpointMetrics();
    }

    rpcStore.updateTime();
  }

  /**
   * Start polling backend for updates
   */
  startBackendPolling() {
    if (!browser) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Always use 5 seconds for backend polling
    const BACKEND_POLL_INTERVAL = 5000;

    this.intervalId = setInterval(() => this.fetchResultsFromBackend(), BACKEND_POLL_INTERVAL);
  }

  /**
   * Fetch results from backend
   */
  async fetchResultsFromBackend() {
    if (!browser) return;

    try {
      const response = await fetch('/api/status');
      const data = await response.json();

      rpcStore.setResults(data);
      rpcStore.updateLastRefreshTime(); // Update last refresh time
      this.updateEndpointHistory(data);
      this.calculateEndpointMetrics();
      rpcStore.updateTime();
    } catch (error) {
      console.error('Error fetching from backend:', error);
    }
  }

  /**
   * Fetch historical data for a specific endpoint
   */
  async fetchHistoricalData(endpoint, range) {
    if (!browser) return;

    const state = get(rpcStore);

    if (state.useBackend) {
      try {
        // Get latency data from backend/Prometheus
        const latencyResponse = await fetch(
          `/api/history?endpoint=${encodeURIComponent(endpoint)}&metric=polkadot_rpc_response_time_ms&timeRange=${range}`
        );
        const latencyData = await latencyResponse.json();

        // Get status data to identify errors
        const statusResponse = await fetch(
          `/api/history?endpoint=${encodeURIComponent(endpoint)}&metric=polkadot_rpc_status&timeRange=${range}`
        );
        const statusData = await statusResponse.json();

        if (latencyData.data?.result && statusData.data?.result) {
          // Process and merge both datasets
          const historyData = processHistoricalData(
            latencyData.data.result,
            statusData.data.result
          );
          rpcStore.setHistoryData(historyData);
        }
      } catch (error) {
        console.error('Error fetching historical data:', error);
      }
    } else {
      // Use method-specific local history data
      const method = state.selectedMethod;
      if (state.localHistoryData[method] && state.localHistoryData[method][endpoint]) {
        // Filter data based on time range
        const now = new Date();
        const rangeInMs = parseTimeRange(range);
        const historyData = state.localHistoryData[method][endpoint].filter(
          (d) => now - d.time <= rangeInMs
        );
        rpcStore.setHistoryData(historyData);
      } else {
        rpcStore.setHistoryData([]);
      }
    }
  }

  /**
   * Calculate metrics for all endpoints
   */
  calculateEndpointMetrics() {
    const state = get(rpcStore);
    const now = new Date().getTime();
    const timeWindow = parseTimeRange(state.timeRange);

    // Initialize metrics object
    const endpointMetrics = {};

    // Make sure we have structure for current method
    if (!state.localHistoryData[state.selectedMethod]) {
      rpcStore.updateEndpointMetrics(endpointMetrics);
      return;
    }

    // Calculate for all endpoints with history data for current method
    Object.keys(state.localHistoryData[state.selectedMethod]).forEach((endpoint) => {
      if (Array.isArray(state.localHistoryData[state.selectedMethod][endpoint])) {
        // Get recent data within time window
        const recentData = state.localHistoryData[state.selectedMethod][endpoint].filter(
          (item) => now - item.time.getTime() <= timeWindow
        );

        if (recentData.length > 0) {
          // Calculate uptime (percentage of non-error responses)
          const upCount = recentData.filter((item) => !item.error).length;
          const uptime = (upCount / recentData.length) * 100;

          // Calculate average latency (for successful responses only)
          const successLatencies = recentData
            .filter((item) => !item.error)
            .map((item) => item.value);
          const avgLatency =
            successLatencies.length > 0
              ? successLatencies.reduce((sum, val) => sum + val, 0) / successLatencies.length
              : null;

          endpointMetrics[endpoint] = {
            avgLatency: avgLatency !== null ? avgLatency : Infinity,
            uptime: uptime,
            dataPoints: recentData.length,
            remote: false, // Flag as local source
            errorCount: recentData.filter((item) => item.error).length, // Track error count
          };
        }
      }
    });

    rpcStore.updateEndpointMetrics(endpointMetrics);
  }

  /**
   * Update endpoint history with new results
   */
  updateEndpointHistory(newResults) {
    // Update time on data refresh
    rpcStore.updateTime();

    const state = get(rpcStore);
    const method = state.selectedMethod;
    const mbh = get(maxBlockHeight);

    // Update history for each endpoint
    newResults.forEach((result) => {
      const url = result.endpoint.url;
      const status = categorizeStatus(result, mbh);

      // Update endpoint history
      rpcStore.updateEndpointHistory(method, url, status);

      // Update local history data for charts
      rpcStore.updateLocalHistory(method, url, {
        time: new Date(),
        value: result.responseTime,
        error: result.status !== 'success' || result.timeout,
      });

      // Update error history if there's an error
      if (result.status !== 'success' || result.timeout) {
        rpcStore.updateEndpointError(method, url, {
          timestamp: new Date(),
          errorType: result.timeout ? 'timeout' : 'error',
          message: result.error || 'Unknown error',
          details: result.details,
          responseTime: result.responseTime,
        });
      }
    });

    // Save to localStorage
    this.saveLocalData();

    // Refresh chart data if we're currently viewing a chart
    const { showChart, selectedEndpoint, timeRange } = state;
    if (showChart && selectedEndpoint) {
      this.fetchHistoricalData(selectedEndpoint, timeRange);
    }
  }

  /**
   * Change the monitoring method
   */
  changeMethod(method) {
    const state = get(rpcStore);

    // Only allow changing method when using local data source
    if (state.useBackend) {
      rpcStore.toggleBackend(); // Force switch to local mode
    }

    rpcStore.setMethod(method);

    // Update the monitor with the new method
    if (browser && this.monitor) {
      this.monitor.setMethod(method);

      // Reset displayed history data
      rpcStore.setHistoryData([]);

      // Recalculate metrics for the selected method
      this.calculateEndpointMetrics();

      // If chart is visible, refresh it with method-specific data
      if (state.showChart && state.selectedEndpoint) {
        this.fetchHistoricalData(state.selectedEndpoint, state.timeRange);
      }
    }
  }

  /**
   * Toggle data source between backend and browser
   */
  toggleDataSource() {
    if (!browser || !this.monitor) return;

    const state = get(rpcStore);

    rpcStore.toggleBackend();
    const newUseBackend = !state.useBackend;

    // Clear metrics when toggling to ensure we don't mix data sources
    rpcStore.updateEndpointMetrics({});

    if (newUseBackend) {
      this.monitor.stop();
      this.fetchResultsFromBackend(); // This will fetch metrics from backend
      this.startBackendPolling();

      // Reset method to default when using backend
      if (state.selectedMethod !== 'chain_getBlock') {
        rpcStore.setMethod('chain_getBlock');
      }
    } else {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      const currentState = get(rpcStore);
      this.monitor.start(currentState.refreshFrequency * 1000, state.selectedMethod);

      // When switching to local, recalculate metrics from local data
      this.calculateEndpointMetrics();
    }

    // Refresh chart data if chart is visible
    if (state.showChart && state.selectedEndpoint) {
      this.fetchHistoricalData(state.selectedEndpoint, state.timeRange);
    }
  }

  /**
   * Update the refresh interval
   */
  updateRefreshInterval() {
    if (!browser || !this.monitor) return;

    const state = get(rpcStore);

    // Only update if we're using the local data source
    if (!state.useBackend) {
      // Stop current interval
      this.monitor.stop();

      // Restart with new frequency
      this.monitor.start(state.refreshFrequency * 1000, state.selectedMethod);
    }
  }

  /**
   * Clean up resources when component is destroyed
   */
  cleanup() {
    if (browser) {
      if (this.monitor) {
        this.monitor.stop();
      }

      if (this.intervalId) {
        clearInterval(this.intervalId);
      }

      if (this.timeIntervalId) {
        clearInterval(this.timeIntervalId);
      }

      // Save data before unloading
      this.saveLocalData();
    }
  }

  /**
   * Load data from localStorage
   */
  loadLocalData() {
    if (!browser) return;

    try {
      // Load historical data
      const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        const state = get(rpcStore);

        // Initialize structure if needed
        if (!parsedData[state.selectedMethod]) {
          parsedData[state.selectedMethod] = {};
        }

        // Convert string dates back to Date objects for all methods
        Object.keys(parsedData).forEach((method) => {
          Object.keys(parsedData[method]).forEach((endpoint) => {
            if (Array.isArray(parsedData[method][endpoint])) {
              parsedData[method][endpoint] = parsedData[method][endpoint].map((item) => ({
                ...item,
                time: new Date(item.time),
              }));

              // Filter out data older than MAX_STORAGE_AGE_MS
              const cutoffTime = new Date().getTime() - MAX_STORAGE_AGE_MS;
              parsedData[method][endpoint] = parsedData[method][endpoint].filter(
                (item) => item.time.getTime() >= cutoffTime
              );
            }
          });
        });

        // Use the setter method instead of update
        rpcStore.setLocalHistoryData(parsedData);
        console.log('Loaded historical data from localStorage');
      }

      // Load endpoint history
      const savedHistory = localStorage.getItem(LOCAL_STORAGE_ENDPOINT_HISTORY_KEY);
      if (savedHistory) {
        const endpointHistory = JSON.parse(savedHistory);
        const state = get(rpcStore);

        // Initialize structure if needed
        if (!endpointHistory[state.selectedMethod]) {
          endpointHistory[state.selectedMethod] = {};
        }

        // Set endpoint history directly
        rpcStore.setEndpointHistory(endpointHistory);
        console.log('Loaded endpoint history from localStorage');
      }

      // Load endpoint errors
      const savedErrors = localStorage.getItem(LOCAL_STORAGE_ENDPOINT_ERRORS_KEY);
      if (savedErrors) {
        const parsedErrors = JSON.parse(savedErrors);
        const state = get(rpcStore);

        // Initialize structure if needed
        if (!parsedErrors[state.selectedMethod]) {
          parsedErrors[state.selectedMethod] = {};
        }

        // Convert string dates back to Date objects for all methods
        Object.keys(parsedErrors).forEach((method) => {
          Object.keys(parsedErrors[method]).forEach((endpoint) => {
            if (Array.isArray(parsedErrors[method][endpoint])) {
              parsedErrors[method][endpoint] = parsedErrors[method][endpoint].map((item) => ({
                ...item,
                timestamp: new Date(item.timestamp),
              }));

              // Filter out errors older than MAX_STORAGE_AGE_MS
              const cutoffTime = new Date().getTime() - MAX_STORAGE_AGE_MS;
              parsedErrors[method][endpoint] = parsedErrors[method][endpoint].filter(
                (item) => item.timestamp.getTime() >= cutoffTime
              );
            }
          });
        });

        // Set endpoint errors
        rpcStore.setEndpointErrors(parsedErrors);
        console.log('Loaded endpoint errors from localStorage');
      }

      // Calculate metrics after loading data
      this.calculateEndpointMetrics();
    } catch (error) {
      console.error('Error loading data from localStorage:', error);

      // If data is corrupted, reset it
      const state = get(rpcStore);
      const method = state.selectedMethod;

      // Clear data and reset
      rpcStore.clearLocalData();
    }
  }

  /**
   * Save data to localStorage
   */
  saveLocalData() {
    if (!browser) return;

    // Limit save frequency to prevent performance issues (save at most once every 30 seconds)
    const now = Date.now();
    if (now - this.lastSaveTime < 30000) return;
    this.lastSaveTime = now;

    try {
      const state = get(rpcStore);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.localHistoryData));
      localStorage.setItem(
        LOCAL_STORAGE_ENDPOINT_HISTORY_KEY,
        JSON.stringify(state.endpointHistory)
      );
      localStorage.setItem(LOCAL_STORAGE_ENDPOINT_ERRORS_KEY, JSON.stringify(state.endpointErrors));
    } catch (error) {
      console.error('Error saving to localStorage:', error);

      if (error.name === 'QuotaExceededError' || error.toString().includes('quota')) {
        // Handle storage limit exceeded by pruning old data
        this.pruneOldData();

        // Try again
        try {
          const state = get(rpcStore);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.localHistoryData));
          localStorage.setItem(
            LOCAL_STORAGE_ENDPOINT_HISTORY_KEY,
            JSON.stringify(state.endpointHistory)
          );
          localStorage.setItem(
            LOCAL_STORAGE_ENDPOINT_ERRORS_KEY,
            JSON.stringify(state.endpointErrors)
          );
        } catch (retryError) {
          console.error('Still unable to save after pruning:', retryError);
        }
      }
    }
  }

  /**
   * Prune old data if we exceed storage limits
   */
  pruneOldData() {
    if (!browser) return;

    // Cut retention window in half
    const reducedAgeMs = MAX_STORAGE_AGE_MS / 2;
    const cutoffTime = new Date().getTime() - reducedAgeMs;
    const state = get(rpcStore);

    const updatedHistory = { ...state.localHistoryData };
    const updatedErrors = { ...state.endpointErrors };

    // Prune history data
    Object.keys(updatedHistory).forEach((method) => {
      Object.keys(updatedHistory[method]).forEach((endpoint) => {
        if (Array.isArray(updatedHistory[method][endpoint])) {
          updatedHistory[method][endpoint] = updatedHistory[method][endpoint].filter(
            (item) => item.time.getTime() >= cutoffTime
          );
        }
      });
    });

    // Prune error data
    Object.keys(updatedErrors).forEach((method) => {
      Object.keys(updatedErrors[method]).forEach((endpoint) => {
        if (Array.isArray(updatedErrors[method][endpoint])) {
          updatedErrors[method][endpoint] = updatedErrors[method][endpoint].filter(
            (item) => item.timestamp.getTime() >= cutoffTime
          );
        }
      });
    });

    // Update the store with pruned data
    rpcStore.setLocalHistoryData(updatedHistory);
    rpcStore.setEndpointErrors(updatedErrors);

    console.log('Pruned old data to reduce storage size');
  }

  /**
   * Export local data as JSON file
   */
  exportLocalData() {
    if (!browser) return;

    // Prepare export data object
    const state = get(rpcStore);
    const exportData = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      historyData: state.localHistoryData,
      endpointHistory: state.endpointHistory,
      endpointErrors: state.endpointErrors,
    };

    // Convert to JSON string
    const jsonString = JSON.stringify(exportData, null, 2);

    // Create blob and download link
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Create temporary link and trigger download
    const a = document.createElement('a');
    const fileName = `rpc-monitor-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Import local data from JSON file
   */
  async importLocalData() {
    if (!browser) return;

    // Create file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    // Handle file selection
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const importedData = JSON.parse(text);

        // Validate imported data structure
        if (!importedData.historyData || !importedData.endpointHistory) {
          throw new Error('Invalid data format');
        }

        // Process imported history data to restore Date objects
        Object.keys(importedData.historyData).forEach((method) => {
          if (!importedData.historyData[method]) return;

          Object.keys(importedData.historyData[method]).forEach((endpoint) => {
            if (Array.isArray(importedData.historyData[method][endpoint])) {
              importedData.historyData[method][endpoint] = importedData.historyData[method][
                endpoint
                ].map((item) => ({
                ...item,
                time: new Date(item.time),
              }));
            }
          });
        });

        // Process imported error data if it exists
        if (importedData.endpointErrors) {
          Object.keys(importedData.endpointErrors).forEach((method) => {
            if (!importedData.endpointErrors[method]) return;

            Object.keys(importedData.endpointErrors[method]).forEach((endpoint) => {
              if (Array.isArray(importedData.endpointErrors[method][endpoint])) {
                importedData.endpointErrors[method][endpoint] = importedData.endpointErrors[method][
                  endpoint
                  ].map((item) => ({
                  ...item,
                  timestamp: new Date(item.timestamp),
                }));
              }
            });
          });
        }

        // Get current state
        const state = get(rpcStore);

        // Merge with existing data
        const mergedHistory = {
          ...state.localHistoryData,
          ...importedData.historyData,
        };
        const mergedEndpointHistory = {
          ...state.endpointHistory,
          ...importedData.endpointHistory,
        };
        const mergedErrors = {
          ...state.endpointErrors,
          ...(importedData.endpointErrors || {}),
        };

        // Update stores with merged data
        rpcStore.setLocalHistoryData(mergedHistory);
        rpcStore.setEndpointHistory(mergedEndpointHistory);
        rpcStore.setEndpointErrors(mergedErrors);

        // Save merged data
        this.saveLocalData();

        // Recalculate metrics
        this.calculateEndpointMetrics();

        // Refresh UI if showing chart
        const currentState = get(rpcStore);
        if (currentState.showChart && currentState.selectedEndpoint) {
          this.fetchHistoricalData(currentState.selectedEndpoint, currentState.timeRange);
        }

        alert('Data imported successfully');
      } catch (error) {
        console.error('Error importing data:', error);
        alert('Error importing data: ' + error.message);
      }
    };

    // Trigger file selection
    input.click();
  }
}

// Create and export a singleton instance
export const rpcService = new RpcService();
