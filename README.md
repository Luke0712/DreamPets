# DreamPets

一个最小 Electron 桌面宠物。当前默认站立形象使用仓库内素材：

`assets/panda-breath-blink.webp`

思考状态形象使用：

`assets/panda-office-thinking.webp`

## 使用

```bash
npm start
```

- 拖动宠物本体可以移动位置。
- 右键宠物可以变大、变小或退出。
- 更换形象时修改 `src/petConfig.js` 里的 `imagePath` 或 `thinkingImagePath`。
