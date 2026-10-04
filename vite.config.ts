import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/assets/dm/**",
        "**/server/campaign-map.json",
      ],
    },
  },
  build: { outDir: "output/web" },
});
