const fs = require("fs");
const path = require("path");
const ts = require("typescript");

function loadTs(filePath, customRequire = require) {
  const source = fs.readFileSync(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  new Function("exports", "require", "module", output)(module.exports, customRequire, module);
  return module.exports;
}

if (!Object.groupBy) {
  Object.groupBy = (items, callback) =>
    items.reduce((groups, item, index) => {
      const key = callback(item, index);
      groups[key] ??= [];
      groups[key].push(item);
      return groups;
    }, {});
}

const dataModule = loadTs(path.join("src", "data", "tarotCards.ts"));
const { tarotCards } = dataModule;
const grouped = Object.groupBy(tarotCards, (card) => card.suit);
const groupCounts = Object.fromEntries(Object.entries(grouped).map(([suit, cards]) => [suit, cards.length]));
const ids = tarotCards.map((card) => card.id);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
const missingImages = tarotCards
  .filter((card) => !fs.existsSync(path.join("public", card.image.replace(/^\//, ""))))
  .map((card) => `${card.id}:${card.image}`);
const absolutePaths = tarotCards.filter((card) => /^[A-Za-z]:\\|^\\\\/.test(card.image)).map((card) => card.image);

const tarotLib = loadTs(path.join("src", "lib", "tarot.ts"), (specifier) => {
  if (specifier === "@/data/tarotCards") {
    return dataModule;
  }
  return require(specifier);
});

let threeCardHasDuplicate = false;
let threeCardDrewMinor = false;
for (let index = 0; index < 500; index += 1) {
  const draw = tarotLib.drawCards(3, "愛情");
  const drawIds = draw.map((card) => card.id);
  if (new Set(drawIds).size !== drawIds.length) {
    threeCardHasDuplicate = true;
  }
  if (draw.some((card) => card.suit !== "major")) {
    threeCardDrewMinor = true;
  }
}

console.log("total", tarotCards.length);
console.log("Object.groupBy(tarotCards, card => card.suit) counts", groupCounts);
console.log("duplicateIds", duplicateIds);
console.log("missingImages", missingImages);
console.log("absoluteImagePaths", absolutePaths);
console.log("threeCardHasDuplicate", threeCardHasDuplicate);
console.log("threeCardDrewMinor", threeCardDrewMinor);
console.log("ids");
console.log(ids.join("\n"));

const expectedCounts = { major: 22, wands: 14, cups: 14, swords: 14, pentacles: 14 };
const hasExpectedCounts = Object.entries(expectedCounts).every(([suit, count]) => groupCounts[suit] === count);
if (
  tarotCards.length !== 78 ||
  !hasExpectedCounts ||
  duplicateIds.length > 0 ||
  missingImages.length > 0 ||
  absolutePaths.length > 0 ||
  threeCardHasDuplicate ||
  !threeCardDrewMinor
) {
  process.exitCode = 1;
}
