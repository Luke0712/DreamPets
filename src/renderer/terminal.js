const terminalElement = document.getElementById("terminal");
const term = new Terminal({
  cursorBlink: true,
  convertEol: true,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: 13,
  scrollback: 5000,
  theme: {
    background: "#0b0f14",
    foreground: "#e6edf3",
    cursor: "#e6edf3",
    selectionBackground: "#264f78"
  }
});
const fitAddon = new FitAddon.FitAddon();

term.loadAddon(fitAddon);
term.open(terminalElement);
term.focus();
fitAndNotify();

window.pet.onTerminalOutput((data) => {
  term.write(String(data));
});

term.onData((data) => {
  window.pet.writeTerminal(data);
});

window.addEventListener("resize", fitAndNotify);

function fitAndNotify() {
  requestAnimationFrame(() => {
    fitAddon.fit();
    window.pet.resizeTerminal(term.cols, term.rows);
  });
}
