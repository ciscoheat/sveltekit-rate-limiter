export type HashFunction = (input: string) => string | Promise<string>;

export let defaultHashFunction: HashFunction;

if (globalThis?.crypto?.subtle) {
  defaultHashFunction = subtleSha256;
}

async function subtleSha256(str: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(str)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
