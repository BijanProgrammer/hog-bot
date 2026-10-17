import esbuildPluginTsc from "esbuild-plugin-tsc";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "src/main.ts",
  },
  outDir: "dist",
  format: ["cjs"],
  target: "node24",
  minify: true,
  keepNames: true,
  sourcemap: false,
  clean: true,
  treeshake: true,
  noExternal: [/.*/],
  esbuildPlugins: [esbuildPluginTsc()],
});
