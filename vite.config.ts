import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/jnote": "http://127.0.0.1:4000",
      "/health": "http://127.0.0.1:4000",
      "/images": "http://127.0.0.1:4000"
    }
  }
});

