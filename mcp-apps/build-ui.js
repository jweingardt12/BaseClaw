import { execSync, exec } from "child_process";
import { mkdirSync, renameSync, existsSync, rmSync } from "fs";
import { join } from "path";

const apps = ["roster", "standings", "season", "intel", "setup-wizard"];
const distDir = "dist";

// Clean dist dir of old HTML files
if (existsSync(distDir)) {
  for (const app of apps) {
    const f = join(distDir, app + ".html");
    if (existsSync(f)) rmSync(f);
  }
} else {
  mkdirSync(distDir);
}

// Build all apps in parallel
const startTime = Date.now();
const results = await Promise.allSettled(
  apps.map(
    (app) =>
      new Promise((resolve, reject) => {
        const inputDir =
          app === "setup-wizard" ? "ui/setup-wizard" : "ui/" + app + "-app";
        const input = inputDir + "/index.html";
        console.log("Building " + app + "...");
        exec("npx vite build", {
          env: { ...process.env, INPUT: input },
        }, (err, stdout, stderr) => {
          if (err) {
            console.error("FAILED: " + app + "\n" + stderr);
            reject(err);
            return;
          }
          // Move the built file to dist/app.html
          const built = join(distDir, inputDir, "index.html");
          const dest = join(distDir, app + ".html");
          if (existsSync(built)) {
            renameSync(built, dest);
            console.log("  -> " + dest);
          }
          resolve(app);
        });
      })
  )
);

// Clean up leftover ui directory in dist
const distUi = join(distDir, "ui");
if (existsSync(distUi)) {
  rmSync(distUi, { recursive: true });
}

const failed = results.filter((r) => r.status === "rejected");
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
if (failed.length > 0) {
  console.error(failed.length + " app(s) failed to build.");
  process.exit(1);
}
console.log("All " + results.length + " UI apps built in " + elapsed + "s.");
