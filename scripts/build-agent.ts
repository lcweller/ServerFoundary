// Bundles agent/agent.ts into a single CJS file that the install script can
// fetch and Node can execute without any dependencies installed at runtime.
import { build } from "esbuild";
import { mkdirSync } from "fs";
import { dirname } from "path";

const outfile = "public/agent.cjs";
mkdirSync(dirname(outfile), { recursive: true });

async function main() {
  await build({
    entryPoints: ["agent/agent.ts"],
    outfile,
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    minify: false,
    sourcemap: false,
    legalComments: "none",
    banner: { js: "#!/usr/bin/env node\n" },
  });
  console.log(`Built ${outfile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
