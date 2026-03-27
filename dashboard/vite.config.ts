import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    base: "/dashboard/",
    server: {
        proxy: {
            "/api": "http://localhost:8766",
        },
    },
    build: {
        outDir: "dist",
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes("node_modules/recharts")) return "recharts";
                    if (id.includes("node_modules/motion")) return "motion";
                    if (id.includes("node_modules/react-aria")) return "react-aria";
                },
            },
        },
    },
});
