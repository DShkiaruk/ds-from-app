import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './': the built prototype (dist/) is served by tools/parity.mjs from any path
export default defineConfig({ plugins: [react()], base: './' });
