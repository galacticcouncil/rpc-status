<script>
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { rpcService } from '$lib/services/rpcService';

  // Import components
  import NavBar from '$lib/components/NavBar.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import RpcTable from '$lib/components/RpcTable.svelte';
  import ChartModal from '$lib/components/chart/ChartModal.svelte';

  // Initialize monitor on mount
  onMount(async () => {
    if (browser) {
      await rpcService.initMonitor();

      // Set up window event listener to save data before the page unloads
      window.addEventListener('beforeunload', () => {
        rpcService.saveLocalData();
      });
    }
  });

  // Clean up on component destroy
  onDestroy(() => {
    if (browser) {
      rpcService.cleanup();
    }
  });
</script>

<svelte:head>
  <title>Hydration RPC Status</title>
</svelte:head>

<NavBar />

<main class="tui-bg-blue-black">
  <!-- RPC status table -->
  <RpcTable />

  <!-- Chart Modal -->
  <ChartModal />

  <!-- Status bar -->
  <StatusBar />
</main>

<style>
  main {
    height: 100vh;
    padding: 20px;
    overflow: auto;
  }
</style>
