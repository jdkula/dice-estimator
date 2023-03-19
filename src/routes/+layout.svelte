<script lang="ts">
  import { version } from '$app/environment';
  import { onMount } from 'svelte';
  import '../app.css';

  onMount(async () => {
    if ('serviceWorker' in navigator && version !== localStorage.getItem('__version')) {
      localStorage.setItem('__version', version);
      const current = await navigator.serviceWorker.ready;
      await current?.update();
    }
  });
</script>

<main class="w-full mx-auto xl:max-w-6xl lg:max-w-4xl md:max-w-2xl max-w-md md:p-0 px-4 mt-8">
  <slot />
</main>
