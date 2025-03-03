<script>
  import { rpcStore, currentErrors } from '../../stores/rpcStore';
  import { rpcService } from '../../services/rpcService';
  import LatencyChart from './LatencyChart.svelte';
  import ErrorsList from './ErrorsList.svelte';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  // When the chart is shown, fetch the data
  $: if (browser && $rpcStore.showChart && $rpcStore.selectedEndpoint) {
    rpcService.fetchHistoricalData($rpcStore.selectedEndpoint, $rpcStore.timeRange);
  }

  // Close the chart modal
  function closeChartModal() {
    if (browser) {
      document.getElementById('chart-modal').style.display = 'none';
    }
  }

  // Toggle between chart and errors view
  function toggleErrorsView() {
    rpcStore.toggleErrors();
  }
</script>

<!-- Chart Modal window -->
<div id="chart-modal" class="tui-modal">
  <div
    class="tui-window modal-centered cyan-168"
    style="width: 80%; max-width: 900px; height: auto; max-height: 80%;"
  >
    <fieldset class="tui-fieldset">
      <legend class="">{$rpcStore.selectedEndpointName}</legend>
      <legend class="tui-fieldset-text left"
        >{$rpcStore.selectedEndpoint
          ? $rpcStore.selectedEndpoint.replace('https://', '')
          : ''}</legend
      >
      <button on:click={closeChartModal} class="tui-fieldset-button right"><span>■</span></button>

      <!--            &lt;!&ndash; Tab buttons &ndash;&gt;-->
      <!--            <div class="tui-tabs">-->
      <!--                <ul>-->
      <!--                    <li><a class="tui-tab" class:tui-tab-active={!$rpcStore.showErrors} on:click={() => rpcStore.toggleErrors()}>Chart</a></li>-->
      <!--                    <li><a class="tui-tab" class:tui-tab-active={$rpcStore.showErrors} on:click={() => rpcStore.toggleErrors()}>Errors ({$currentErrors.length})</a></li>-->
      <!--                </ul>-->
      <!--            </div>-->

      {#if !$rpcStore.showErrors}
        <!-- Chart view -->
        <LatencyChart historyData={$rpcStore.historyData} />
      {:else}
        <!-- Errors view -->
        <ErrorsList errors={$currentErrors} />
      {/if}

      <!-- Stats row with uptime and avg response time -->
      <div class="stats">
        <div class="stat-item">
          <span class="stat-label">Avg Response:</span>
          <span class="stat-value">
            {#if $rpcStore.historyData.filter((d) => !d.error).length > 0}
              {(
                $rpcStore.historyData.filter((d) => !d.error).reduce((sum, d) => sum + d.value, 0) /
                $rpcStore.historyData.filter((d) => !d.error).length
              ).toFixed(2)}
              ms
            {:else}
              ?
            {/if}
          </span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Uptime:</span>
          <span class="stat-value">
            {#if $rpcStore.historyData.length > 0}
              {(
                100 -
                ($rpcStore.historyData.filter((d) => d.error).length /
                  $rpcStore.historyData.length) *
                  100
              ).toFixed(2)}
              %
            {:else}
              ?
            {/if}
          </span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Requests:</span>
          <span class="stat-value">
            {#if $rpcStore.historyData.length > 0}
              {$rpcStore.historyData.length}
            {:else}
              ?
            {/if}
          </span>
          <span class="stat-label">Errors:</span>
          <span class="stat-value">
            {#if $rpcStore.historyData.length > 0}
              {$rpcStore.historyData.filter((d) => d.error).length}
            {:else}
              ?
            {/if}
          </span>
        </div>
      </div>
    </fieldset>
  </div>
</div>

<style>
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
    background-color: var(--tui-bg-highlighted);
  }

  /* Stats row */
  .stats-row {
    display: flex;
    justify-content: space-between;
    margin-top: 10px;
    margin-bottom: 10px;
  }

  .stat-item {
    display: flex;
    align-items: center;
  }

  .stat-label {
    margin-right: 5px;
  }

  .stat-value {
    margin-right: 15px;
    font-weight: bold;
  }

  .stats {
    margin-bottom: 15px;
  }
</style>
