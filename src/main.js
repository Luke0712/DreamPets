const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, protocol, screen, dialog } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs/promises");
const pty = require("node-pty");
const path = require("path");
const { baseHeight, baseWidth, imagePath, thinkingImagePath } = require("./petConfig");

let petWindow;
let settingsWindow;
let historyWindow;
let inputWindow;
let replyWindow;
let terminalWindow;
let terminalProcess;
let tray;
let scale = 1;
let dragState = null;
let dragTimer = null;
let conversationHistory = [];
let replyPayload = null;
let petVisualState = "idle";

const chatPanelWidth = 320;
const replyPanelHeight = 260;
const inputPanelHeight = 64;
const maxInputPanelHeight = 300;
const terminalWidth = 640;
const terminalHeight = 360;
const maxConversationMessages = 16;
const dragThreshold = 4;
const trayIconPath = path.join(__dirname, "..", "build", "tray-icon.png");
const maxSkillFiles = 24;
const maxSkillContextLength = 36000;
const skillTextExtensions = new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".sh",
  ".html",
  ".css"
]);
const ignoredSkillFolders = new Set([".git", "node_modules", "dist", "build", ".DS_Store"]);
const maxDroppedFiles = 8;
const maxDroppedTextLength = 50000;
const maxDroppedImageBytes = 8 * 1024 * 1024;
const hermesPythonPath = "/Users/luke/.hermes/hermes-agent/venv/bin/python";
const hermesModuleName = "hermes_cli.main";
const hermesTimeoutMs = 180000;
const maxHermesPromptLength = 120000;
const maxHermesProgressLines = 18;
const imageMimeTypes = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"]
]);
const droppedTextExtensions = new Set([
  ".txt",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".sh",
  ".html",
  ".css",
  ".csv",
  ".log"
]);

protocol.registerSchemesAsPrivileged([
  {
    scheme: "pet",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true
    }
  }
]);

function createPetWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const petWidth = Math.round(baseWidth * scale);
  const petHeight = Math.round(baseHeight * scale);

  petWindow = new BrowserWindow({
    width: petWidth,
    height: petHeight,
    x: Math.max(24, width - petWidth - 72),
    y: Math.max(24, height - petHeight - 72),
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.setAlwaysOnTop(true, "floating");
  petWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  petWindow.webContents.on("console-message", (_event, _level, message) => {
    console.log(`[renderer] ${message}`);
  });

  petWindow.webContents.on("context-menu", () => showPetMenu());
  petWindow.on("move", () => {
    if (!dragState) {
      positionChatWindows();
    }
  });
  petWindow.on("blur", () => {
    petWindow.webContents.send("pet:window-blur");
  });
}

function resizePet(delta) {
  scale = Math.min(2.2, Math.max(0.5, scale + delta));
  const petWidth = Math.round(baseWidth * scale);
  const petHeight = Math.round(baseHeight * scale);
  petWindow.setSize(petWidth, petHeight, false);
  petWindow.webContents.send("pet:scale", scale);
  positionChatWindows();
}

function showPetMenu() {
  buildAppMenu().popup({ window: petWindow });
}

function buildAppMenu() {
  return Menu.buildFromTemplate([
    {
      label: petWindow && !petWindow.isDestroyed() && petWindow.isVisible() ? "隐藏桌宠" : "显示桌宠",
      click: togglePetWindow
    },
    { type: "separator" },
    {
      label: "设置",
      click: openSettingsWindow
    },
    {
      label: "历史",
      click: openHistoryWindow
    },
    {
      label: "终端",
      click: openTerminalWindow
    },
    { type: "separator" },
    {
      label: "变大",
      click: () => resizePet(0.15)
    },
    {
      label: "变小",
      click: () => resizePet(-0.15)
    },
    { type: "separator" },
    {
      label: "退出桌宠",
      role: "quit"
    }
  ]);
}

function createTray() {
  if (tray) return;

  const image = nativeImage.createFromPath(trayIconPath).resize({
    width: 18,
    height: 18
  });

  tray = new Tray(image);
  tray.setToolTip("桌面宠物");
  tray.setContextMenu(buildAppMenu());
  tray.on("click", togglePetWindow);
  tray.on("right-click", () => {
    tray.setContextMenu(buildAppMenu());
    tray.popUpContextMenu();
  });
}

function refreshTrayMenu() {
  if (tray) {
    tray.setContextMenu(buildAppMenu());
  }
}

function togglePetWindow() {
  if (!petWindow || petWindow.isDestroyed()) {
    createPetWindow();
    refreshTrayMenu();
    return;
  }

  if (petWindow.isVisible()) {
    closeInputWindow();
    petWindow.hide();
  } else {
    petWindow.showInactive();
    positionChatWindows();
  }
  refreshTrayMenu();
}

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 420,
    parent: petWindow,
    modal: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "桌宠设置",
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, "renderer", "settings.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function openHistoryWindow() {
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.focus();
    historyWindow.webContents.send("history:update", getConversationHistory());
    return;
  }

  historyWindow = new BrowserWindow({
    width: 480,
    height: 520,
    parent: petWindow,
    modal: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    title: "会话历史",
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  historyWindow.setMenuBarVisibility(false);
  historyWindow.loadFile(path.join(__dirname, "renderer", "history.html"));
  historyWindow.on("closed", () => {
    historyWindow = null;
  });
}

function openTerminalWindow() {
  if (terminalWindow && !terminalWindow.isDestroyed()) {
    terminalWindow.focus();
    positionChatWindows();
    return;
  }

  terminalWindow = new BrowserWindow({
    width: terminalWidth,
    height: terminalHeight,
    title: "桌宠终端",
    backgroundColor: "#101318",
    resizable: true,
    minimizable: true,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  terminalWindow.setMenuBarVisibility(false);
  terminalWindow.loadFile(path.join(__dirname, "renderer", "terminal.html"));
  terminalWindow.on("closed", () => {
    terminalWindow = null;
    stopTerminalProcess();
  });
  startTerminalProcess();
  positionChatWindows();
}

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    app.dock?.hide();
    app.setActivationPolicy?.("accessory");
  }

  protocol.handle("pet", async (request) => {
    const imageFilePath = getPetImagePath(new URL(request.url).pathname);
    const image = await fs.readFile(imageFilePath);
    return new Response(image, {
      headers: {
        "Content-Type": getContentType(imageFilePath),
        "Cache-Control": "no-store"
      }
    });
  });
  createTray();
  createPetWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createPetWindow();
  }
});

ipcMain.handle("settings:get", readSettings);
ipcMain.handle("settings:save", (_event, settings) => saveSettings(settings));
ipcMain.handle("settings:select-skill-folder", () => selectSkillFolder());
ipcMain.handle("history:get", () => getConversationHistory());
ipcMain.handle("history:clear", () => {
  clearConversation();
  return getConversationHistory();
});
ipcMain.handle("chat:prepare-dropped-files", (_event, filePaths) => prepareDroppedFiles(filePaths));
ipcMain.handle("chat:send", (_event, message) => sendChatMessage(message));
ipcMain.handle("chat:submit", (_event, message) => submitChatMessage(message));
ipcMain.handle("reply:get-current", () => replyPayload);
ipcMain.handle("pet:get-state", () => petVisualState);
ipcMain.on("pet:show-menu", () => showPetMenu());
ipcMain.on("pet:open-input", () => openInputWindow());
ipcMain.on("chat:close-input", () => closeInputWindow());
ipcMain.on("chat:close-reply", () => closeReplyWindow());
ipcMain.on("chat:resize-input", (_event, height) => resizeInputWindow(height));
ipcMain.on("reply:ready", () => pushReplyPayload());
ipcMain.on("terminal:write", (_event, data) => {
  if (!terminalProcess) {
    startTerminalProcess();
  }
  terminalProcess?.write(String(data || ""));
});
ipcMain.on("terminal:resize", (_event, size) => {
  if (!terminalProcess) return;
  const cols = Math.max(2, Number(size?.cols) || 80);
  const rows = Math.max(2, Number(size?.rows) || 24);
  terminalProcess.resize(cols, rows);
});
ipcMain.on("terminal:close", () => {
  if (terminalWindow && !terminalWindow.isDestroyed()) {
    terminalWindow.close();
  }
});
ipcMain.on("pet:drag-start", (_event, point) => {
  if (!petWindow || petWindow.isDestroyed()) return;
  dragState = {
    mouseX: point.x,
    mouseY: point.y,
    windowBounds: petWindow.getBounds(),
    lastX: null,
    lastY: null,
    active: false
  };
  startDragLoop();
});

ipcMain.on("pet:drag-move", (_event, point) => {
  updateDragPosition(point);
});
ipcMain.on("pet:drag-end", () => {
  dragState = null;
  stopDragLoop();
  positionChatWindows();
});

function startDragLoop() {
  stopDragLoop();
  dragTimer = setInterval(() => {
    if (!dragState) {
      stopDragLoop();
      return;
    }
    updateDragPosition(screen.getCursorScreenPoint());
  }, 16);
}

function stopDragLoop() {
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
}

function updateDragPosition(point) {
  if (!dragState || !petWindow || petWindow.isDestroyed()) return;

  const nextX = dragState.windowBounds.x + Math.round(point.x - dragState.mouseX);
  const nextY = dragState.windowBounds.y + Math.round(point.y - dragState.mouseY);
  if (!dragState.active) {
    const moved =
      Math.abs(point.x - dragState.mouseX) > dragThreshold ||
      Math.abs(point.y - dragState.mouseY) > dragThreshold;
    if (!moved) return;
    dragState.active = true;
  }
  if (dragState.lastX === nextX && dragState.lastY === nextY) return;

  dragState.lastX = nextX;
  dragState.lastY = nextY;
  petWindow.setPosition(nextX, nextY, false);
  positionChatWindows({
    ...dragState.windowBounds,
    x: nextX,
    y: nextY
  });
}

function openInputWindow() {
  if (inputWindow && !inputWindow.isDestroyed()) {
    inputWindow.focus();
    return;
  }

  inputWindow = createOverlayWindow(inputPanelHeight);
  const currentInputWindow = inputWindow;
  inputWindow.loadFile(path.join(__dirname, "renderer", "chat-input.html"));
  inputWindow.on("blur", closeInputWindow);
  inputWindow.on("closed", () => {
    if (inputWindow === currentInputWindow) {
      inputWindow = null;
    }
  });
  positionChatWindows();
}

function openReplyWindow(message, isThinking = false) {
  closeReplyWindow();

  replyPayload = {
    message,
    thinking: isThinking
  };
  replyWindow = createOverlayWindow(replyPanelHeight);
  const currentReplyWindow = replyWindow;
  loadReplyWindow();
  replyWindow.on("closed", () => {
    if (replyWindow === currentReplyWindow) {
      replyWindow = null;
    }
  });
  replyWindow.webContents.on("did-finish-load", () => {
    if (replyWindow !== currentReplyWindow) return;
    pushReplyPayload();
    positionChatWindows();
  });
  positionChatWindows();
}

function loadReplyWindow() {
  if (!replyWindow || replyWindow.isDestroyed()) return;
  replyWindow.loadFile(path.join(__dirname, "renderer", "chat-reply.html"), {
    query: {
      thinking: String(Boolean(replyPayload?.thinking))
    }
  });
}

function createOverlayWindow(height) {
  const window = new BrowserWindow({
    width: chatPanelWidth,
    height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setAlwaysOnTop(true, "floating");
  return window;
}

function positionChatWindows(nextPetBounds) {
  if (!petWindow || petWindow.isDestroyed()) return;

  const petBounds = nextPetBounds || petWindow.getBounds();
  const display = screen.getDisplayMatching(petBounds);
  const workArea = display.workArea;
  const centeredX = Math.round(petBounds.x + petBounds.width / 2 - chatPanelWidth / 2);
  const x = Math.max(workArea.x + 8, Math.min(centeredX, workArea.x + workArea.width - chatPanelWidth - 8));

  if (inputWindow && !inputWindow.isDestroyed()) {
    const inputBounds = inputWindow.getBounds();
    const inputHeight = inputBounds.height || inputPanelHeight;
    const y = Math.max(
      workArea.y + 8,
      Math.min(petBounds.y + petBounds.height + 8, workArea.y + workArea.height - inputHeight - 8)
    );
    inputWindow.setPosition(x, y, false);
  }

  if (replyWindow && !replyWindow.isDestroyed()) {
    const y = petBounds.y - replyPanelHeight + 8;
    replyWindow.setPosition(x, y, false);
  }

  if (terminalWindow && !terminalWindow.isDestroyed()) {
    const terminalBounds = terminalWindow.getBounds();
    const nextTerminalWidth = terminalBounds.width || terminalWidth;
    const nextTerminalHeight = terminalBounds.height || terminalHeight;
    const terminalX = Math.max(
      workArea.x + 8,
      Math.min(
        Math.round(petBounds.x + petBounds.width / 2 - nextTerminalWidth / 2),
        workArea.x + workArea.width - nextTerminalWidth - 8
      )
    );
    const terminalY = Math.max(
      workArea.y + 8,
      Math.min(petBounds.y + petBounds.height + 8, workArea.y + workArea.height - nextTerminalHeight - 8)
    );
    terminalWindow.setPosition(terminalX, terminalY, false);
  }
}

function closeInputWindow() {
  if (inputWindow && !inputWindow.isDestroyed()) {
    inputWindow.close();
  }
}

function closeReplyWindow() {
  if (replyWindow && !replyWindow.isDestroyed()) {
    replyWindow.close();
  }
  replyPayload = null;
}

function resizeInputWindow(height) {
  if (!inputWindow || inputWindow.isDestroyed()) return;
  const nextHeight = Math.max(inputPanelHeight, Math.min(Math.ceil(Number(height) || inputPanelHeight), maxInputPanelHeight));
  const bounds = inputWindow.getBounds();
  if (bounds.height !== nextHeight) {
    inputWindow.setSize(bounds.width, nextHeight, false);
    positionChatWindows();
  }
}

function startTerminalProcess() {
  if (terminalProcess) return;

  ensurePtyHelperExecutable();

  try {
    const shell = process.env.SHELL || "/bin/zsh";
    terminalProcess = pty.spawn(shell, ["-il"], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: {
        ...process.env,
        TERM: "xterm-256color"
      }
    });
  } catch (error) {
    sendTerminalOutput(`Failed to start terminal: ${error?.message || error}\n`);
    terminalProcess = null;
    return;
  }

  terminalProcess.onData((chunk) => sendTerminalOutput(chunk));
  terminalProcess.onExit(({ exitCode, signal }) => {
    sendTerminalOutput(`\n[process exited: ${signal || exitCode || 0}]\n`);
    terminalProcess = null;
  });
}

function submitTerminalInstruction(message) {
  const instruction = String(message || "").trim();
  if (!instruction) return;

  openTerminalWindow();
  terminalProcess?.write(`${instruction}\n`);
}

function updateReplyWindow(message) {
  replyPayload = {
    message,
    thinking: false
  };

  if (!replyWindow || replyWindow.isDestroyed()) {
    replyWindow = createOverlayWindow(replyPanelHeight);
    const currentReplyWindow = replyWindow;
    replyWindow.on("closed", () => {
      if (replyWindow === currentReplyWindow) {
        replyWindow = null;
      }
    });
    replyWindow.webContents.on("did-finish-load", () => {
      if (replyWindow !== currentReplyWindow) return;
      pushReplyPayload();
      positionChatWindows();
    });
  }

  loadReplyWindow();
  setTimeout(pushReplyPayload, 50);
  setTimeout(pushReplyPayload, 200);
  setTimeout(pushReplyPayload, 600);
  positionChatWindows();
}

function pushReplyPayload() {
  if (!replyWindow || replyWindow.isDestroyed() || !replyPayload) return;
  replyWindow.webContents.send("reply:update", replyPayload);
}

function sendTerminalOutput(chunk) {
  if (terminalWindow && !terminalWindow.isDestroyed()) {
    terminalWindow.webContents.send("terminal:output", String(chunk));
  }
}

function setPetVisualState(state) {
  const nextState = state === "thinking" ? "thinking" : "idle";
  if (petVisualState === nextState) return;
  petVisualState = nextState;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet:visual-state", petVisualState);
  }
}

function getPetImagePath(urlPathname) {
  if (urlPathname.includes("thinking")) return thinkingImagePath;
  return imagePath;
}

function stopTerminalProcess() {
  if (terminalProcess) {
    terminalProcess.kill();
  }
  terminalProcess = null;
}

function ensurePtyHelperExecutable() {
  if (process.platform !== "darwin") return;

  const helperPath = path.join(__dirname, "..", "node_modules", "node-pty", "prebuilds", "darwin-arm64", "spawn-helper");
  try {
    require("fs").chmodSync(helperPath, 0o755);
  } catch {
    // The helper path differs on other architectures; pty.spawn will surface a useful error.
  }
}

async function readSettings() {
  try {
    const data = await fs.readFile(getSettingsPath(), "utf8");
    return normalizeSettings({
      skills: [],
      ...JSON.parse(data)
    });
  } catch {
    return normalizeSettings({
      skills: []
    });
  }
}

async function saveSettings(settings) {
  const normalizedSettings = normalizeSettings(settings);
  await fs.mkdir(path.dirname(getSettingsPath()), { recursive: true });
  await fs.writeFile(getSettingsPath(), JSON.stringify(normalizedSettings, null, 2));
  return normalizedSettings;
}

function normalizeSettings(settings) {
  return {
    skills: normalizeSkills(settings?.skills)
  };
}

function normalizeSkills(skills) {
  if (!Array.isArray(skills)) return [];

  const seen = new Set();
  return skills
    .map((skill) => {
      const folderPath = String(skill?.path || "").trim();
      const name = String(skill?.name || "").trim() || path.basename(folderPath) || "未命名技能";
      return {
        id: String(skill?.id || folderPath || `${Date.now()}-${Math.random()}`),
        name,
        path: folderPath
      };
    })
    .filter((skill) => {
      if (!skill.path || seen.has(skill.path)) return false;
      seen.add(skill.path);
      return true;
    });
}

async function selectSkillFolder() {
  const result = await dialog.showOpenDialog(settingsWindow || petWindow, {
    title: "选择技能文件夹",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || !result.filePaths?.[0]) {
    return null;
  }

  const folderPath = result.filePaths[0];
  return {
    name: path.basename(folderPath),
    path: folderPath
  };
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

async function prepareDroppedFiles(filePaths) {
  const uniquePaths = [...new Set((Array.isArray(filePaths) ? filePaths : []).map((filePath) => String(filePath || "")))]
    .filter(Boolean)
    .slice(0, maxDroppedFiles);
  const preparedFiles = [];

  for (const filePath of uniquePaths) {
    const stats = await fs.stat(filePath).catch(() => null);
    if (!stats?.isFile()) continue;

    const ext = path.extname(filePath).toLowerCase();
    const name = path.basename(filePath);
    const imageMime = imageMimeTypes.get(ext);

    if (imageMime) {
      preparedFiles.push(await prepareDroppedImage(filePath, name, imageMime, stats.size));
      continue;
    }

    if (droppedTextExtensions.has(ext) || stats.size <= 64 * 1024) {
      preparedFiles.push(await prepareDroppedText(filePath, name, stats.size));
      continue;
    }

    preparedFiles.push({
      kind: "file",
      name,
      path: filePath,
      size: stats.size
    });
  }

  return preparedFiles;
}

async function prepareDroppedImage(filePath, name, mimeType, size) {
  if (size > maxDroppedImageBytes) {
    return {
      kind: "file",
      name,
      path: filePath,
      size,
      note: "图片超过大小限制，已作为文件路径添加"
    };
  }

  const buffer = await fs.readFile(filePath);
  return {
    kind: "image",
    name,
    path: filePath,
    size,
    mimeType,
    dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`
  };
}

async function prepareDroppedText(filePath, name, size) {
  const content = await fs.readFile(filePath, "utf8").catch(() => "");
  const trimmedContent = content.length > maxDroppedTextLength ? `${content.slice(0, maxDroppedTextLength)}\n\n[文件内容已截断]` : content;
  return {
    kind: "text",
    name,
    path: filePath,
    size,
    text: trimmedContent
  };
}

async function sendChatMessage(payload) {
  const normalizedPayload = normalizeChatPayload(payload);
  const prompt = normalizedPayload.message || (normalizedPayload.attachments.length > 0 ? "请处理我拖入的附件。" : "");
  if (!prompt && normalizedPayload.attachments.length === 0) {
    throw new Error("请输入要发送的内容");
  }

  const settings = await readSettings();
  const skill = settings.skills.find((item) => item.id === normalizedPayload.skillId);
  const skillContext = skill ? await readSkillContext(skill) : "";
  const hermesPrompt = buildHermesPrompt(prompt, normalizedPayload.attachments, skill, skillContext);
  const reply = await runHermesChat(hermesPrompt, normalizedPayload.attachments);
  const normalizedReply = String(reply || "").trim();
  if (!normalizedReply) {
    throw new Error("Hermes 没有返回可展示的回复。");
  }
  appendConversationMessage("user", buildVisibleUserMessage(skill ? `@${skill.name} ${prompt}` : prompt, normalizedPayload.attachments));
  appendConversationMessage("assistant", normalizedReply);
  return normalizedReply;
}

async function submitChatMessage(payload) {
  closeInputWindow();
  setPetVisualState("thinking");
  openReplyWindow("Hermes 正在接收消息", true);

  try {
    const reply = await sendChatMessage(payload);
    updateReplyWindow(reply);
    setPetVisualState("idle");
    return reply;
  } catch (error) {
    const errorMessage = error?.message || "对话请求失败，请检查设置后再试。";
    updateReplyWindow(errorMessage);
    setPetVisualState("idle");
    return errorMessage;
  }
}

function normalizeChatPayload(payload) {
  if (typeof payload === "string") {
    return {
      message: payload.trim(),
      skillId: null,
      attachments: []
    };
  }

  return {
    message: String(payload?.message || "").trim(),
    skillId: payload?.skillId ? String(payload.skillId) : null,
    attachments: normalizeDroppedAttachments(payload?.attachments)
  };
}

function normalizeDroppedAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];

  return attachments.slice(0, maxDroppedFiles).map((attachment) => ({
    kind: String(attachment?.kind || "file"),
    name: String(attachment?.name || "未命名文件"),
    path: String(attachment?.path || ""),
    mimeType: String(attachment?.mimeType || ""),
    text: typeof attachment?.text === "string" ? attachment.text.slice(0, maxDroppedTextLength) : "",
    dataUrl: typeof attachment?.dataUrl === "string" ? attachment.dataUrl : ""
  }));
}

function buildAttachmentText(attachments) {
  return attachments
    .map((attachment) => {
      if (attachment.kind === "text" && attachment.text) {
        return `--- 拖入文件：${attachment.name} (${attachment.path}) ---\n${attachment.text}`;
      }
      if (attachment.kind === "image") {
        return `拖入图片：${attachment.name}\n路径：${attachment.path}`;
      }
      return `拖入文件：${attachment.name}\n路径：${attachment.path}`;
    })
    .join("\n\n");
}

function buildVisibleUserMessage(prompt, attachments) {
  const attachmentSummary = attachments.map((attachment) => `[${attachment.kind === "image" ? "图片" : "文件"}] ${attachment.name}`).join(" ");
  return [prompt, attachmentSummary].filter(Boolean).join("\n");
}

function buildHermesPrompt(prompt, attachments, skill, skillContext) {
  const parts = [];

  if (skill && skillContext) {
    parts.push(`本轮用户调用了技能「${skill.name}」。请优先遵循下面技能文件夹中的说明和资料完成用户请求。\n\n${skillContext}`);
  }

  parts.push(`用户消息：\n${prompt}`);

  const attachmentText = buildAttachmentText(attachments);
  if (attachmentText) {
    parts.push(`拖入附件：\n${attachmentText}`);
  }

  const fullPrompt = parts.join("\n\n");
  if (fullPrompt.length <= maxHermesPromptLength) return fullPrompt;
  return `${fullPrompt.slice(0, maxHermesPromptLength)}\n\n[本轮输入已截断]`;
}

async function runHermesChat(prompt, attachments) {
  const sessionId = await readHermesSessionId();
  const imagePaths = attachments
    .filter((attachment) => attachment.kind === "image" && attachment.path)
    .map((attachment) => attachment.path);
  const args = [
    "-m",
    hermesModuleName,
    "chat",
    "-q",
    prompt,
    "--accept-hooks",
    "--yolo",
    "--source",
    "desktop-pet"
  ];

  if (sessionId) {
    args.push("--resume", sessionId);
  }

  for (const imagePath of imagePaths) {
    args.push("--image", imagePath);
  }

  updateThinkingProgress(sessionId ? "Hermes 正在恢复会话" : "Hermes 正在启动会话");
  let result = await runHermesCommand(args, updateHermesProgressFromChunk);
  if (sessionId && isMissingHermesSession(result)) {
    await clearHermesSessionId();
    const retryArgs = args.filter((arg, index) => arg !== "--resume" && args[index - 1] !== "--resume");
    updateThinkingProgress("原会话不可用，Hermes 正在新建会话");
    result = await runHermesCommand(retryArgs, updateHermesProgressFromChunk);
  }
  const parsed = parseHermesOutput([result.stdout, result.stderr].filter(Boolean).join("\n"));
  if (parsed.sessionId) {
    await saveHermesSessionId(parsed.sessionId);
  }

  if (result.code !== 0) {
    throw new Error(parsed.message || `Hermes 退出码：${result.code}`);
  }

  return parsed.message;
}

function isMissingHermesSession(result) {
  return result.code !== 0 && /No session found matching/i.test([result.stdout, result.stderr].filter(Boolean).join("\n"));
}

function updateHermesProgressFromChunk(chunk) {
  const progressLines = String(chunk || "")
    .split(/\r?\n/)
    .map(cleanHermesOutputLine)
    .filter(isHermesProgressLine);
  for (const line of progressLines) {
    updateThinkingProgress(line);
  }
}

function updateThinkingProgress(line) {
  if (!replyPayload?.thinking) return;
  const currentLines = String(replyPayload.message || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const nextLine = String(line || "").trim();
  if (!nextLine || currentLines[currentLines.length - 1] === nextLine) return;
  const nextLines = [...currentLines, nextLine].slice(-maxHermesProgressLines);
  replyPayload = {
    message: nextLines.join("\n"),
    thinking: true
  };
  pushReplyPayload();
}

function cleanHermesOutputLine(line) {
  return String(line || "")
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/[╭╮╯╰─│]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHermesProgressLine(line) {
  if (!line) return false;
  if (isHermesControlLine(line)) return false;
  if (/^(Query|Session|Duration|Messages|Resume this session with|hermes --resume)\b/i.test(line)) return false;
  if (/^⚕\s*Hermes$/i.test(line)) return false;
  if (line.length > 120) return false;
  return (
    /Initializing agent/i.test(line) ||
    /Creating new local environment/i.test(line) ||
    /local environment ready/i.test(line) ||
    /tool .* completed/i.test(line) ||
    /Running|Calling|Executing|Generating|Thinking|正在|初始化|工具|完成/i.test(line)
  );
}

function runHermesCommand(args, onProgress) {
  return new Promise((resolve, reject) => {
    const child = spawn(hermesPythonPath, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TERM: "xterm-256color",
        HERMES_ACCEPT_HOOKS: "1"
      }
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error("Hermes 执行超时，已停止本次请求。"));
    }, hermesTimeoutMs);

    child.stdin?.end();
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      onProgress?.(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      onProgress?.(text);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`无法启动 Hermes：${error.message}`));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

function parseHermesOutput(output) {
  const lines = String(output || "").split(/\r?\n/);
  let sessionId = "";
  const messageLines = [];
  let insideHermesBox = false;
  const boxedMessageLines = [];

  for (const line of lines) {
    const sessionMatch = line.match(/^session_id:\s*(.+)$/);
    if (sessionMatch) {
      sessionId = sessionMatch[1].trim();
      continue;
    }
    const cleanLine = cleanHermesOutputLine(line);
    const resumeMatch = cleanLine.match(/^Resume this session with:\s*hermes --resume\s+(.+)$/i);
    const resumeCommandMatch = cleanLine.match(/^hermes --resume\s+(.+)$/i);
    const sessionLabelMatch = cleanLine.match(/^Session:\s*(.+)$/i);
    if (resumeMatch) {
      sessionId = resumeMatch[1].trim();
      continue;
    }
    if (resumeCommandMatch) {
      sessionId = resumeCommandMatch[1].trim();
      continue;
    }
    if (sessionLabelMatch) {
      sessionId = sessionLabelMatch[1].trim();
      continue;
    }
    if (/⚕\s*Hermes/i.test(cleanLine)) {
      insideHermesBox = true;
      continue;
    }
    if (insideHermesBox && /^╰|^Resume this session with:|^Session:|^Duration:|^Messages:/i.test(String(line).trim())) {
      insideHermesBox = false;
    }
    if (insideHermesBox && cleanLine) {
      boxedMessageLines.push(cleanLine);
      continue;
    }
    if (isHermesControlLine(cleanLine) || isHermesProgressLine(cleanLine)) {
      continue;
    }
    if (cleanLine) {
      messageLines.push(cleanLine);
    }
  }

  return {
    sessionId,
    message: (boxedMessageLines.length > 0 ? boxedMessageLines : messageLines).join("\n").trim()
  };
}

function isHermesControlLine(line) {
  const trimmedLine = String(line || "").trim();
  return (
    /^↻\s*Resumed session\b/i.test(trimmedLine) ||
    /^Resumed session\b/i.test(trimmedLine) ||
    /^Created session\b/i.test(trimmedLine) ||
    /^New session\b/i.test(trimmedLine)
  );
}

async function readHermesSessionId() {
  const data = await fs.readFile(getHermesSessionPath(), "utf8").catch(() => "");
  if (!data) return "";

  try {
    return String(JSON.parse(data)?.sessionId || "").trim();
  } catch {
    return "";
  }
}

async function saveHermesSessionId(sessionId) {
  if (!sessionId) return;
  await fs.mkdir(path.dirname(getHermesSessionPath()), { recursive: true });
  await fs.writeFile(
    getHermesSessionPath(),
    JSON.stringify(
      {
        sessionId,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    )
  );
}

async function clearHermesSessionId() {
  await fs.unlink(getHermesSessionPath()).catch(() => {});
}

function getHermesSessionPath() {
  return path.join(app.getPath("userData"), "hermes-session.json");
}

async function readSkillContext(skill) {
  const folderPath = String(skill?.path || "");
  const files = await collectSkillFiles(folderPath);
  if (files.length === 0) {
    return `技能文件夹：${folderPath}\n未找到可读取的文本说明文件。`;
  }

  let context = `技能文件夹：${folderPath}`;
  for (const filePath of files) {
    const relativePath = path.relative(folderPath, filePath);
    const content = await fs.readFile(filePath, "utf8").catch(() => "");
    if (!content.trim()) continue;

    const nextBlock = `\n\n--- ${relativePath} ---\n${content.trim()}`;
    if (context.length + nextBlock.length > maxSkillContextLength) {
      const remaining = maxSkillContextLength - context.length;
      if (remaining > 300) {
        context += nextBlock.slice(0, remaining);
      }
      context += "\n\n[技能内容已截断]";
      break;
    }
    context += nextBlock;
  }

  return context;
}

async function collectSkillFiles(folderPath) {
  const stats = await fs.stat(folderPath).catch(() => null);
  if (!stats?.isDirectory()) return [];

  const collected = [];
  await walkSkillFolder(folderPath, folderPath, collected);
  return collected.sort(compareSkillFiles).slice(0, maxSkillFiles);
}

async function walkSkillFolder(rootPath, currentPath, collected) {
  if (collected.length >= maxSkillFiles * 2) return;

  const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (ignoredSkillFolders.has(entry.name)) continue;

    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await walkSkillFolder(rootPath, entryPath, collected);
      continue;
    }

    if (!entry.isFile() || !isSkillTextFile(entry.name)) continue;
    collected.push(entryPath);
  }
}

function isSkillTextFile(fileName) {
  const lowerName = fileName.toLowerCase();
  if (lowerName === "skill.md" || lowerName === "readme.md" || lowerName === "readme.txt") return true;
  return skillTextExtensions.has(path.extname(lowerName));
}

function compareSkillFiles(a, b) {
  return getSkillFilePriority(a) - getSkillFilePriority(b) || a.localeCompare(b);
}

function getSkillFilePriority(filePath) {
  const name = path.basename(filePath).toLowerCase();
  if (name === "skill.md") return 0;
  if (name.startsWith("readme")) return 1;
  return 2;
}

function appendConversationMessage(role, content) {
  conversationHistory.push({
    role,
    content,
    timestamp: new Date().toISOString()
  });

  if (conversationHistory.length > maxConversationMessages) {
    conversationHistory = conversationHistory.slice(-maxConversationMessages);
  }

  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.webContents.send("history:update", getConversationHistory());
  }
}

function clearConversation() {
  conversationHistory = [];
  closeReplyWindow();
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.webContents.send("history:update", getConversationHistory());
  }
}

function getConversationHistory() {
  return conversationHistory.map((message) => ({ ...message }));
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}
