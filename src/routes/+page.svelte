<script>
  import {onMount, onDestroy} from 'svelte';
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

  // State variables
  let results = [];
  let historyData = [];
  let selectedEndpoint = null;
  let selectedEndpointName = null;
  let timeRange = '1h';
  let useBackend = false;
  let monitor;
  let intervalId;
  let endpointHistory = {};
  let localHistoryData = {};
  let pollCount = 0;
  let showChart = false;
  let showSettings = false;
  let currentTime = new Date(); // For time display

  // Initialize browser monitor
  function initMonitor() {
    if (!browser || !PolkadotRpcMonitor) return;

    monitor = new PolkadotRpcMonitor();

    monitor.setUpdateCallback(newResults => {
      results = newResults;
      updateEndpointHistory(newResults);
      updateTime(); // Update time on data refresh
    });

    // Start monitoring based on initial useBackend setting
    if (useBackend) {
      fetchResultsFromBackend();
      startBackendPolling();
    } else {
      monitor.start(CHECK_INTERVAL);
    }
  }

  // Update current time
  function updateTime() {
    currentTime = new Date();
  }

  onMount(() => {
    if (browser) {
      fetchResultsFromBackend();

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

    // Refresh chart data if chart is visible
    if (showChart && selectedEndpoint) {
      fetchHistoricalData(selectedEndpoint, timeRange);
    }
  }

  // Fetch historical data when endpoint or time range changes
  $: if (browser && selectedEndpoint && showChart) {
    fetchHistoricalData(selectedEndpoint, timeRange);
  }

  // Toggle settings menu
  function toggleSettings() {
    showSettings = !showSettings;
  }

  // Select a time range and close menu
  function selectTimeRange(range) {
    timeRange = range;
    showSettings = false;

    if (showChart && selectedEndpoint) {
      fetchHistoricalData(selectedEndpoint, timeRange);
    }
  }

  // Toggle backend use and close menu
  function toggleBackend() {
    useBackend = !useBackend;
    showSettings = false;
  }

  // Fetch results from backend
  async function fetchResultsFromBackend() {
    if (!browser) return;

    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      results = data;
      updateEndpointHistory(data);
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
      // Use local history data when not using backend
      if (localHistoryData[endpoint]) {
        // Filter data based on time range
        const now = new Date();
        const rangeInMs = parseTimeRange(range);
        const filteredData = localHistoryData[endpoint].filter(d =>
          (now - d.time) <= rangeInMs
        );

        historyData = filteredData;
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
    return time.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  }

  // Calculate max value for chart scaling
  function getMaxLatency(data) {
    if (!data || data.length === 0) return 1000;
    return Math.max(...data.map(d => d.value), 1000);
  }

  // Handle endpoint selection for chart modal
  function handleEndpointSelect(endpoint) {
    selectedEndpoint = endpoint.url;
    selectedEndpointName = endpoint.name;
    showChart = true;

    if (browser) {
      // Open the modal
      document.getElementById('chart-modal').style.display = 'block';

      // Fetch data
      fetchHistoricalData(endpoint.url, timeRange);
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

      // Update local history data for charts
      if (!localHistoryData[url]) {
        localHistoryData[url] = [];
      }

      // Add new data point with current timestamp
      localHistoryData[url].push({
        time: new Date(),
        value: result.responseTime,
        error: result.status !== 'success' || result.timeout
      });

      // Limit local history size (keep ~24 hours at 10s intervals = ~8640 points)
      const maxPoints = 8640;
      if (localHistoryData[url].length > maxPoints) {
        localHistoryData[url] = localHistoryData[url].slice(-maxPoints);
      }
    });

    // Force Svelte to detect the change
    endpointHistory = {...endpointHistory};

    // Refresh chart data if we're currently viewing a chart
    if (showChart && selectedEndpoint) {
      fetchHistoricalData(selectedEndpoint, timeRange);
    }
  }
</script>

<svelte:head>
    <title>Hydration RPC Status</title>
</svelte:head>


<nav class="tui-nav">
    <div class="tui-panel-header tui-bg-blue tui-fg-white">Hydration RPC Status</div>
    <ul>
        <li class="tui-dropdown">
            <span>Data Source</span>
            <div class="tui-dropdown-content">
                <ul>
                    <li>
                        <span on:click={toggleBackend}>
                          {useBackend ? '[x] Remote' : '[ ] Remote'}
                        </span>
                    </li>
                    <div class="tui-black-divider"></div>
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
                        <th class="url-column">URL</th>
                        <th>Block</th>
                        <th>Latency</th>
                        <th>Status</th>
                    </tr>
                    </thead>
                    <tbody>
                    {#each results as result, index (index)}
                        <tr
                                on:click={() => handleEndpointSelect(result.endpoint)}
                                style="cursor: pointer;"
                        >
                            <td>{result.endpoint.name}</td>
                            <td class="url-column">{result.endpoint.url}</td>
                            <td>{result.blockHeight || 'N/A'}</td>
                            <td>{result.responseTime.toFixed(2)} ms</td>
                            <td width="80px">
                                <div style="display: flex; align-items: center;">
                                    {#if endpointHistory[result.endpoint.url]}
                                        {#each endpointHistory[result.endpoint.url] as status}
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
            <li>
                <span>Data source: {useBackend ? 'Remote' : 'Local'}</span>
            </li>
            <span class="tui-statusbar-divider"></span>
            <li>
                <span>Time range: {timeRange}</span>
            </li>
        </ul>
    </div>

    <!-- Chart Modal window -->
    <div id="chart-modal" class="tui-modal">
        <div class="tui-window modal-centered cyan-168" style="width: 80%; max-width: 900px; height: auto; max-height: 80%;">
            <fieldset class="tui-fieldset">
                <legend class="">{selectedEndpointName}</legend>
                <button on:click={closeChartModal} class="tui-fieldset-button right"><span>■</span></button>

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
                                <div class="tui-chart-legend">{Math.round(maxLatency)} ms</div>
                                <div class="tui-chart-legend">{Math.round(maxLatency * 0.75)} ms</div>
                                <div class="tui-chart-legend">{Math.round(maxLatency * 0.5)} ms</div>
                                <div class="tui-chart-legend">{Math.round(maxLatency * 0.25)} ms</div>
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
    /* Custom TUI Menu styles */
    .tui-menu-btn {
        cursor: pointer;
        padding: 0 10px;
    }

    .tui-menu-active {
        background-color: var(--tui-bg-highlighted);
    }

    /* Hide URL column on narrow screens */
    @media (max-width: 1000px) {
        .url-column {
            display: none;
        }
    }
</style>
