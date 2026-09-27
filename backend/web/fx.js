// Motion layer (no libraries): scroll reveals, magnetic buttons, a soft cursor glow, a sticky nav shadow.
// Everything respects prefers-reduced-motion and switches off on touch screens.
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(pointer: fine)").matches;

  // 1. reveal sections and their cards as they enter the screen (staggered)
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((sec) => {
    sec.querySelectorAll(".card, .install-steps li, .proof > *").forEach((el, i) => el.style.setProperty("--d", `${i * 70}ms`));
    reduce ? sec.classList.add("in") : io.observe(sec);
  });

  // 2. nav gains depth once you scroll
  const nav = document.querySelector(".nav");
  addEventListener("scroll", () => nav && nav.classList.toggle("scrolled", scrollY > 8), { passive: true });

  if (reduce || !fine) return;
  // 3. magnetic buttons: they lean towards the pointer a little
  document.querySelectorAll(".btn").forEach((b) => {
    b.addEventListener("pointermove", (e) => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.14}px, ${(e.clientY - r.top - r.height / 2) * 0.22}px)`;
    });
    b.addEventListener("pointerleave", () => (b.style.transform = ""));
  });
  // 4. a soft violet light follows the pointer
  const glow = document.querySelector(".cursor-glow");
  let x = 0, y = 0, gx = 0, gy = 0;
  addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; glow.style.opacity = 1; }, { passive: true });
  (function loop() { gx += (x - gx) * 0.12; gy += (y - gy) * 0.12; glow.style.transform = `translate(${gx - 200}px, ${gy - 200}px)`; requestAnimationFrame(loop); })();
})();
