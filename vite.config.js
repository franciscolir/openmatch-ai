import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const wasmRoot = resolve("node_modules/@mediapipe/tasks-vision/wasm");
const modelsRoot = resolve("src/models");

const VIRTUAL_PREFIX = "\0wasm:";

function stripQuery(id) {
  const q = id.indexOf("?");
  return q === -1 ? id : id.slice(0, q);
}

async function injectWasmLoader(filename) {
  const filePath = resolve(wasmRoot, filename);
  let content = await readFile(filePath, "utf-8");
  content = "var custom_dbg = function(){};\n" + content;
  content += "\nglobalThis.ModuleFactory = typeof ModuleFactory !== \"undefined\" ? ModuleFactory : void 0;";
  return content;
}

function serveStaticAssets() {
  return {
    name: "serve-static-assets",
    enforce: "pre",
    resolveId(id) {
      const clean = stripQuery(id);
      if (clean.startsWith("/wasm/") && clean.endsWith(".js")) {
        return VIRTUAL_PREFIX + clean.replace("/wasm/", "");
      }
    },
    async load(id) {
      if (id.startsWith(VIRTUAL_PREFIX)) {
        const filename = stripQuery(id.slice(VIRTUAL_PREFIX.length));
        return injectWasmLoader(filename);
      }
    },
    configureServer(server) {
      server.middlewares.use("/wasm", async (req, res, next) => {
        const filename = req.url.split("?")[0].replace(/^\//, "");
        if (!filename.endsWith(".js")) {
          try {
            const filePath = resolve(wasmRoot, filename);
            const content = await readFile(filePath);
            res.setHeader("Content-Type", "application/wasm");
            res.statusCode = 200;
            res.end(content);
            return;
          } catch {
          }
        }
        next();
      });
      server.middlewares.use("/models", async (req, res, next) => {
        const filename = req.url.split("?")[0].replace(/^\//, "");
        try {
          const filePath = resolve(modelsRoot, filename);
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
      for (const [source, destination] of [[modelsRoot, "models"], [wasmRoot, "wasm"]]) {
        const target = resolve("dist", destination);
        await mkdir(dirname(target), { recursive: true });
        await cp(source, target, { recursive: true });
      }
      for (const file of ["vision_wasm_internal.js", "vision_wasm_internal_simd.js"]) {
        const target = resolve("dist/wasm", file);
        try {
          await writeFile(target, await injectWasmLoader(file));
        } catch {
        }
      }
      await cp(resolve("service-worker.js"), resolve("dist/service-worker.js"));
    }
  };
}

export default defineConfig({
  plugins: [serveStaticAssets()]
});
