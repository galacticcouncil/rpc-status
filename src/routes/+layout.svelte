<script>
  import { browser } from '$app/environment';
  import '../app.css';

  // Add any global data or context here
  export let data;
</script>

<div class="tui-screen">
  <slot />
</div>
