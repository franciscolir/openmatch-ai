import { cp, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const wasmRoot = resolve("node_modules/@mediapipe/tasks-vision/wasm");
const modelsRoot = resolve("src/models");

const VIRTUAL_PREFIX = "\0wasm:";

function serveStaticAssets() {
  return {
    name: "serve-static-assets",
    resolveId(id) {
      if (id.startsWith("/wasm/")) {
        return VIRTUAL_PREFIX + id.replace("/wasm/", "");
      }
      if (id.startsWith("/models/")) {
        return "\0model:" + id.replace("/models/", "");
      }
    },
    async load(id) {
      if (id.startsWith(VIRTUAL_PREFIX)) {
        const filename = id.slice(VIRTUAL_PREFIX.length);
        const filePath = resolve(wasmRoot, filename);
        let content = await readFile(filePath, "utf-8");
        content = "var custom_dbg = function(){};\n" + content;
        content += '\nglobalThis.ModuleFactory = typeof ModuleFactory !== "undefined" ? ModuleFactory : void 0;';
        return content;
      }
      if (id.startsWith("\0model:")) {
        const filename = id.slice("\0model:".length);
        const filePath = resolve(modelsRoot, filename);
        const content = await readFile(filePath);
        return `export default ${JSON.stringify(content.toString("base64"))}`;
      }
    },
    configureServer(server) {
      server.middlewares.use("/wasm", async (req, res, next) => {
        const filename = req.url.split("?")[0].replace(/^\//, "");
        if (filename.endsWith(".js")) { next(); return; }
        const filePath = resolve(wasmRoot, filename);
        try {
          const content = await readFile(filePath);
          res.setHeader("Content-Type", "application/wasm");
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
