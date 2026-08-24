import { copyFile, mkdir, readdir, rm } from "node:fs/promises";

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
for (const name of sourceSkills) {
  await mkdir(new URL(`${name}/`, destination), { recursive: true });
  await copyFile(
    new URL(`${name}/SKILL.md`, source),
    new URL(`${name}/SKILL.md`, destination),
  );
}

console.log(`Synced ${sourceSkills.length} skills into the Claude Code plugin.`);
