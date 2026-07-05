const historyList = document.getElementById("historyList");
const emptyState = document.getElementById("emptyState");
const clearHistoryButton = document.getElementById("clearHistory");

loadHistory();

window.pet.onHistoryUpdate((history) => {
  renderHistory(history);
});

clearHistoryButton.addEventListener("click", async () => {
  renderHistory(await window.pet.clearHistory());
});

async function loadHistory() {
  renderHistory(await window.pet.getHistory());
}

function renderHistory(history) {
  historyList.textContent = "";
  const messages = Array.isArray(history) ? history : [];
  emptyState.hidden = messages.length > 0;

  for (const message of messages) {
    const item = document.createElement("article");
    item.className = `history-message ${message.role === "user" ? "is-user" : "is-assistant"}`;

    const role = document.createElement("strong");
    role.textContent = message.role === "user" ? "你" : "桌宠";

    const content = document.createElement("p");
    content.textContent = message.content || "";

    item.append(role, content);
    historyList.append(item);
  }

  historyList.scrollTop = historyList.scrollHeight;
}
