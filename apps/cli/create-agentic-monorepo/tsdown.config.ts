import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  dts: false,
  platform: "node",
  deps: {
    alwaysBundle: ["@domains/scaffolding", "@platform/node-scaffolding"],
    neverBundle: ["@clack/prompts", "picocolors", "yaml", "cross-spawn"],
  },
});
