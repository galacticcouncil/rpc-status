// Helper function to parse time range string into milliseconds
export function parseTimeRange(range) {
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

// Format error timestamp
export function formatErrorTime(timestamp) {
  return timestamp.toLocaleString();
}

// Format time for chart labels
export function formatTimeLabel(time) {
  return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Categorize endpoint status
export function categorizeStatus(result) {
  // Import maxBlockHeight from store would create circular dependency
  // Get max block height from all results with success status
  const maxBlockHeight = result.blockHeight ? result.blockHeight : 0;
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
  if (maxBlockHeight > 0 && maxBlockHeight - result.blockHeight > 2) {
    return 'warning';
  }

  // Default to success for any other case
  return 'success';
}

// Process data for TUI chart display
export function processHistoryDataForTuiChart(data) {
  if (!data || data.length === 0) return [];

  // Sort chronologically
  const sortedData = [...data].sort((a, b) => a.time - b.time);

  // If we have lots of data points, reduce them for the chart
  let chartData = sortedData;
  if (sortedData.length > 8) {
    // Take at most 8 data points with even spacing
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

// Calculate max value for chart scaling
export function getMaxLatency(data) {
  if (!data || data.length === 0) return 1000;
  return Math.max(...data.map((d) => d.value), 1000);
}

// Process Prometheus data format to chart format
export function processHistoricalData(latencyResult, statusResult) {
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
      error: status === 0 || status === undefined,
    };
  });
}
