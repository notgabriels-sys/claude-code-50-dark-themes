import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const artworkRoot = join(root, "artwork");
const swiftEnvironment = {
  ...process.env,
  CLANG_MODULE_CACHE_PATH: join(tmpdir(), "tlea-swift-module-cache"),
};
const conversions = [
  ["cover.svg", "cover.png", 1280, 720],
  ["thumbnail.svg", "thumbnail.png", 800, 800],
];

for (const [source, destination, width, height] of conversions) {
  execFileSync(
    "swift",
    [
      join(artworkRoot, "render-svg.swift"),
      join(artworkRoot, source),
      join(artworkRoot, destination),
      String(width),
      String(height),
    ],
    { stdio: "inherit", env: swiftEnvironment },
  );
}

execFileSync(
  "ffmpeg",
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    join(root, "qa", "TLEA_Audition_Reel.wav"),
    "-filter_complex",
    "showwavespic=s=1280x360:colors=0x3d7cff:scale=sqrt",
    "-frames:v",
    "1",
    join(artworkRoot, "spectrum.png"),
  ],
  { stdio: "inherit" },
);

for (const file of ["cover.png", "thumbnail.png", "spectrum.png"]) {
  const dimensions = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", join(artworkRoot, file)], {
    encoding: "utf8",
  });
  console.log(dimensions.trim());
}
