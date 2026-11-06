import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../data/kma_data.csv", import.meta.url));
const target = fileURLToPath(
  new URL("../src/weather/weather-grid.generated.ts", import.meta.url),
);
const rows = (await readFile(source, "utf8")).trim().split(/\r?\n/);
const header = rows.shift()?.split(",") || [];
const columns = ["1단계", "2단계", "3단계", "격자 X", "격자 Y"]
  .map((name) => header.indexOf(name));

if (columns.some((index) => index < 0)) {
  throw new Error("KMA CSV에 필요한 행정구역·격자 열이 없습니다.");
}

const locations = new Map();
for (const row of rows) {
  const cells = row.split(",");
  const location = columns.slice(0, 3)
    .map((index) => cells[index]?.trim())
    .filter(Boolean)
    .join(" ");
  const nx = Number(cells[columns[3]]);
  const ny = Number(cells[columns[4]]);
  if (!location || !Number.isInteger(nx) || !Number.isInteger(ny)) continue;
  locations.set(location, `${location}\t${nx}\t${ny}`);
}

const data = [...locations.values()]
  .join("\n")
  .replaceAll("\\", "\\\\")
  .replaceAll("`", "\\`")
  .replaceAll("${", "\\${");
const output = `// Generated from data/kma_data.csv. Run: pnpm --filter @ink/engine generate:weather-grid\nexport const WEATHER_GRID_DATA = \`${data}\`;\n`;

await writeFile(target, output);
console.log(`${locations.size}개 KMA 격자 생성: ${Buffer.byteLength(output)} bytes`);
