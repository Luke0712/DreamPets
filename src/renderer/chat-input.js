const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const mentionMenu = document.getElementById("mentionMenu");
const droppedFiles = document.getElementById("droppedFiles");
let selectedTarget = null;
let selectedSkillId = null;
let skills = [];
let attachments = [];
let activeMentionIndex = 0;

loadMentionTargets();
requestAnimationFrame(() => chatInput.focus());
requestAnimationFrame(resizeInput);

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message && attachments.length === 0) return;

  chatInput.value = "";
  selectedTarget = null;
  const submittedSkillId = selectedSkillId || findMentionedSkillId(message);
  const submittedAttachments = attachments;
  selectedSkillId = null;
  attachments = [];
  mentionMenu.hidden = true;
  renderAttachments();
  resizeInput();

  await window.pet.submitChat({
    message: removeSkillMention(message, submittedSkillId),
    skillId: submittedSkillId,
    attachments: submittedAttachments
  });
});

chatInput.addEventListener("input", () => {
  syncSelectedMentionFromValue();
  syncMentionMenu();
  resizeInput();
});

chatForm.addEventListener("dragenter", (event) => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  chatForm.classList.add("is-dragging-file");
});

chatForm.addEventListener("dragover", (event) => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  chatForm.classList.add("is-dragging-file");
});

chatForm.addEventListener("dragleave", (event) => {
  if (chatForm.contains(event.relatedTarget)) return;
  chatForm.classList.remove("is-dragging-file");
});

chatForm.addEventListener("drop", async (event) => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  chatForm.classList.remove("is-dragging-file");

  const filePaths = [...event.dataTransfer.files]
    .map((file) => window.pet.getPathForFile(file))
    .filter(Boolean);
  if (filePaths.length === 0) return;

  const preparedFiles = await window.pet.prepareDroppedFiles(filePaths);
  attachments = mergeAttachments(attachments, preparedFiles);
  renderAttachments();
  resizeInput();
  chatInput.focus();
});

chatInput.addEventListener("keydown", (event) => {
  if (handleAtomicMentionDelete(event)) return;

  if (event.key === "Escape" && !mentionMenu.hidden) {
    closeMentionMenu();
    event.preventDefault();
    return;
  }

  if (!mentionMenu.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    moveMentionSelection(event.key === "ArrowDown" ? 1 : -1);
    event.preventDefault();
    return;
  }

  if (!mentionMenu.hidden && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    const selectedButton = getMentionButtons()[activeMentionIndex];
    if (selectedButton) {
      chooseMention(selectedButton);
      event.preventDefault();
      return;
    }
  }

  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  chatForm.requestSubmit();
});

mentionMenu.addEventListener("mousedown", (event) => {
  event.preventDefault();
});

mentionMenu.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mention]");
  if (!button) return;

  chooseMention(button);
});

chatInput.addEventListener("blur", () => {
  setTimeout(() => window.pet.closeInput(), 80);
});

function resizeInput() {
  chatInput.style.height = "0px";
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 112)}px`;
  window.pet.resizeInput(document.body.scrollHeight);
}

function hasDraggedFiles(event) {
  return [...(event.dataTransfer?.types || [])].includes("Files");
}

function syncMentionMenu() {
  const value = chatInput.value;
  const cursor = chatInput.selectionStart || 0;
  const beforeCursor = value.slice(0, cursor);
  const shouldShowMenu = /(^|\s)@$/.test(beforeCursor);

  if (shouldShowMenu) {
    openMentionMenu();
    resizeInput();
  } else if (!findMentionedSkillId(value)) {
    closeMentionMenu();
    selectedTarget = null;
    selectedSkillId = null;
    resizeInput();
  }
}

async function loadMentionTargets() {
  const settings = await window.pet.getSettings();
  skills = Array.isArray(settings.skills) ? settings.skills : [];
  renderMentionMenu();
}

function renderMentionMenu() {
  mentionMenu.replaceChildren();
  activeMentionIndex = 0;

  if (skills.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mention-empty";
    empty.textContent = "还没有添加技能";
    mentionMenu.append(empty);
    return;
  }

  for (const skill of skills) {
    const button = createMentionButton(skill.name);
    button.dataset.skillId = skill.id;
    button.title = skill.path;
    mentionMenu.append(button);
  }
  syncActiveMention();
}

function createMentionButton(name) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.mention = name;

  const title = document.createElement("span");
  title.className = "mention-name";
  title.textContent = name;

  const mark = document.createElement("span");
  mark.className = "mention-mark";
  mark.textContent = "@";

  button.append(mark, title);
  return button;
}

function openMentionMenu() {
  renderMentionMenu();
  mentionMenu.hidden = false;
  syncActiveMention();
}

function closeMentionMenu() {
  mentionMenu.hidden = true;
  activeMentionIndex = 0;
  syncActiveMention();
}

function getMentionButtons() {
  return [...mentionMenu.querySelectorAll("[data-mention]")];
}

function moveMentionSelection(delta) {
  const buttons = getMentionButtons();
  if (buttons.length === 0) return;
  activeMentionIndex = (activeMentionIndex + delta + buttons.length) % buttons.length;
  syncActiveMention();
  buttons[activeMentionIndex].scrollIntoView({ block: "nearest" });
}

function syncActiveMention() {
  getMentionButtons().forEach((button, index) => {
    button.classList.toggle("is-active", index === activeMentionIndex);
  });
}

function chooseMention(button) {
  selectedTarget = button.dataset.mention;
  selectedSkillId = button.dataset.skillId || null;
  chatInput.value = `@${selectedTarget} `;
  closeMentionMenu();
  resizeInput();
  chatInput.focus();
  chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
}

function handleAtomicMentionDelete(event) {
  if (event.key !== "Backspace" && event.key !== "Delete") return false;

  const token = getSelectedMentionToken();
  if (!token) return false;

  const selectionStart = chatInput.selectionStart ?? 0;
  const selectionEnd = chatInput.selectionEnd ?? selectionStart;
  const collapsed = selectionStart === selectionEnd;
  const touchesToken = collapsed
    ? cursorDeleteTouchesToken(event.key, selectionStart, token)
    : rangesOverlap(selectionStart, selectionEnd, token.start, token.end);

  if (!touchesToken) return false;

  const deleteStart = collapsed ? token.start : Math.min(selectionStart, token.start);
  const deleteEnd = collapsed ? token.end : Math.max(selectionEnd, token.end);
  chatInput.value = `${chatInput.value.slice(0, deleteStart)}${chatInput.value.slice(deleteEnd)}`;
  chatInput.setSelectionRange(deleteStart, deleteStart);
  clearSelectedMention();
  closeMentionMenu();
  resizeInput();
  event.preventDefault();
  return true;
}

function cursorDeleteTouchesToken(key, cursor, token) {
  if (key === "Backspace") return cursor > token.start && cursor <= token.end;
  return cursor >= token.start && cursor < token.end;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function getSelectedMentionToken() {
  if (!selectedTarget || !selectedSkillId) return null;

  const tokenText = `@${selectedTarget} `;
  const start = chatInput.value.indexOf(tokenText);
  if (start === -1) return null;

  return {
    start,
    end: start + tokenText.length,
    text: tokenText,
    skillId: selectedSkillId
  };
}

function syncSelectedMentionFromValue() {
  if (getSelectedMentionToken()) return;

  const skillId = findMentionedSkillId(chatInput.value);
  if (skillId) {
    const skill = skills.find((item) => item.id === skillId);
    selectedTarget = skill?.name || null;
    selectedSkillId = skillId;
    return;
  }

  clearSelectedMention();
}

function clearSelectedMention() {
  selectedTarget = null;
  selectedSkillId = null;
}

function findMentionedSkillId(message) {
  const matchedSkill = [...skills]
    .sort((a, b) => b.name.length - a.name.length)
    .find((skill) => new RegExp(`(^|\\s)@${escapeRegExp(skill.name)}(?=\\s|$)`).test(message));
  return matchedSkill?.id || null;
}

function removeSkillMention(message, skillId) {
  if (!skillId) return message;
  const skill = skills.find((item) => item.id === skillId);
  if (!skill) return message;
  return message.replace(new RegExp(`(^|\\s)@${escapeRegExp(skill.name)}(?=\\s|$)`, "g"), " ").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mergeAttachments(currentAttachments, nextAttachments) {
  const byPath = new Map(currentAttachments.map((attachment) => [attachment.path, attachment]));
  for (const attachment of nextAttachments || []) {
    byPath.set(attachment.path, attachment);
  }
  return [...byPath.values()];
}

function insertDroppedFileText(preparedFiles) {
  if (!preparedFiles?.length) return;

  const summary = preparedFiles
    .map((file) => {
      if (file.kind === "image") return `已添加图片：${file.name}`;
      if (file.kind === "text") return `已添加文件：${file.name}`;
      return `已添加文件路径：${file.path}`;
    })
    .join("\n");
  const prefix = chatInput.value.trim() ? "\n" : "";
  chatInput.value = `${chatInput.value}${prefix}${summary}\n`;
  chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
}

function renderAttachments() {
  droppedFiles.replaceChildren();
  droppedFiles.hidden = attachments.length === 0;

  for (const attachment of attachments) {
    const chip = document.createElement("div");
    chip.className = "dropped-file";
    chip.title = attachment.path;

    const type = document.createElement("span");
    type.className = "dropped-file-type";
    type.textContent = attachment.kind === "image" ? "图" : "文";

    const name = document.createElement("span");
    name.className = "dropped-file-name";
    name.textContent = attachment.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "dropped-file-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `移除 ${attachment.name}`);
    remove.addEventListener("click", () => {
      attachments = attachments.filter((item) => item.path !== attachment.path);
      renderAttachments();
      resizeInput();
      chatInput.focus();
    });

    chip.append(type, name, remove);
    droppedFiles.append(chip);
  }
}
