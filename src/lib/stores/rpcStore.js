import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { parseTimeRange } from '../utils/helpers';

// Initial state
const initialState = {
  results: [],
  historyData: [],
  selectedEndpoint: null,
  selectedEndpointName: null,
  timeRange: '1h',
  useBackend: false,
  selectedMethod: 'chain_getBlock',
  endpointHistory: {},
  endpointErrors: {},
  localHistoryData: {},
  showChart: false,
  showErrors: false,
  currentTime: new Date(),
  endpointMetrics: {}
};

// Create the store
function createRpcStore() {
  const { subscribe, set, update } = writable(initialState);

  return {
    subscribe,
    setResults: (results) => update(state => ({ ...state, results })),
    setHistoryData: (historyData) => update(state => ({ ...state, historyData })),
    setLocalHistoryData: (localHistoryData) => update(state => ({ ...state, localHistoryData })),
    setEndpointHistory: (endpointHistory) => update(state => ({ ...state, endpointHistory })),
    setEndpointErrors: (endpointErrors) => update(state => ({ ...state, endpointErrors })),
    setTimeRange: (timeRange) => update(state => ({ ...state, timeRange })),
    selectEndpoint: (endpoint, name) => update(state => ({
      ...state,
      selectedEndpoint: endpoint,
      selectedEndpointName: name,
      showChart: true,
      showErrors: false
    })),
    setTimeRange: (timeRange) => update(state => ({ ...state, timeRange })),
    toggleBackend: () => update(state => ({ ...state, useBackend: !state.useBackend })),
    setMethod: (method) => update(state => ({ ...state, selectedMethod: method })),
    updateEndpointHistory: (method, endpoint, status) => update(state => {
      // Get existing history for this method/endpoint or initialize with unknowns
      const methodHistory = state.endpointHistory[method] || {};
      const history = methodHistory[endpoint] || Array(7).fill("unknown");

      // Create a new history array with the status added
      const newHistory = [...history];
      newHistory.shift(); // Remove oldest (first) item
      newHistory.push(status); // Add new status at the end

      // Update the state
      return {
        ...state,
        endpointHistory: {
          ...state.endpointHistory,
          [method]: {
            ...(state.endpointHistory[method] || {}),
            [endpoint]: newHistory
          }
        }
      };
    }),
    updateLocalHistory: (method, endpoint, dataPoint) => update(state => {
      // Initialize if not exist
      const methodHistory = state.localHistoryData[method] || {};
      const currentData = methodHistory[endpoint] || [];

      // Add new data point
      const newData = [...currentData, dataPoint];

      // Limit history size (keep ~24 hours at 10s intervals = ~8640 points)
      const limitedData = newData.length > 8640 ? newData.slice(-8640) : newData;

      return {
        ...state,
        localHistoryData: {
          ...state.localHistoryData,
          [method]: {
            ...(state.localHistoryData[method] || {}),
            [endpoint]: limitedData
          }
        }
      };
    }),
    updateEndpointError: (method, endpoint, error) => update(state => {
      // Initialize if not exist
      const methodErrors = state.endpointErrors[method] || {};
      const currentErrors = methodErrors[endpoint] || [];

      // Add new error
      const newErrors = [...currentErrors, error];

      // Limit to max 500 errors
      const limitedErrors = newErrors.length > 500 ? newErrors.slice(-500) : newErrors;

      return {
        ...state,
        endpointErrors: {
          ...state.endpointErrors,
          [method]: {
            ...(state.endpointErrors[method] || {}),
            [endpoint]: limitedErrors
          }
        }
      };
    }),
    updateTime: () => update(state => ({ ...state, currentTime: new Date() })),
    updateEndpointMetrics: (metrics) => update(state => ({ ...state, endpointMetrics: metrics })),
    toggleErrors: () => update(state => ({ ...state, showErrors: !state.showErrors })),
    closeChart: () => update(state => ({ ...state, showChart: false })),
    clearLocalData: () => update(state => ({
      ...state,
      localHistoryData: { [state.selectedMethod]: {} },
      endpointHistory: { [state.selectedMethod]: {} },
      endpointErrors: { [state.selectedMethod]: {} },
      endpointMetrics: {}
    }))
  };
}

export const rpcStore = createRpcStore();

// Derived stores
export const sortedResults = derived(rpcStore, ($store) => {
  return [...$store.results].sort((a, b) => {
    const aMetrics = $store.endpointMetrics[a.endpoint.url];
    const bMetrics = $store.endpointMetrics[b.endpoint.url];

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
});

export const maxBlockHeight = derived(rpcStore, ($store) => {
  return $store.results.length > 0
    ? Math.max(
      ...$store.results
        .filter(result => result.status === 'success' && result.blockHeight !== undefined)
        .map(result => result.blockHeight),
      0
    )
    : 0;
});

export const currentErrors = derived(rpcStore, ($store) => {
  if (!$store.selectedEndpoint || !$store.endpointErrors[$store.selectedMethod]) {
    return [];
  }

  const errors = $store.endpointErrors[$store.selectedMethod][$store.selectedEndpoint] || [];

  // Filter by time range if needed
  if ($store.timeRange) {
    const now = new Date().getTime();
    const timeWindow = parseTimeRange($store.timeRange);

    return errors
      .filter(error => (now - error.timestamp.getTime()) <= timeWindow)
      .sort((a, b) => b.timestamp - a.timestamp); // Newest first
  }

  return [...errors].sort((a, b) => b.timestamp - a.timestamp);
});
