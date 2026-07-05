const petImage = document.getElementById("pet");
const petStage = document.querySelector(".pet-stage");

let isDragging = false;
let pointerStart = null;
const dragThreshold = 4;

petImage.addEventListener("load", () => {
  document.body.classList.remove("image-error");
  console.log(`pet image loaded ${petImage.naturalWidth}x${petImage.naturalHeight}`);
});

petImage.addEventListener("error", () => {
  document.body.classList.add("image-error");
  console.log(`pet image failed ${window.pet.imageUrl}`);
});

setPetImage("idle");

window.pet.getPetState().then(setPetImage);
window.pet.onPetVisualState(setPetImage);

window.pet.onScale((scale) => {
  document.documentElement.style.setProperty("--pet-scale", scale);
});

function setPetImage(state) {
  const nextSrc = state === "thinking" ? window.pet.thinkingImageUrl : window.pet.imageUrl;
  if (petImage.src !== nextSrc) {
    petImage.src = nextSrc;
  }
}

window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  window.pet.showMenu();
});

window.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;
  if (event.detail > 1) return;
  pointerStart = {
    x: event.screenX,
    y: event.screenY
  };
  isDragging = false;
  window.pet.startDrag(pointerStart);
});

window.addEventListener("mousemove", (event) => {
  if (!pointerStart || (event.buttons & 1) === 0) return;
  const moved =
    Math.abs(event.screenX - pointerStart.x) > dragThreshold ||
    Math.abs(event.screenY - pointerStart.y) > dragThreshold;
  if (!isDragging && moved) {
    isDragging = true;
  }
  if (!isDragging) return;
  window.pet.moveDrag({ x: event.screenX, y: event.screenY });
});

window.addEventListener("mouseup", (event) => {
  if (pointerStart && !isDragging && event.button === 0) {
    window.pet.openInput();
  }
  pointerStart = null;
  isDragging = false;
  window.pet.endDrag();
});

window.addEventListener("mouseleave", (event) => {
  if (pointerStart && (event.buttons & 1) !== 0) return;
  pointerStart = null;
  isDragging = false;
  window.pet.endDrag();
});
