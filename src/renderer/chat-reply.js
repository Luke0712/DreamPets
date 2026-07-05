const thinking = document.getElementById("thinking");
const replyBox = document.getElementById("replyBox");
const replyText = document.getElementById("replyText");
const ackReply = document.getElementById("ackReply");
const params = new URLSearchParams(window.location.search);

renderReply({
  message: params.get("message") || "思考中",
  thinking: params.get("thinking") !== "false"
});

loadCurrentReply();

window.pet.onReplyUpdate((payload) => {
  renderReply(payload);
});

ackReply.addEventListener("click", () => {
  window.pet.closeReply();
});

function renderReply(payload) {
  const isThinking = Boolean(payload?.thinking);
  document.body.classList.toggle("is-thinking", isThinking);
  thinking.hidden = !isThinking;
  replyBox.hidden = isThinking;
  replyText.textContent = isThinking ? "" : String(payload?.message || "");
}

async function loadCurrentReply() {
  const payload = await window.pet.getCurrentReply();
  if (payload) {
    renderReply(payload);
  }
}
