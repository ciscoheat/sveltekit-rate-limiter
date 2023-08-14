<script lang="ts">
  import type { ActionData, PageData } from './$types';

  export let data: PageData;
  export let form: ActionData;
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

  .limited {
    color: white;
    background-color: brown;
  }
</style>
