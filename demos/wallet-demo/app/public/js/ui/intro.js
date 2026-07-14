/**
 * Welcome modal — explains the wallets demo on first load.
 */

const STORAGE_KEY = "causet-wallets-intro-dismissed";

/**
 * @param {{ force?: boolean }} [opts]
 */
export function openIntro(opts = {}) {
  const overlay = document.getElementById("intro-overlay");
  if (!overlay) return;
  if (!opts.force && localStorage.getItem(STORAGE_KEY) === "1") return;

  overlay.hidden = false;
  document.body.classList.add("intro-open");
  requestAnimationFrame(() => overlay.classList.add("is-open"));

  const dismissBtn = document.getElementById("intro-dismiss");
  dismissBtn?.focus();
}

export function closeIntro({ remember = false } = {}) {
  const overlay = document.getElementById("intro-overlay");
  if (!overlay || overlay.hidden) return;

  if (remember) localStorage.setItem(STORAGE_KEY, "1");

  overlay.classList.remove("is-open");
  document.body.classList.remove("intro-open");
  const finish = () => {
    overlay.hidden = true;
    overlay.removeEventListener("transitionend", finish);
  };
  overlay.addEventListener("transitionend", finish);
  setTimeout(finish, 280);
}

export function bindIntro() {
  const overlay = document.getElementById("intro-overlay");
  if (!overlay) return;

  document.getElementById("intro-dismiss")?.addEventListener("click", () => {
    const skip = document.getElementById("intro-skip");
    closeIntro({ remember: !!skip?.checked });
  });

  document.getElementById("btn-help")?.addEventListener("click", () => {
    openIntro({ force: true });
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeIntro();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) closeIntro();
  });

  openIntro();
}
