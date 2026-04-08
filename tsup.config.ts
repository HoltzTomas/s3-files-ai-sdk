import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      "index.node": "src/index.node.ts",
      "index.web": "src/index.web.ts",
      proxy: "src/proxy.ts",
    },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node20",
    external: ["ai", "zod"],
  },
]);
