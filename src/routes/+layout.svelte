<script>
  import { browser } from '$app/environment';
  
  // Add any global data or context here
  export let data;
</script>

<div class="app">
  <slot />
</div>

<!-- This embeds the CSS as server-rendered as well -->
<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    background-color: #f9f9f9;
  }
  
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
</style>
