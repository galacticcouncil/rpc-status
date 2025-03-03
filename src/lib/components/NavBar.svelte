<script>
  import { rpcService } from '../services/rpcService';
  import { rpcStore } from '../stores/rpcStore';

  // Available RPC methods
  const rpcMethods = [
    { id: 'chain_getBlock', name: 'chain_getBlock', description: 'Get latest block' },
    {
      id: 'eth_blockNumber',
      name: 'eth_blockNumber',
      description: 'Get latest block number through EVM',
    },
    {
      id: 'chain_getFinalizedHead',
      name: 'chain_getFinalizedHead',
      description: 'Get finalized head',
    },
    { id: 'system_syncState', name: 'system_syncState', description: 'Check sync state' },
  ];

  function handleChangeMethod(method) {
    rpcService.changeMethod(method);
  }

  function handleToggleBackend() {
    rpcService.toggleDataSource();
  }

  function handleTimeRangeSelect(range) {
    rpcStore.setTimeRange(range);

    // Refresh chart data if showing a chart
    if ($rpcStore.showChart && $rpcStore.selectedEndpoint) {
      rpcService.fetchHistoricalData($rpcStore.selectedEndpoint, range);
    }

    // Recalculate metrics for new time range
    rpcService.calculateEndpointMetrics();
  }

  // Export/Import handling
  function handleExportData() {
    rpcService.exportLocalData();
  }

  function handleImportData() {
    rpcService.importLocalData();
  }

  function handleClearData() {
    rpcStore.clearLocalData();
  }
</script>

<nav class="tui-nav">
  <div class="tui-panel-header tui-bg-blue tui-fg-white">Hydration RPC Status</div>
  <ul>
    <li class="tui-dropdown">
      <span>Data</span>
      <div class="tui-dropdown-content">
        <ul>
          <li>
            <span on:click={handleToggleBackend}>
              {$rpcStore.useBackend ? 'Use Local' : 'Use Remote'}
            </span>
          </li>
          <div class="tui-black-divider"></div>
          <li>
            <span on:click={handleExportData}> Export Data </span>
          </li>
          <li>
            <span on:click={handleImportData}> Import Data </span>
          </li>
          <li>
            <span on:click={handleClearData}> Clear Local </span>
          </li>
        </ul>
      </div>
    </li>
    <li class="tui-dropdown">
      <span>Time range</span>
      <div class="tui-dropdown-content">
        <ul>
          <li>
            <span
              class="tui-menu-item"
              class:tui-menu-active={$rpcStore.timeRange === '15m'}
              on:click={() => handleTimeRangeSelect('15m')}
            >
              Last 15 min
            </span>
          </li>
          <li>
            <span
              class="tui-menu-item"
              class:tui-menu-active={$rpcStore.timeRange === '1h'}
              on:click={() => handleTimeRangeSelect('1h')}
            >
              Last hour
            </span>
          </li>
          <li>
            <span
              class="tui-menu-item"
              class:tui-menu-active={$rpcStore.timeRange === '3h'}
              on:click={() => handleTimeRangeSelect('3h')}
            >
              Last 3 hours
            </span>
          </li>
          <li>
            <span
              class="tui-menu-item"
              class:tui-menu-active={$rpcStore.timeRange === '12h'}
              on:click={() => handleTimeRangeSelect('12h')}
            >
              Last 12 hours
            </span>
          </li>
          <li>
            <span
              class="tui-menu-item"
              class:tui-menu-active={$rpcStore.timeRange === '24h'}
              on:click={() => handleTimeRangeSelect('24h')}
            >
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
              <span
                class="tui-menu-item"
                class:tui-menu-active={$rpcStore.selectedMethod === method.id}
                on:click={() => handleChangeMethod(method.id)}
              >
                {method.name}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    </li>
    <span class="tui-datetime" data-format="h:m:s a"
      >{$rpcStore.currentTime.toLocaleTimeString()}</span
    >
  </ul>
</nav>
