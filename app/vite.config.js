import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [cloudflare()],
	server: { port: 5175 }, // 5173 PopChoice, 5174 Travel Agent
});
