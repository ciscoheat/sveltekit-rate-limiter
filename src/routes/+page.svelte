<script lang="ts">
  import { page } from '$app/stores';
  import type { ActionData, PageData } from './$types';

  export let data: PageData;
  export let form: ActionData;

  let log: string[] = [];

  async function preflight(method: 'POST' | 'GET') {
    const response = await fetch(new URL('/preflight-required', $page.url), {
      method
    });
    const json = await response.json();
    log = [...log, json.message];
  }
</script>

<h1>Try the rate limiter</h1>

{#if form}
  <h3 class:limited={form.retryAfter}>
    {form.retryAfter
      ? `You are rate limited, retry in ${form.retryAfter} seconds.`
      : 'OK'}
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

<button on:click={() => preflight('POST')}>POST to preflight route</button>
<button on:click={() => preflight('GET')}>GET preflight route</button>

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
