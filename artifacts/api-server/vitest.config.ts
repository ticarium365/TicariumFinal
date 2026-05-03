import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  plugins: [],
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
  resolve: {
    alias: [
      {
        find: /^(.+)\.js$/,
        replacement: '$1',
      },
      {
        find: '@workspace/db',
        replacement: path.resolve(__dirname, '../../lib/db/src/index.ts'),
      },
    ],
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
})
