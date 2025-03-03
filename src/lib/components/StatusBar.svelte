<script>
  import { rpcStore } from '../stores/rpcStore';
  import { rpcService } from '../services/rpcService';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

  // Function to toggle between time range values
  function toggleRange() {
    if ($rpcStore.timeRange === '15m') return updateTimeRange('1h');
    if ($rpcStore.timeRange === '1h') return updateTimeRange('3h');
    if ($rpcStore.timeRange === '3h') return updateTimeRange('12h');
    if ($rpcStore.timeRange === '12h') return updateTimeRange('24h');
    if ($rpcStore.timeRange === '24h') return updateTimeRange('15m');
  }

  // Function to update time range and refresh data if needed
  function updateTimeRange(range) {
    rpcStore.setTimeRange(range);

    if ($rpcStore.showChart && $rpcStore.selectedEndpoint) {
      rpcService.fetchHistoricalData($rpcStore.selectedEndpoint, range);
    }

    rpcService.calculateEndpointMetrics();
  }

  // Toggle local/remote data source
  function toggleBackend() {
    rpcService.toggleDataSource();
  }

  // Countdown logic
  let countdown = 0;
  let remainingMs = 0;
  let countdownInterval;

  function updateCountdown() {
    if (!browser) return;

    const now = new Date();
    const lastRefresh = $rpcStore.lastRefreshTime;
    const frequency = $rpcStore.useBackend ? 5 : $rpcStore.refreshFrequency;

    // Calculate elapsed time and countdown with 0.1 second precision
    const elapsedMs = now - lastRefresh;
    remainingMs = Math.max(0, (frequency * 1000) - elapsedMs);
    countdown = (remainingMs / 1000).toFixed(1); // Format with one decimal place
  }

  onMount(() => {
    if (browser) {
      // Update immediately
      updateCountdown();

      // Set interval to update every 100ms for tenths of a second precision
      countdownInterval = setInterval(updateCountdown, 100);
    }
  });

  onDestroy(() => {
    if (browser && countdownInterval) {
      clearInterval(countdownInterval);
    }
  });
</script>

<div class="tui-statusbar">
  <ul>
    <li on:click={toggleBackend}>
      <span>{$rpcStore.useBackend ? 'Remote' : 'Local'}</span>
    </li>
    <span class="tui-statusbar-divider"></span>
    <li on:click={toggleRange}>
      <span>{$rpcStore.timeRange}</span>
    </li>
    <span class="tui-statusbar-divider"></span>
    <li>
      <span>{$rpcStore.selectedMethod}</span>
    </li>
    <span class="tui-statusbar-divider"></span>
    <li>
      {#if remainingMs === 0}
        <span>Checking...</span>
      {:else}
        <span>Check in {countdown}s</span>
      {/if}
    </li>
  </ul>
</div>
