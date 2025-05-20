<script lang="ts">
  import { page } from '$app/stores';
  import type { ActionData, PageData } from './$types';

  const { data, form } = $props<{ data: PageData; form: ActionData }>();

  let log = $state<string[]>([]);

  const currentForm = $derived(form);
  const isLimited = $derived(currentForm?.retryAfter && currentForm.retryAfter > 0);
  const statusMessage = $derived(
    isLimited && currentForm?.retryAfter // Ensure currentForm and retryAfter are defined
      ? `You are rate limited, retry in ${currentForm.retryAfter} seconds.`
      : 'OK'
  );

  async function preflight(method: 'POST' | 'GET') {
    const response = await fetch(new URL('/preflight-required', $page.url), {
      method
    });
    const json = await response.json();
    log.push(json.message);
  }
</script>

<h1>Try the rate limiter</h1>

{#if currentForm}
  <h3 class:limited={isLimited}>
    {statusMessage}
  </h3>
{/if}

<form method="POST">
  Current rates:
  <ul>
    <li>IP: {data.rates.IP[0]}/{data.rates.IP[1]}</li>
    <li>IP+UA: {data.rates.IPUA[0]}/{data.rates.IPUA[1]}</li>
  </ul>
  <button>Submit</button>
</form>

<hr />

<button onclick={() => preflight('POST')}>POST to preflight route</button>
<button onclick={() => preflight('GET')}>GET preflight route</button>

<pre>
{#each log as msg}{msg}<br />{/each}
</pre>

<style>
  form {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
      Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue',
      sans-serif;
  }

  h3 {
    padding: 0.5rem;
    color: white;
    background-color: forestgreen;
  }

  hr {
    margin: 2rem 0;
  }

  .limited {
    color: white;
    background-color: brown;
  }
</style>
