const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("pet", {
  imageUrl: "pet://current",
  onScale: (callback) => {
    ipcRenderer.on("pet:scale", (_event, scale) => callback(scale));
  },
  onWindowBlur: (callback) => {
    ipcRenderer.on("pet:window-blur", callback);
  },
  showMenu: () => ipcRenderer.send("pet:show-menu"),
  openInput: () => ipcRenderer.send("pet:open-input"),
  closeInput: () => ipcRenderer.send("chat:close-input"),
  resizeInput: (height) => ipcRenderer.send("chat:resize-input", height),
  closeReply: () => ipcRenderer.send("chat:close-reply"),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  prepareDroppedFiles: (filePaths) => ipcRenderer.invoke("chat:prepare-dropped-files", filePaths),
  sendChat: (message) => ipcRenderer.invoke("chat:send", message),
  submitChat: (message) => ipcRenderer.invoke("chat:submit", message),
  getCurrentReply: () => ipcRenderer.invoke("reply:get-current"),
  onReplyUpdate: (callback) => {
    ipcRenderer.on("reply:update", (_event, payload) => callback(payload));
  },
  startDrag: (point) => ipcRenderer.send("pet:drag-start", point),
  moveDrag: (point) => ipcRenderer.send("pet:drag-move", point),
  endDrag: () => ipcRenderer.send("pet:drag-end"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  selectSkillFolder: () => ipcRenderer.invoke("settings:select-skill-folder"),
  getHistory: () => ipcRenderer.invoke("history:get"),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  onHistoryUpdate: (callback) => {
    ipcRenderer.on("history:update", (_event, history) => callback(history));
  },
  writeTerminal: (data) => ipcRenderer.send("terminal:write", data),
  resizeTerminal: (cols, rows) => ipcRenderer.send("terminal:resize", { cols, rows }),
  closeTerminal: () => ipcRenderer.send("terminal:close"),
  onTerminalOutput: (callback) => {
    ipcRenderer.on("terminal:output", (_event, data) => callback(data));
  },
  closeWindow: () => window.close()
});
