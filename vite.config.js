import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const staticAssets = [
  ["src/models", "models"],
  ["node_modules/@mediapipe/tasks-vision/wasm", "wasm"]
];

function copyVisionAssets() {
  return {
    name: "copy-vision-assets",
    async closeBundle() {
      for (const [source, destination] of staticAssets) {
        const target = resolve("dist", destination);
        await mkdir(dirname(target), { recursive: true });
        await cp(resolve(source), target, { recursive: true });
      }
      await cp(resolve("service-worker.js"), resolve("dist/service-worker.js"));
    }
  };
}

export default defineConfig({
  plugins: [copyVisionAssets()]
});
