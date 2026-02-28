import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const configuredPort = Number(env.PORT || 3000);
  const fallbackPort = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 3000;
  const serverUrl = env.VITE_SERVER_URL || `http://localhost:${fallbackPort}`;

  return {
    root: __dirname,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: serverUrl,
          changeOrigin: true,
        },
        "/socket.io": {
          target: serverUrl,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("recharts")) return "vendor-charts";
            if (id.includes("date-fns")) return "vendor-date";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("socket.io-client")) return "vendor-socket";
            if (id.includes("motion")) return "vendor-motion";
            return "vendor";
          },
        },
      },
    },
  };
});
