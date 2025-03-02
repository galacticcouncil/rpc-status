<script>
  import {onDestroy, onMount} from 'svelte';
  import {browser} from '$app/environment';

  // RPC monitor imports (loaded only on client-side)
  let PolkadotRpcMonitor;
  if (browser) {
    import('../../core-monitor.js').then(module => {
      PolkadotRpcMonitor = module.PolkadotRpcMonitor;
      initMonitor();
    });
  }

  const CHECK_INTERVAL = 10000; // 10 seconds
  const LOCAL_STORAGE_KEY = 'hydration-rpc-monitor-data-by-method';
  const LOCAL_STORAGE_ENDPOINT_HISTORY_KEY = 'hydration-rpc-endpoint-history-by-method';
  const LOCAL_STORAGE_ENDPOINT_ERRORS_KEY = 'hydration-rpc-endpoint-errors-by-method';
  const MAX_STORAGE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  const MAX_ERROR_ENTRIES = 500; // Maximum number of error entries to store per endpoint

  // Available RPC methods
  let rpcMethods = [
    { id: 'chain_getBlock', name: 'chain_getBlock', description: 'Get latest block' },
    { id: 'eth_blockNumber', name: 'eth_blockNumber', description: 'Get latest block number through EVM' },
    { id: 'chain_getFinalizedHead', name: 'chain_getFinalizedHead', description: 'Get finalized head' },
    { id: 'system_syncState', name: 'system_syncState', description: 'Check sync state' },
  ];
  let selectedMethod = 'chain_getBlock';

  // State variables
  let results = [];
  let historyData = [];
  let selectedEndpoint = null;
  let selectedEndpointName = null;
  let timeRange = '1h';
  let useBackend = false;
  let oldUseBackend = useBackend; // Track previous value to prevent unnecessary updates
  let monitor;
  let intervalId;
  let timeIntervalId; // For time updates
  let endpointHistory = {}; // Organized by method, then endpoint
  let endpointErrors = {}; // Organized by method, then endpoint
  let localHistoryData = {}; // Organized by method, then endpoint
  let showChart = false;
  let showErrors = false; // New: Toggle for error display
  let currentTime = new Date(); // For time display
  let lastSaveTime = 0; // To limit save frequency
  let endpointMetrics = {}; // Store calculated metrics for each endpoint

  // Load data from localStorage
  function loadLocalData() {
    if (!browser) return;

    try {
      // Load historical data
      const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedData) {
        const parsedData = JSON.parse(savedData);

        // Initialize structure if needed
        if (!parsedData[selectedMethod]) {
          parsedData[selectedMethod] = {};
        }

        // Convert string dates back to Date objects for all methods
        Object.keys(parsedData).forEach(method => {
          Object.keys(parsedData[method]).forEach(endpoint => {
            if (Array.isArray(parsedData[method][endpoint])) {
              parsedData[method][endpoint] = parsedData[method][endpoint].map(item => ({
                ...item,
                time: new Date(item.time)
              }));

              // Filter out data older than MAX_STORAGE_AGE_MS
              const cutoffTime = new Date().getTime() - MAX_STORAGE_AGE_MS;
              parsedData[method][endpoint] = parsedData[method][endpoint].filter(item =>
                item.time.getTime() >= cutoffTime
              );
            }
          });
        });

        localHistoryData = parsedData;
        console.log('Loaded historical data from localStorage');
      }

      // Load endpoint history
      const savedHistory = localStorage.getItem(LOCAL_STORAGE_ENDPOINT_HISTORY_KEY);
      if (savedHistory) {
        endpointHistory = JSON.parse(savedHistory);

        // Initialize structure if needed
        if (!endpointHistory[selectedMethod]) {
          endpointHistory[selectedMethod] = {};
        }

        console.log('Loaded endpoint history from localStorage');
      }

      // Load endpoint errors
      const savedErrors = localStorage.getItem(LOCAL_STORAGE_ENDPOINT_ERRORS_KEY);
      if (savedErrors) {
        const parsedErrors = JSON.parse(savedErrors);

        // Initialize structure if needed
        if (!parsedErrors[selectedMethod]) {
          parsedErrors[selectedMethod] = {};
        }

        // Convert string dates back to Date objects for all methods
        Object.keys(parsedErrors).forEach(method => {
          Object.keys(parsedErrors[method]).forEach(endpoint => {
            if (Array.isArray(parsedErrors[method][endpoint])) {
              parsedErrors[method][endpoint] = parsedErrors[method][endpoint].map(item => ({
                ...item,
                timestamp: new Date(item.timestamp)
              }));

              // Filter out errors older than MAX_STORAGE_AGE_MS
              const cutoffTime = new Date().getTime() - MAX_STORAGE_AGE_MS;
              parsedErrors[method][endpoint] = parsedErrors[method][endpoint].filter(item =>
                item.timestamp.getTime() >= cutoffTime
              );
            }
          });
        });

        endpointErrors = parsedErrors;
        console.log('Loaded endpoint errors from localStorage');
      }

      // Calculate metrics after loading data
      calculateEndpointMetrics();
    } catch (error) {
      console.error('Error loading data from localStorage:', error);
      // If data is corrupted, reset it
      localHistoryData = { [selectedMethod]: {} };
      endpointHistory = { [selectedMethod]: {} };
      endpointErrors = { [selectedMethod]: {} };
    }
  }

  // Save data to localStorage
  function saveLocalData() {
    if (!browser) return;

    // Limit save frequency to prevent performance issues (save at most once every 30 seconds)
    const now = Date.now();
    if (now - lastSaveTime < 30000) return;
    lastSaveTime = now;

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localHistoryData));
      localStorage.setItem(LOCAL_STORAGE_ENDPOINT_HISTORY_KEY, JSON.stringify(endpointHistory));
      localStorage.setItem(LOCAL_STORAGE_ENDPOINT_ERRORS_KEY, JSON.stringify(endpointErrors));
    } catch (error) {
      console.error('Error saving to localStorage:', error);

      if (error.name === 'QuotaExceededError' || error.toString().includes('quota')) {
        // Handle storage limit exceeded by pruning old data
        pruneOldData();
        // Try again
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localHistoryData));
          localStorage.setItem(LOCAL_STORAGE_ENDPOINT_HISTORY_KEY, JSON.stringify(endpointHistory));
          localStorage.setItem(LOCAL_STORAGE_ENDPOINT_ERRORS_KEY, JSON.stringify(endpointErrors));
        } catch (retryError) {
          console.error('Still unable to save after pruning:', retryError);
        }
      }
    }
  }

  // Prune old data if we exceed storage limits
  function pruneOldData() {
    // Cut our retention window in half
    const reducedAgeMs = MAX_STORAGE_AGE_MS / 2;
    const cutoffTime = new Date().getTime() - reducedAgeMs;

    Object.keys(localHistoryData).forEach(method => {
      Object.keys(localHistoryData[method]).forEach(endpoint => {
        if (Array.isArray(localHistoryData[method][endpoint])) {
          localHistoryData[method][endpoint] = localHistoryData[method][endpoint].filter(item =>
            item.time.getTime() >= cutoffTime
          );
        }
      });
    });

    // Also prune error data
    Object.keys(endpointErrors).forEach(method => {
      Object.keys(endpointErrors[method]).forEach(endpoint => {
        if (Array.isArray(endpointErrors[method][endpoint])) {
          endpointErrors[method][endpoint] = endpointErrors[method][endpoint].filter(item =>
            item.timestamp.getTime() >= cutoffTime
          );
        }
      });
    });

    console.log('Pruned old data to reduce storage size');
  }

  // Calculate metrics for all endpoints
  function calculateEndpointMetrics() {
    const now = new Date().getTime();
    const timeWindow = parseTimeRange(timeRange);

    // Initialize metrics object
    endpointMetrics = {};

    // Make sure we have structure for current method
    if (!localHistoryData[selectedMethod]) {
      return;
    }

    // Calculate for all endpoints with history data for current method
    Object.keys(localHistoryData[selectedMethod]).forEach(endpoint => {
      if (Array.isArray(localHistoryData[selectedMethod][endpoint])) {
        // Get recent data within time window
        const recentData = localHistoryData[selectedMethod][endpoint].filter(item =>
          (now - item.time.getTime()) <= timeWindow
        );

        if (recentData.length > 0) {
          // Calculate uptime (percentage of non-error responses)
          const upCount = recentData.filter(item => !item.error).length;
          const uptime = upCount / recentData.length * 100;

          // Calculate average latency (for successful responses only)
          const successLatencies = recentData.filter(item => !item.error).map(item => item.value);
          const avgLatency = successLatencies.length > 0
            ? successLatencies.reduce((sum, val) => sum + val, 0) / successLatencies.length
            : null;

          endpointMetrics[endpoint] = {
            avgLatency: avgLatency !== null ? avgLatency : Infinity,
            uptime: uptime,
            dataPoints: recentData.length,
            remote: false, // Flag as local source
            errorCount: recentData.filter(item => item.error).length // Track error count
          };
        }
      }
    });
  }

  // Change RPC method
  function changeRpcMethod(method) {
    // Only allow changing method when using local data source
    if (useBackend) {
      useBackend = false; // Force switch to local mode
    }

    selectedMethod = method;

    // Update the monitor with the new method
    if (browser && monitor) {
      monitor.setMethod(method);

      // Reset displayed history data to show method-specific data
      historyData = [];

      // Recalculate metrics for the selected method
      calculateEndpointMetrics();

      // If chart is visible, refresh it with method-specific data
      if (showChart && selectedEndpoint) {
        fetchHistoricalData(selectedEndpoint, timeRange);
      }
    }
  }

  // Export local data as JSON file
  function exportLocalData() {
    if (!browser) return;

    // Prepare export data object
    const exportData = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      historyData: localHistoryData,
      endpointHistory: endpointHistory,
      endpointErrors: endpointErrors // Include error data in export
    };

    // Convert to JSON string
    const jsonString = JSON.stringify(exportData, null, 2);

    // Create blob and download link
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Create temporary link and trigger download
    const a = document.createElement('a');
    const fileName = `rpc-monitor-data-${new Date().toISOString().slice(0,10)}.json`;
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

  // Import local data from JSON file
  async function importLocalData() {
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
        Object.keys(importedData.historyData).forEach(method => {
          if (!importedData.historyData[method]) return;

          Object.keys(importedData.historyData[method]).forEach(endpoint => {
            if (Array.isArray(importedData.historyData[method][endpoint])) {
              importedData.historyData[method][endpoint] = importedData.historyData[method][endpoint].map(item => ({
                ...item,
                time: new Date(item.time)
              }));
            }
          });
        });

        // Process imported error data if it exists
        if (importedData.endpointErrors) {
          Object.keys(importedData.endpointErrors).forEach(method => {
            if (!importedData.endpointErrors[method]) return;

            Object.keys(importedData.endpointErrors[method]).forEach(endpoint => {
              if (Array.isArray(importedData.endpointErrors[method][endpoint])) {
                importedData.endpointErrors[method][endpoint] = importedData.endpointErrors[method][endpoint].map(item => ({
                  ...item,
                  timestamp: new Date(item.timestamp)
                }));
              }
            });
          });
        }

        // Merge with existing data
        localHistoryData = { ...localHistoryData, ...importedData.historyData };
        endpointHistory = { ...endpointHistory, ...importedData.endpointHistory };
        endpointErrors = { ...endpointErrors, ...(importedData.endpointErrors || {}) };

        // Save merged data
        saveLocalData();

        // Recalculate metrics
        calculateEndpointMetrics();

        // Refresh UI if showing chart
        if (showChart && selectedEndpoint) {
          fetchHistoricalData(selectedEndpoint, timeRange);
        }

        alert("Data imported successfully");
      } catch (error) {
        console.error('Error importing data:', error);
        alert("Error importing data: " + error.message);
      }
    };

    // Trigger file selection
    input.click();
  }

  // Initialize browser monitor
  function initMonitor() {
    if (!browser || !PolkadotRpcMonitor) return;

    // Load saved data first
    loadLocalData();

    monitor = new PolkadotRpcMonitor();

    monitor.setUpdateCallback(newResults => {
      results = newResults;
      updateEndpointHistory(newResults);

      // Update metrics based on data source
      if (useBackend) {
        fetchResultsFromBackend();
      } else {
        calculateEndpointMetrics();
      }

      updateTime(); // Update time on data refresh
    });

    // Start monitoring based on initial useBackend setting
    if (useBackend) {
      fetchResultsFromBackend();
      startBackendPolling();
    } else {
      monitor.start(CHECK_INTERVAL, selectedMethod);
    }
  }

  // Update current time
  function updateTime() {
    currentTime = new Date();
  }

  onMount(() => {
    if (browser) {
      fetchResultsFromBackend();

      // Set up time update every second
      timeIntervalId = setInterval(() => {
        currentTime = new Date();
      }, 1000);

      // Set up modal behavior
      document.querySelectorAll('.tui-modal-button').forEach(button => {
        button.addEventListener('click', () => {
          const modalId = button.getAttribute('data-modal');
          document.getElementById(modalId).style.display = 'block';
        });
      });

      document.querySelectorAll('.tui-modal-close-button').forEach(button => {
        button.addEventListener('click', () => {
          const modalId = button.getAttribute('data-modal');
          document.getElementById(modalId).style.display = 'none';
        });
      });
    }
  });

  // Clean up on component destroy
  onDestroy(() => {
    if (browser) {
      if (monitor) {
        monitor.stop();
      }

      if (intervalId) {
        clearInterval(intervalId);
      }

      if (timeIntervalId) {
        clearInterval(timeIntervalId);
      }

      // Save data before unloading
      saveLocalData();
    }
  });

  // Toggle between backend and browser monitoring - only when useBackend actually changes
  $: if (browser && monitor && (oldUseBackend !== useBackend)) {
    oldUseBackend = useBackend;

    // Clear metrics when toggling to ensure we don't mix data sources
    endpointMetrics = {};

    if (useBackend) {
      monitor.stop();
      fetchResultsFromBackend(); // This will fetch metrics from backend
      startBackendPolling();
      // Reset method to default when using backend
      if (selectedMethod !== 'chain_getBlock') {
        selectedMethod = 'chain_getBlock';
      }
    } else {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      monitor.start(CHECK_INTERVAL, selectedMethod);
      // When switching to local, recalculate metrics from local data
      calculateEndpointMetrics();
    }

    // Refresh chart data if chart is visible
    if (showChart && selectedEndpoint) {
      fetchHistoricalData(selectedEndpoint, timeRange);
    }
  }

  // Fetch historical data when time range changes (not endpoint selection)
  $: if (browser && selectedEndpoint && showChart && timeRange) {
    fetchHistoricalData(selectedEndpoint, timeRange);
  }

  // Select a time range and close menu
  function selectTimeRange(range) {
    timeRange = range;

    if (showChart && selectedEndpoint) {
      fetchHistoricalData(selectedEndpoint, timeRange);
    }

    // Recalculate metrics when time range changes
    if (useBackend) {
      fetchResultsFromBackend();
    } else {
      calculateEndpointMetrics();
    }
  }

  function toggleRange() {
    if (timeRange === '15m') return selectTimeRange('1h');
    if (timeRange === '1h') return selectTimeRange('3h');
    if (timeRange === '3h') return selectTimeRange('12h');
    if (timeRange === '12h') return selectTimeRange('24h');
    if (timeRange === '24h') return selectTimeRange('15m');
  }

  // Toggle between chart and errors view
  function toggleErrorsView() {
    showErrors = !showErrors;
  }

  // Toggle backend use and close menu
  function toggleBackend() {
    useBackend = !useBackend;

    // If switching to backend, reset method to default
    if (useBackend && selectedMethod !== 'chain_getBlock') {
      selectedMethod = 'chain_getBlock';
    }
  }

  // Fetch results from backend
  async function fetchResultsFromBackend() {
    if (!browser) return;

    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      results = data;
      updateEndpointHistory(data);
      calculateEndpointMetrics(); // Update metrics after getting new data
      updateTime(); // Update time on data refresh
    } catch (error) {
      console.error('Error fetching from backend:', error);
    }
  }

  // Start polling backend for updates
  function startBackendPolling() {
    if (!browser) return;

    if (intervalId) {
      clearInterval(intervalId);
    }

    intervalId = setInterval(fetchResultsFromBackend, CHECK_INTERVAL);
  }

  // Fetch historical data for a specific endpoint
  async function fetchHistoricalData(endpoint, range) {
    if (!browser) return;

    if (useBackend) {
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
          historyData = processHistoricalData(latencyData.data.result, statusData.data.result);
        }
      } catch (error) {
        console.error('Error fetching historical data:', error);
      }
    } else {
      // Use method-specific local history data
      if (localHistoryData[selectedMethod] && localHistoryData[selectedMethod][endpoint]) {
        // Filter data based on time range
        const now = new Date();
        const rangeInMs = parseTimeRange(range);
        historyData = localHistoryData[selectedMethod][endpoint].filter(d =>
          (now - d.time) <= rangeInMs
        );
      } else {
        historyData = [];
      }
    }
  }

  // Helper function to parse time range string into milliseconds
  function parseTimeRange(range) {
    const value = parseInt(range);
    if (range.endsWith('m')) {
      return value * 60 * 1000; // minutes to ms
    } else if (range.endsWith('h')) {
      return value * 60 * 60 * 1000; // hours to ms
    } else if (range.endsWith('d')) {
      return value * 24 * 60 * 60 * 1000; // days to ms
    }
    return 3600000; // default 1 hour
  }

  // Process Prometheus data format to chart format
  function processHistoricalData(latencyResult, statusResult) {
    if (!latencyResult || !latencyResult.length) return [];

    const latencyData = latencyResult[0]?.values || [];
    const statusData = statusResult[0]?.values || [];

    // Create a map of timestamps to status values
    const statusMap = new Map();
    statusData.forEach(([timestamp, value]) => {
      statusMap.set(timestamp, parseFloat(value));
    });

    // Convert Prometheus data format to chart format with error flags
    return latencyData.map(([timestamp, value]) => {
      const status = statusMap.get(timestamp);
      return {
        time: new Date(timestamp * 1000),
        value: parseFloat(value),
        // Mark as error if status is 0 (down) or undefined
        error: status === 0 || status === undefined
      };
    });
  }

  // Process data for TUI chart display
  function processHistoryDataForTuiChart(data) {
    if (!data || data.length === 0) return [];

    // Sort chronologically
    const sortedData = [...data].sort((a, b) => a.time - b.time);

    // If we have lots of data points, reduce them for the chart
    let chartData = sortedData;
    if (sortedData.length > 8) {
      // Take at most 8 data points
      const step = Math.floor(sortedData.length / 8);
      chartData = [];
      for (let i = 0; i < sortedData.length; i += step) {
        if (chartData.length < 8 && i < sortedData.length) {
          chartData.push(sortedData[i]);
        }
      }
    }

    return chartData;
  }

  // Format time for chart labels
  function formatTimeLabel(time) {
    return time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  }

  // Calculate max value for chart scaling
  function getMaxLatency(data) {
    if (!data || data.length === 0) return 1000;
    return Math.max(...data.map(d => d.value), 1000);
  }

  // Handle endpoint selection for chart modal - Fixed to avoid triggering pings
  function handleEndpointSelect(endpoint) {
    selectedEndpoint = endpoint.url;
    selectedEndpointName = endpoint.name;
    showChart = true;
    showErrors = false; // Reset to chart view when selecting an endpoint

    if (browser) {
      // Just open the modal, use cached data only
      document.getElementById('chart-modal').style.display = 'block';

      // Use the existing local history data without triggering a reactive update
      if (localHistoryData[selectedMethod] && localHistoryData[selectedMethod][endpoint.url]) {
        const now = new Date();
        const rangeInMs = parseTimeRange(timeRange);
        historyData = localHistoryData[selectedMethod][endpoint.url].filter(d =>
          (now - d.time) <= rangeInMs
        );
      } else {
        historyData = [];
      }
    }
  }

  // Handle closing the chart modal
  function closeChartModal() {
    if (browser) {
      document.getElementById('chart-modal').style.display = 'none';
    }
  }

  // Calculate maximum block height
  $: maxBlockHeight = results.length > 0
    ? Math.max(
      ...results
        .filter(result => result.status === 'success' && result.blockHeight !== undefined)
        .map(result => result.blockHeight),
      0
    )
    : 0;

  // Helper function to categorize status
  function categorizeStatus(result) {
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

    // Only mark as warning if maxBlockHeight is valid and this endpoint
    // is significantly behind (more than 2 blocks)
    if (maxBlockHeight > 0 && (maxBlockHeight - result.blockHeight) > 2) {
      return 'warning';
    }

    // Default to success for any other case
    return 'success';
  }

  // Function to determine row class based on status and block height
  function getRowClass(result) {
    return categorizeStatus(result);
  }

  // Update status history and refresh chart if needed
  function updateEndpointHistory(newResults) {
    // Update time on data refresh
    updateTime();

    // Ensure we have structures for the current method
    if (!localHistoryData[selectedMethod]) {
      localHistoryData[selectedMethod] = {};
    }

    if (!endpointHistory[selectedMethod]) {
      endpointHistory[selectedMethod] = {};
    }

    if (!endpointErrors[selectedMethod]) {
      endpointErrors[selectedMethod] = {};
    }

    // Update history for each endpoint
    newResults.forEach(result => {
      const url = result.endpoint.url;
      const status = categorizeStatus(result);

      // Initialize history array if needed for this method+endpoint
      if (!endpointHistory[selectedMethod][url]) {
        // Initialize with 7 "unknown" statuses
        endpointHistory[selectedMethod][url] = Array(7).fill("unknown");
      }

      // Shift existing statuses for this method+endpoint
      const newHistory = [...endpointHistory[selectedMethod][url]];
      newHistory.shift(); // Remove the oldest (leftmost) status
      newHistory.push(status); // Add new status at the end (right)
      endpointHistory[selectedMethod][url] = newHistory;

      // Update local history data for charts
      if (!localHistoryData[selectedMethod][url]) {
        localHistoryData[selectedMethod][url] = [];
      }

      // Add new data point with current timestamp
      localHistoryData[selectedMethod][url].push({
        time: new Date(),
        value: result.responseTime,
        error: result.status !== 'success' || result.timeout
      });

      // Limit local history size (keep ~24 hours at 10s intervals = ~8640 points)
      const maxPoints = 8640;
      if (localHistoryData[selectedMethod][url].length > maxPoints) {
        localHistoryData[selectedMethod][url] = localHistoryData[selectedMethod][url].slice(-maxPoints);
      }

      // Update error history if there's an error
      if (result.status !== 'success' || result.timeout) {
        if (!endpointErrors[selectedMethod][url]) {
          endpointErrors[selectedMethod][url] = [];
        }

        // Add error details
        endpointErrors[selectedMethod][url].push({
          timestamp: new Date(),
          errorType: result.timeout ? 'timeout' : 'error',
          message: result.error || 'Unknown error',
          details: result.details,
          responseTime: result.responseTime
        });

        console.log('error', result)

        // Limit error history size
        if (endpointErrors[selectedMethod][url].length > MAX_ERROR_ENTRIES) {
          endpointErrors[selectedMethod][url] = endpointErrors[selectedMethod][url].slice(-MAX_ERROR_ENTRIES);
        }
      }
    });

    // Force Svelte to detect the change
    endpointHistory = {...endpointHistory};
    endpointErrors = {...endpointErrors};

    // Save to localStorage (throttled internally)
    saveLocalData();

    // Refresh chart data if we're currently viewing a chart
    if (showChart && selectedEndpoint) {
      fetchHistoricalData(selectedEndpoint, timeRange);
    }
  }

  // Add a window event listener to save data before the page unloads
  if (browser) {
    window.addEventListener('beforeunload', () => {
      saveLocalData();
    });
  }

  // Function to clear local data
  function clearLocalData() {
    if (!browser) return;

    // Clear data from localStorage
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem(LOCAL_STORAGE_ENDPOINT_HISTORY_KEY);
    localStorage.removeItem(LOCAL_STORAGE_ENDPOINT_ERRORS_KEY);

    // Clear memory variables
    localHistoryData = { [selectedMethod]: {} };
    endpointHistory = { [selectedMethod]: {} };
    endpointErrors = { [selectedMethod]: {} };
    endpointMetrics = {};

    // Update UI to reflect cleared data
    if (showChart && selectedEndpoint) {
      historyData = [];
    }

    console.log('Local data cleared');
  }

  // Get recent errors for the selected endpoint
  function getRecentErrors(endpoint, timeWindow = null) {
    if (!endpointErrors[selectedMethod] || !endpointErrors[selectedMethod][endpoint] ||
      !Array.isArray(endpointErrors[selectedMethod][endpoint])) {
      return [];
    }

    // If timeWindow is specified, filter by time
    if (timeWindow) {
      const now = new Date().getTime();
      return endpointErrors[selectedMethod][endpoint]
        .filter(error => (now - error.timestamp.getTime()) <= timeWindow)
        .sort((a, b) => b.timestamp - a.timestamp); // Sort newest first
    }

    // Otherwise return all errors, newest first
    return [...endpointErrors[selectedMethod][endpoint]].sort((a, b) => b.timestamp - a.timestamp);
  }

  // Format error timestamp
  function formatErrorTime(timestamp) {
    return timestamp.toLocaleString();
  }

  $: sortedResults = [...results].sort((a, b) => {
    const aMetrics = endpointMetrics[a.endpoint.url];
    const bMetrics = endpointMetrics[b.endpoint.url];

    // Sort by block number first
    if (b.blockHeight !== a.blockHeight) {
      return (b.blockHeight || 0) - (a.blockHeight || 0);
    }

    // If block numbers are equal, sort by average latency
    if (!aMetrics && !bMetrics) return 0;
    if (!aMetrics) return 1;
    if (!bMetrics) return -1;

    return aMetrics.avgLatency - bMetrics.avgLatency;
  });

  // Get current errors for selected endpoint
  $: currentErrors = selectedEndpoint ?
    getRecentErrors(selectedEndpoint, parseTimeRange(timeRange)) :
    [];

  // Count errors in selected timeframe
  $: errorCount = currentErrors.length;
</script>

<svelte:head>
    <title>Hydration RPC Status</title>
</svelte:head>

<nav class="tui-nav">
    <div class="tui-panel-header tui-bg-blue tui-fg-white">Hydration RPC Status</div>
    <ul>
        <li class="tui-dropdown">
            <span>Data</span>
            <div class="tui-dropdown-content">
                <ul>
                    <li>
                        <span on:click={toggleBackend}>
                          {useBackend ? 'Use Local' : 'Use Remote'}
                        </span>
                    </li>
                    <div class="tui-black-divider"></div>
                    <li>
                        <span on:click={exportLocalData}>
                          Export Data
                        </span>
                    </li>
                    <li>
                        <span on:click={importLocalData}>
                          Import Data
                        </span>
                    </li>
                    <li>
                        <span on:click={clearLocalData}>
                          Clear Local
                        </span>
                    </li>
                </ul>
            </div>
        </li>
        <li class="tui-dropdown">
            <span>Time range</span>
            <div class="tui-dropdown-content">
                <ul>
                    <li>
                        <span class="tui-menu-item" class:tui-menu-active={timeRange === '15m'}
                              on:click={() => selectTimeRange('15m')}>
                          Last 15 min
                        </span>
                    </li>
                    <li>
                        <span class="tui-menu-item" class:tui-menu-active={timeRange === '1h'}
                              on:click={() => selectTimeRange('1h')}>
                          Last hour
                        </span>
                    </li>
                    <li>
                        <span class="tui-menu-item" class:tui-menu-active={timeRange === '3h'}
                              on:click={() => selectTimeRange('3h')}>
                          Last 3 hours
                        </span>
                    </li>
                    <li>
                        <span class="tui-menu-item" class:tui-menu-active={timeRange === '12h'}
                              on:click={() => selectTimeRange('12h')}>
                          Last 12 hours
                        </span>
                    </li>
                    <li>
                        <span class="tui-menu-item" class:tui-menu-active={timeRange === '24h'}
                              on:click={() => selectTimeRange('24h')}>
                          Last 24 hours
                        </span>
                    </li>
                </ul>
            </div>
        </li>
        <li class="tui-dropdown">
            <span>Check</span>
            <div class="tui-dropdown-content">
                <ul>
                    {#each rpcMethods as method}
                        <li>
                            <span class="tui-menu-item" class:tui-menu-active={selectedMethod === method.id}
                                  on:click={() => changeRpcMethod(method.id)}>
                                {method.name}
                            </span>
                        </li>
                    {/each}
                </ul>
            </div>
        </li>

        <span class="tui-datetime" data-format="h:m:s a">{currentTime.toLocaleTimeString()}</span>
    </ul>

</nav>

<main class="tui-bg-blue-black">

    <!-- Content -->
    <!-- RPC status table -->
    <div class="tui-panel" style="width: 100%; margin-top: 50px">
        <div class="tui-panel-content" style="padding: 0;">
            <div class="tui-table-container">
                <table class="tui-table hovered-cyan striped-purple">
                    <thead>
                    <tr>
                        <th>Name</th>
                        <th class="loc-column">Location</th>
                        <th class="url-column">URL</th>
                        <th>Block</th>
                        <th>Latency</th>
                        {#if !useBackend}
                            <th class="metrics-column">Average</th>
                            <th class="metrics-column">Uptime</th>
                        {/if}
                        <th>Status</th>
                    </tr>
                    </thead>
                    <tbody>
                    {#each useBackend ? results : sortedResults as result, index (index)}
                        <tr
                                on:click={() => handleEndpointSelect(result.endpoint)}
                                style="cursor: pointer;"
                        >
                            <td>{result.endpoint.name}</td>
                            <td class="loc-column">{result.endpoint.location}</td>
                            <td class="url-column">{result.endpoint.url}</td>
                            <td>{result.blockHeight || '?'}</td>
                            <td>{result.responseTime.toFixed(0)} ms</td>
                            {#if !useBackend}
                                <td class="metrics-column">
                                    {#if endpointMetrics[result.endpoint.url]?.avgLatency !== undefined && endpointMetrics[result.endpoint.url]?.avgLatency !== Infinity}
                                        {endpointMetrics[result.endpoint.url].avgLatency.toFixed(0)} ms
                                    {:else}
                                        ?
                                    {/if}

                                </td>
                                <td class="metrics-column">
                                    {#if endpointMetrics[result.endpoint.url]?.uptime !== undefined}
                                        {endpointMetrics[result.endpoint.url].uptime.toFixed(1)}%
                                    {:else}
                                        ?
                                    {/if}
                                </td>
                            {/if}
                            <td width="80px">
                                <div style="display: flex; align-items: center;">
                                    {#if endpointHistory[selectedMethod] && endpointHistory[selectedMethod][result.endpoint.url]}
                                        {#each endpointHistory[selectedMethod][result.endpoint.url] as status}
                                            <span class={`status-icon ${status}`} title={status}></span>
                                        {/each}
                                    {:else}
                                        {#each Array(7).fill('unknown') as _}
                                            <span class="status-icon unknown" title="No data yet"></span>
                                        {/each}
                                    {/if}
                                </div>
                            </td>
                        </tr>
                    {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <div class="tui-statusbar">
        <ul>
            <li on:click={toggleBackend}>
                <span>{useBackend ? 'Remote' : 'Local'}</span>
            </li>
            <span class="tui-statusbar-divider"></span>
            <li on:click={toggleRange}>
                <span>{timeRange}</span>
            </li>
            <span class="tui-statusbar-divider"></span>
            <li>
                <span>{selectedMethod}</span>
            </li>
        </ul>
    </div>

    <!-- Chart Modal window -->
    <div id="chart-modal" class="tui-modal">
        <div class="tui-window modal-centered cyan-168" style="width: 80%; max-width: 900px; height: auto; max-height: 80%;">
            <fieldset class="tui-fieldset">
                <legend class="">{selectedEndpointName}</legend>
                <button on:click={closeChartModal} class="tui-fieldset-button right"><span>■</span></button>

                <!-- Tab buttons -->
                <!--                <div class="tui-tabs">-->
                <!--                    <ul>-->
                <!--                        <li><a class="tui-tab" class:tui-tab-active={!showErrors} on:click={() => showErrors = false}>Chart</a></li>-->
                <!--                        <li><a class="tui-tab" class:tui-tab-active={showErrors} on:click={() => showErrors = true}>Errors ({errorCount})</a></li>-->
                <!--                    </ul>-->
                <!--                </div>-->

                {#if !showErrors}
                    <!-- Chart view -->
                    <div style="margin-bottom: 25px;">
                        {#if historyData.length > 0}
                            <!-- TUI Vertical Chart -->
                            {@const chartData = processHistoryDataForTuiChart(historyData)}
                            {@const maxLatency = getMaxLatency(chartData)}

                            <div class="tui-chart-vertical" style="width: 100%; height: 350px;">
                                <div class="tui-chart-display">
                                    {#each chartData as dataPoint, i}
                                        <div class="tui-chart-value {dataPoint.error ? 'red-168' : 'green-168'}"
                                             style="height: {Math.min(100, (dataPoint.value / maxLatency * 100)).toFixed(1)}%; {dataPoint.error ? 'background-color: var(--error-color);' : ''}">
                                            {dataPoint.value.toFixed(0)} ms
                                        </div>
                                    {/each}
                                </div>
                                <div class="tui-chart-y-axis">
                                    <div class="tui-chart-legend">{Math.round(maxLatency)}</div>
                                    <div class="tui-chart-legend">{Math.round(maxLatency * 0.75)}</div>
                                    <div class="tui-chart-legend">{Math.round(maxLatency * 0.5)}</div>
                                    <div class="tui-chart-legend">{Math.round(maxLatency * 0.25)}</div>
                                    <div class="tui-chart-legend">0 ms</div>
                                </div>
                                <div class="tui-chart-x-axis">
                                    {#each chartData as dataPoint}
                                        <div class="tui-chart-legend">{formatTimeLabel(dataPoint.time)}</div>
                                    {/each}
                                </div>
                            </div>
                        {:else}
                            <div class="tui-panel" style="height: 100%;">
                                <div class="tui-panel-content"
                                     style="display: flex; justify-content: center; align-items: center; height: 100%;">
                                    <p>Loading chart data...</p>
                                </div>
                            </div>
                        {/if}
                    </div>
                {:else}
                    <!-- Errors view -->
                    <div class="errors-container">
                        {#if currentErrors.length > 0}
                            <div class="tui-table-container" style="height: 350px; overflow-y: auto;">
                                <table class="tui-table">
                                    <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Type</th>
                                        <th>Response</th>
                                        <th>Error</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {#each currentErrors as error}
                                        <tr class={error.errorType}>
                                            <td>{formatErrorTime(error.timestamp)}</td>
                                            <td>{error.errorType}</td>
                                            <td>{error.responseTime.toFixed(0)} ms</td>
                                            <td>{error.message}</td>
                                        </tr>
                                    {/each}
                                    </tbody>
                                </table>
                            </div>
                        {:else}
                            <div class="tui-panel" style="height: 350px;">
                                <div class="tui-panel-content"
                                     style="display: flex; justify-content: center; align-items: center; height: 100%;">
                                    <p>No errors recorded for this endpoint in the selected time range.</p>
                                </div>
                            </div>
                        {/if}
                    </div>
                {/if}

                <!-- Stats row with uptime and avg response time -->
                <div class="stats-row">
                    <div class="stat-item">
                        <span class="stat-label">Uptime:</span>
                        <span class="stat-value">
                            {#if historyData.length > 0}
                                {(100 - (historyData.filter(d => d.error).length / historyData.length * 100)).toFixed(0)}%
                            {:else}
                                ?
                            {/if}
                        </span>
                        <span class="stat-label">Requests:</span>
                        <span class="stat-value">
                            {#if historyData.length > 0}
                                {historyData.length}
                            {:else}
                                ?
                            {/if}
                        </span>
                        <span class="stat-label">Errors:</span>
                        <span class="stat-value">
                            {#if historyData.length > 0}
                                {historyData.filter(d => d.error).length}
                            {:else}
                                ?
                            {/if}
                        </span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Avg Response:</span>
                        <span class="stat-value">
                            {#if historyData.filter(d => !d.error).length > 0}
                                {(historyData.filter(d => !d.error).reduce((sum, d) => sum + d.value, 0) / historyData.filter(d => !d.error).length).toFixed(2)} ms
                            {:else}
                                ?
                            {/if}
                        </span>
                    </div>
                </div>
                <div>
                    <span>Endpoint: {selectedEndpoint}</span>
                </div>
            </fieldset>
        </div>
    </div>
</main>

<style>
    main {
        height: 100vh;
        padding: 20px;
        overflow: auto;
    }

    /* Custom styles for TUI CSS */
    .success {
    }

    .warning {
        color: var(--warning-color);
    }

    .error {
        color: var(--error-color);
    }

    .timeout {
        color: var(--timeout-color);
    }

    .tui-window {
        width: calc(100% - 10px);
        height: calc(100% - 30px);
    }

    /* Make table more readable */
    .tui-table {
        width: 100%;
    }

    .tui-table tr:hover {
        background-color: var(--tui-bg-highlighted);
    }

    /* Status indicators */
    .status-icon {
        display: inline-block;
        width: 8px;
        height: 14px;
        margin-right: 3px;
    }

    /* Modal initial state */
    .tui-modal {
        display: none;
    }

    /* Modal centering */
    .modal-centered {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }

    .tui-menu-active {
        background-color: var(--tui-bg-highlighted);
    }

    /* Tab styling */
    .tui-tabs {
        display: flex;
        margin-bottom: 10px;
        border-bottom: 1px solid var(--tui-border);
    }

    .tui-tab {
        background: transparent;
        border: none;
        padding: 8px 16px;
        margin-right: 4px;
        cursor: pointer;
        color: var(--tui-text);
    }

    .tui-tab-active {
        border: 1px solid var(--tui-border);
        border-bottom: none;
        background-color: red;
    }

    .errors-container {
        margin-bottom: 25px;
    }

    /* Hide URL column and metrics columns on narrow screens */
    @media (max-width: 950px) {
        .url-column {
            display: none;
        }

        .loc-column {
            display: none;
        }

        .metrics-column {
            display: none;
        }
    }
</style>
