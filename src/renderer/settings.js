const settingsForm = document.getElementById("settingsForm");
const skillNameInput = document.getElementById("skillName");
const skillPathInput = document.getElementById("skillPath");
const chooseSkillFolderButton = document.getElementById("chooseSkillFolder");
const addSkillButton = document.getElementById("addSkill");
const skillsList = document.getElementById("skillsList");
const cancelSettingsButton = document.getElementById("cancelSettings");
const statusText = document.getElementById("status");
let skills = [];

loadSettings();

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusText.textContent = "";

  await window.pet.saveSettings({
    skills
  });

  statusText.textContent = "已保存";
  setTimeout(() => window.pet.closeWindow(), 250);
});

cancelSettingsButton.addEventListener("click", () => {
  window.pet.closeWindow();
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

addSkillButton.addEventListener("click", () => {
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
  renderSkills();
});

skillsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-skill]");
  if (!removeButton) return;

  skills = skills.filter((skill) => skill.id !== removeButton.dataset.removeSkill);
  renderSkills();
  statusText.textContent = "已移除技能";
});

async function loadSettings() {
  const settings = await window.pet.getSettings();
  skills = Array.isArray(settings.skills) ? settings.skills : [];
  renderSkills();
  skillNameInput.focus();
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
      item.append(content, removeButton);
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
