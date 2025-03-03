<script>
  export let endpoint;
  export let method;
  export let history = {};

  // Default to array of unknowns if no history exists
  $: statusHistory = history[method] && history[method][endpoint]
    ? history[method][endpoint]
    : Array(7).fill('unknown');
</script>

<div style="display: flex; align-items: center;">
    {#each statusHistory as status}
        <span class={`status-icon ${status}`} title={status}></span>
    {/each}
</div>

<style>
    /* Status indicators */
    .status-icon {
        display: inline-block;
        width: 8px;
        height: 14px;
        margin-right: 3px;
    }
</style>
