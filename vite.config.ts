import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/auth": "http://127.0.0.1:4000",
      "/jnote": "http://127.0.0.1:4000",
      "/health": "http://127.0.0.1:4000",
      "/images": "http://127.0.0.1:4000"
    }
  }
});
