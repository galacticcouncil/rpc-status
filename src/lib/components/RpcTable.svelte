<script>
  import { browser } from '$app/environment';
  import { rpcStore, sortedResults } from '../stores/rpcStore';
  import StatusIndicator from './StatusIndicator.svelte';

  // Handle endpoint selection for chart modal
  function handleEndpointSelect(endpoint) {
    rpcStore.selectEndpoint(endpoint.url, endpoint.name);

    if (browser) {
      // Open the chart modal
      document.getElementById('chart-modal').style.display = 'block';
    }
  }
</script>

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
                    {#if !$rpcStore.useBackend}
                        <th class="metrics-column">Average</th>
                        <th class="metrics-column">Uptime</th>
                    {/if}
                    <th>Status</th>
                </tr>
                </thead>
                <tbody>
                {#each $rpcStore.useBackend ? $rpcStore.results : $sortedResults as result, index (result.endpoint.url)}
                    <tr
                            on:click={() => handleEndpointSelect(result.endpoint)}
                            style="cursor: pointer;"
                    >
                        <td>{result.endpoint.name}</td>
                        <td class="loc-column">{result.endpoint.location}</td>
                        <td class="url-column">{result.endpoint.url}</td>
                        <td>{result.blockHeight || '?'}</td>
                        <td>{result.responseTime.toFixed(0)} ms</td>
                        {#if !$rpcStore.useBackend}
                            <td class="metrics-column">
                                {#if $rpcStore.endpointMetrics[result.endpoint.url]?.avgLatency !== undefined && $rpcStore.endpointMetrics[result.endpoint.url]?.avgLatency !== Infinity}
                                    {$rpcStore.endpointMetrics[result.endpoint.url].avgLatency.toFixed(0)} ms
                                {:else}
                                    ?
                                {/if}
                            </td>
                            <td class="metrics-column">
                                {#if $rpcStore.endpointMetrics[result.endpoint.url]?.uptime !== undefined}
                                    {$rpcStore.endpointMetrics[result.endpoint.url].uptime.toFixed(1)}%
                                {:else}
                                    ?
                                {/if}
                            </td>
                        {/if}
                        <td width="80px">
                            <StatusIndicator
                                    endpoint={result.endpoint.url}
                                    method={$rpcStore.selectedMethod}
                                    history={$rpcStore.endpointHistory}
                            />
                        </td>
                    </tr>
                {/each}
                </tbody>
            </table>
        </div>
    </div>
</div>

<style>
    /* Make table more readable */
    .tui-table {
        width: 100%;
    }

    .tui-table tr:hover {
        background-color: var(--tui-bg-highlighted);
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
