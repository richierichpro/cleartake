// Saves a project as the sample that "Open a sample project" on the home page copies.
// Usage: node scripts/save-sample.mjs <projectId>
import fs from "node:fs";
import path from "node:path";

const id = process.argv[2];
const from = path.join("data", "projects", id ?? "");
if (!id || !fs.existsSync(path.join(from, "project.json"))) {
  console.error("Usage: node scripts/save-sample.mjs <projectId>  (see data/projects/)");
  process.exit(1);
}
const to = path.join("data", "samples", "demo");
fs.rmSync(to, { recursive: true, force: true });
// Exports are big and belong to the original project.
fs.cpSync(from, to, { recursive: true, filter: (src) => !/export-[^/]*$/.test(src) });
const project = JSON.parse(fs.readFileSync(path.join(to, "project.json"), "utf8"));
delete project.export;
fs.writeFileSync(path.join(to, "project.json"), JSON.stringify(project, null, 2));
console.log(`Saved "${project.title}" as the sample (${to})`);
