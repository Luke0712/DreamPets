const settingsForm = document.getElementById("settingsForm");
const skillsPanel = document.getElementById("skillsPanel");
const skillEditorPage = document.getElementById("skillEditorPage");
const editorActions = document.getElementById("editorActions");
const toggleSkillEditorButton = document.getElementById("toggleSkillEditor");
const cancelSkillEditorButton = document.getElementById("cancelSkillEditor");
const skillNameInput = document.getElementById("skillName");
const skillPathInput = document.getElementById("skillPath");
const chooseSkillFolderButton = document.getElementById("chooseSkillFolder");
const addSkillButton = document.getElementById("addSkill");
const skillsList = document.getElementById("skillsList");
const statusText = document.getElementById("status");
let skills = [];

loadSettings();

toggleSkillEditorButton.addEventListener("click", () => {
  openSkillEditor();
});

cancelSkillEditorButton.addEventListener("click", () => {
  closeSkillEditor();
});

chooseSkillFolderButton.addEventListener("click", async () => {
  const folder = await window.pet.selectSkillFolder();
  if (!folder) return;

  skillPathInput.value = folder.path;
  if (!skillNameInput.value.trim()) {
    skillNameInput.value = folder.name || "";
  }
  skillNameInput.focus();
});

addSkillButton.addEventListener("click", async () => {
  const folderPath = skillPathInput.value.trim();
  if (!folderPath) {
    statusText.textContent = "请先选择技能文件夹";
    return;
  }

  const skillName = skillNameInput.value.trim() || getFolderName(folderPath) || "未命名技能";
  const existingIndex = skills.findIndex((skill) => skill.path === folderPath);
  const nextSkill = {
    id: existingIndex >= 0 ? skills[existingIndex].id : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: skillName,
    path: folderPath
  };

  if (existingIndex >= 0) {
    skills[existingIndex] = nextSkill;
    statusText.textContent = "已更新技能";
  } else {
    skills.push(nextSkill);
    statusText.textContent = "已添加技能";
  }

  skillNameInput.value = "";
  skillPathInput.value = "";
  closeSkillEditor();
  renderSkills();
  await saveSkills();
});

skillsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-skill]");
  if (!removeButton) return;

  skills = skills.filter((skill) => skill.id !== removeButton.dataset.removeSkill);
  renderSkills();
  statusText.textContent = "已移除技能";
  saveSkills();
});

async function loadSettings() {
  const settings = await window.pet.getSettings();
  skills = Array.isArray(settings.skills) ? settings.skills : [];
  renderSkills();
}

function openSkillEditor() {
  skillsPanel.hidden = true;
  skillEditorPage.hidden = false;
  editorActions.hidden = false;
  statusText.textContent = "";
  requestAnimationFrame(() => skillNameInput.focus());
}

function closeSkillEditor() {
  skillsPanel.hidden = false;
  skillEditorPage.hidden = true;
  editorActions.hidden = true;
  skillNameInput.value = "";
  skillPathInput.value = "";
}

async function saveSkills() {
  await window.pet.saveSettings({ skills });
}

function renderSkills() {
  if (skills.length === 0) {
    skillsList.innerHTML = '<div class="empty-skills">还没有添加技能</div>';
    return;
  }

  skillsList.replaceChildren(
    ...skills.map((skill) => {
      const item = document.createElement("div");
      item.className = "skill-item";

      const mark = document.createElement("div");
      mark.className = "skill-mark";
      mark.textContent = "技";

      const content = document.createElement("div");
      content.className = "skill-content";

      const name = document.createElement("div");
      name.className = "skill-name";
      name.textContent = skill.name;

      const folderPath = document.createElement("div");
      folderPath.className = "skill-path";
      folderPath.textContent = skill.path;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "icon-button";
      removeButton.dataset.removeSkill = skill.id;
      removeButton.setAttribute("aria-label", `移除 ${skill.name}`);
      removeButton.title = "移除";
      removeButton.textContent = "×";

      content.append(name, folderPath);
      item.append(mark, content, removeButton);
      return item;
    })
  );
}

function getFolderName(folderPath) {
  return String(folderPath || "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop();
}
