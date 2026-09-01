import { cp, mkdir, readdir, rm } from "node:fs/promises";

const source = new URL("../.claude/skills/", import.meta.url);
const destination = new URL(
  "../plugins/berlin-studio-skills/skills/",
  import.meta.url,
);

await mkdir(destination, { recursive: true });

const sourceSkills = (await readdir(source, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const packagedSkills = (await readdir(destination, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const name of packagedSkills) {
  if (!sourceSkills.includes(name)) {
    await rm(new URL(`${name}/`, destination), { recursive: true });
  }
}
// Copy the whole skill directory, not just SKILL.md. A skill may carry
// references, scripts or assets that its SKILL.md points at, and copying only
// the entry file ships an installer a skill whose own instructions reference
// files that are not there. Every skill happens to be SKILL.md-only today;
// that is the reason to fix this now rather than after the first one is not.
// The destination copy is removed first so a file deleted at source cannot
// survive in the package.
for (const name of sourceSkills) {
  await rm(new URL(`${name}/`, destination), { recursive: true, force: true });
  await mkdir(new URL(`${name}/`, destination), { recursive: true });
  await cp(new URL(`${name}/`, source), new URL(`${name}/`, destination), {
    recursive: true,
  });
}

console.log(`Synced ${sourceSkills.length} skills into the Claude Code plugin.`);
