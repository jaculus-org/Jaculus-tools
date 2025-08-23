import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  test: {
    include: [
      'unit/**/*.test.ts',
      'unit/**/*.spec.ts',
    ],
    globals: true,
    environment: 'node'
  },
  resolve: {
    alias: {
      '@jaculus/util': path.resolve(__dirname, './packages/util/dist'),
      '@jaculus/code': path.resolve(__dirname, './packages/code/dist'),
      '@jaculus/commands': path.resolve(__dirname, './packages/commands/dist'),
      '@jaculus/device': path.resolve(__dirname, './packages/device/dist'),
      '@jaculus/link': path.resolve(__dirname, './packages/link/dist'),
      '@jaculus/package': path.resolve(__dirname, './packages/package/dist'),
    }
  }
});
