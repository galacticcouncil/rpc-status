<script>
  import { rpcStore } from '../stores/rpcStore';
  import { rpcService } from '../services/rpcService';

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
    </ul>
</div>
