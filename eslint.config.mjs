import eslint from '@eslint/js';
import { loadConfig } from '@sveltejs/load-config';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

const svelteConfigResult = await loadConfig('vite.config.ts');
const svelteConfig =
  svelteConfigResult && 'config' in svelteConfigResult
    ? svelteConfigResult.config
    : {};

export default [
  {
    ignores: [
      '.DS_Store',
      'node_modules/',
      'build/',
      '.svelte-kit/',
      'package/',
      '.env',
      '.env.*',
      '!.env.example'
    ]
  },
  ...(Array.isArray(eslint.configs.recommended)
    ? eslint.configs.recommended
    : [eslint.configs.recommended]),
  ...typescript.configs['flat/recommended'],
  ...svelte.configs['flat/recommended'],
  ...svelte.configs['flat/prettier'],
  prettier,
  {
    files: ['**/*.{js,cjs,mjs,ts,mts,cts}'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      '@typescript-eslint': typescript
    }
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      },
      parserOptions: {
        parser: typescriptParser,
        svelteConfig
      }
    }
  }
];
