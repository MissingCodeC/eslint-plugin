import { defineConfig } from 'tsdown'

export default defineConfig({
  entry    : [
    './src/index.ts',
  ],
  external : [/@typescript-eslint\/.*/],
  shims    : true,
  format   : ['esm'],
  platform : 'node',
  target   : 'ESNext',
})
