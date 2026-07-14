import { cp, mkdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { defineConfig } from "vite";

const MIME_TYPES = {
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".tflite": "application/octet-stream",
  ".task": "application/octet-stream"
};

const wasmRoot = resolve("node_modules/@mediapipe/tasks-vision/wasm");
const modelsRoot = resolve("src/models");

function serveStaticAssets() {
  return {
    name: "serve-static-assets",
    configureServer(server) {
      server.middlewares.use("/wasm", async (req, res, next) => {
        const filename = req.url.split("?")[0].replace(/^\//, "");
        const filePath = resolve(wasmRoot, filename);
        const ext = extname(filePath);
        try {
          const content = await readFile(filePath);
          res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
          res.statusCode = 200;
          res.end(content);
        } catch {
          next();
        }
      });
      server.middlewares.use("/models", async (req, res, next) => {
        const filename = req.url.split("?")[0].replace(/^\//, "");
        const filePath = resolve(modelsRoot, filename);
        try {
          const content = await readFile(filePath);
          res.setHeader("Content-Type", "application/octet-stream");
          res.statusCode = 200;
          res.end(content);
        } catch {
          next();
        }
      });
    },
    async closeBundle() {
      for (const [source, destination] of [["src/models", "models"], [wasmRoot, "wasm"]]) {
        const target = resolve("dist", destination);
        await mkdir(dirname(target), { recursive: true });
        await cp(resolve(source), target, { recursive: true });
      }
      await cp(resolve("service-worker.js"), resolve("dist/service-worker.js"));
    }
  };
}

export default defineConfig({
  plugins: [serveStaticAssets()]
});
