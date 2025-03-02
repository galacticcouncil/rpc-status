<script>
  import { onMount, onDestroy } from 'svelte';
  import LineChart from '$lib/components/LineChart.svelte';
  import { browser } from '$app/environment';

  // RPC monitor imports (loaded only on client-side)
  let PolkadotRpcMonitor;
  if (browser) {
    // Dynamic import only on browser environment
    import('../../core-monitor.js').then(module => {
      PolkadotRpcMonitor = module.PolkadotRpcMonitor;
      initMonitor();
    });
  }

  const CHECK_INTERVAL = 10000; // 10 seconds

  // State variables
  let results = [];
  let historyData = [];
  let selectedEndpoint = null;
  let timeRange = '1h';
  let useBackend = false;
  let monitor;
  let intervalId;
  let endpointHistory = {};  // Store status history for each endpoint
  let pollCount = 0;  // Count polls to determine when to update history

  // Initialize browser monitor
  function initMonitor() {
    if (!browser || !PolkadotRpcMonitor) return;

    monitor = new PolkadotRpcMonitor();

    monitor.setUpdateCallback(newResults => {
      results = newResults;
      updateEndpointHistory(newResults);
    });

    // Start monitoring based on initial useBackend setting
    if (useBackend) {
      fetchResultsFromBackend();
      startBackendPolling();
    } else {
      monitor.start(CHECK_INTERVAL);
    }
  }

  onMount(() => {
    // Monitor is initialized via dynamic import
    // Fetch initial data from backend regardless
    if (browser) {
      fetchResultsFromBackend();
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
    }
  });

  // Toggle between backend and browser monitoring
  $: if (browser && monitor) {
    if (useBackend) {
      monitor.stop();
      fetchResultsFromBackend();
      startBackendPolling();
    } else {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      monitor.start(CHECK_INTERVAL);
    }
  }

  // Fetch historical data when endpoint or time range changes
  $: if (browser && selectedEndpoint) {
    fetchHistoricalData(selectedEndpoint, timeRange);
  }

  // Fetch results from backend
  async function fetchResultsFromBackend() {
    if (!browser) return;

    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      results = data;
      updateEndpointHistory(data);
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

    try {
      // Get latency data
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

  // Process data for chart display - smooth and simplify
  function processChartData(data) {
    if (!data || data.length === 0) return [];

    // Sort chronologically
    const sortedData = [...data].sort((a, b) => a.time - b.time);

    // If we have lots of data points, reduce them
    if (sortedData.length > 30) {
      // Simple sampling - take every nth point
      const samplingRate = Math.ceil(sortedData.length / 30);
      return sortedData.filter((_, i) => i % samplingRate === 0);
    }

    return sortedData;
  }

  // Handle endpoint selection
  function handleEndpointSelect(endpoint) {
    selectedEndpoint = endpoint.url;
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

  // Update status history
  function updateEndpointHistory(newResults) {
    // Update on every poll for more immediate feedback

    // Update history for each endpoint
    newResults.forEach(result => {
      const url = result.endpoint.url;
      const status = categorizeStatus(result);

      // Initialize history array if needed
      if (!endpointHistory[url]) {
        // Initialize with 7 "unknown" statuses
        endpointHistory[url] = Array(7).fill("unknown");
      }

      // Shift existing statuses to the right (newest always at index 0)
      const newHistory = [...endpointHistory[url]];
      newHistory.pop(); // Remove the oldest (rightmost) status
      newHistory.unshift(status); // Add new status at the beginning (left)
      endpointHistory[url] = newHistory;
    });

    // Force Svelte to detect the change
    endpointHistory = {...endpointHistory};
  }
</script>

<svelte:head>
  <title>Hydration RPC Monitor</title>
</svelte:head>

<main>
  <header>
    <h1>Hydration RPC Monitor</h1>
    <div class="controls">
      {#if browser}
        <label>
          <input
                  type="checkbox"
                  bind:checked={useBackend}
          />
          Use Backend Data Source
        </label>
      {/if}

      <select bind:value={timeRange}>
        <option value="15m">Last 15 minutes</option>
        <option value="1h">Last hour</option>
        <option value="3h">Last 3 hours</option>
        <option value="12h">Last 12 hours</option>
        <option value="24h">Last 24 hours</option>
      </select>
    </div>
  </header>

  <section class="current-status">
    <h2>RPC Endpoints Status</h2>
    <table>
      <thead>
      <tr>
        <th>Name</th>
        <th>URL</th>
        <th>Block Height</th>
        <th>Response Time</th>
        <th>Status</th>
      </tr>
      </thead>
      <tbody>
      {#each results as result, index (index)}
        <tr
                class={getRowClass(result)}
                on:click={() => handleEndpointSelect(result.endpoint)}
        >
          <td>{result.endpoint.name}</td>
          <td>{result.endpoint.url}</td>
          <td>{result.blockHeight || 'N/A'}</td>
          <td>{result.responseTime.toFixed(2)} ms</td>
          <td class="history-icons">
            {#if endpointHistory[result.endpoint.url]}
              {#each endpointHistory[result.endpoint.url] as status}
                <span class="status-icon {status}" title="{status}"></span>
              {/each}
            {:else}
              <!-- Display 7 unknown status icons if no history yet -->
              {#each Array(7).fill('unknown') as _}
                <span class="status-icon unknown" title="No data yet"></span>
              {/each}
            {/if}
          </td>
        </tr>
      {/each}
      </tbody>
    </table>
  </section>

  {#if selectedEndpoint}
    <section class="historical-data">
      <h2>Historical Latency Data</h2>
      <div class="chart-container">
        <LineChart data={processChartData(historyData)} />
      </div>
    </section>
  {/if}
</main>

<style>
  main {
    font-family: sans-serif;
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .controls {
    display: flex;
    gap: 20px;
    align-items: center;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }

  th, td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
  }

  th {
    background-color: #f2f2f2;
  }

  tr:hover {
    background-color: #f5f5f5;
    cursor: pointer;
  }

  tr.success td {
    background-color: rgba(0, 128, 0, 0.1);
  }

  tr.error td {
    background-color: rgba(255, 0, 0, 0.1);
  }

  tr.warning td {
    background-color: rgba(255, 191, 0, 0.2);
  }

  .chart-container {
    height: 300px;
    width: 100%;
  }

  /* Status history icons styling */
  .history-icons {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .status-icon {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.2);
  }

  .status-icon.success {
    background-color: #2ecc71;
  }

  .status-icon.warning {
    background-color: #f39c12;
  }

  .status-icon.error {
    background-color: #e74c3c;
  }

  .status-icon.unknown {
    background-color: #bdc3c7;
  }
</style>
