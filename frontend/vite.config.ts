import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  // `vite preview` serves the built app in-cluster behind the ingress.
  // Vite blocks requests whose Host header isn't allow-listed, which rejects
  // the ingress hostname (e.g. the nip.io host). Allow all hosts for the POC;
  // tighten to an explicit list (e.g. ['vms.example.gov']) for production.
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
