import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { fileParallelism: false, testTimeout: 60000, env: { LAUNCH_DATE: '2026-11-20' } } });
