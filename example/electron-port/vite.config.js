import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Electron 렌더러: 상대 경로 자산 로딩을 위해 base: "./"
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist" },
  server: { port: 5173 },
});
