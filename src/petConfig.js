const path = require("node:path");

const rootDir = path.join(__dirname, "..");

module.exports = {
  enterPath: "",
  imagePath: path.join(rootDir, "assets", "panda-breath-blink.webp"),
  thinkingImagePath: path.join(rootDir, "assets", "panda-office-thinking.webp"),
  baseWidth: 180,
  baseHeight: 180
};
