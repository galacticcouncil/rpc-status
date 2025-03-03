<script>
  import { processHistoryDataForTuiChart, getMaxLatency, formatTimeLabel } from '../../utils/helpers';

  // Chart data
  export let historyData = [];

  // Processed data for TUI chart
  $: chartData = processHistoryDataForTuiChart(historyData);

  // Max latency for scaling the chart
  $: maxLatency = getMaxLatency(chartData);
</script>

<div style="margin-bottom: 25px;">
    {#if chartData.length > 0}
        <!-- TUI Vertical Chart -->
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
