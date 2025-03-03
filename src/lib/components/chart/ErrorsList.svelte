<script>
  import { formatErrorTime } from '../../utils/helpers';

  // List of errors
  export let errors = [];
</script>

<div class="errors-container">
    {#if errors.length > 0}
        <div class="tui-table-container" style="height: 350px; overflow-y: auto;">
            <table class="tui-table">
                <thead>
                <tr>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Response</th>
                    <th>Error</th>
                </tr>
                </thead>
                <tbody>
                {#each errors as error}
                    <tr class={error.errorType}>
                        <td>{formatErrorTime(error.timestamp)}</td>
                        <td>{error.errorType}</td>
                        <td>{error.responseTime.toFixed(0)} ms</td>
                        <td>{error.message}</td>
                    </tr>
                {/each}
                </tbody>
            </table>
        </div>
    {:else}
        <div class="tui-panel" style="height: 350px;">
            <div class="tui-panel-content"
                 style="display: flex; justify-content: center; align-items: center; height: 100%;">
                <p>No errors recorded for this endpoint in the selected time range.</p>
            </div>
        </div>
    {/if}
</div>

<style>
    .errors-container {
        margin-bottom: 25px;
    }

    /* Status styles */
    .timeout {
        color: var(--timeout-color);
    }

    .error {
        color: var(--error-color);
    }
</style>
