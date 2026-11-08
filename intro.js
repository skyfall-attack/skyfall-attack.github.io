/* Cached barrel texture + compositor-only transforms/opacity. No frame loop. */
(() => {
  'use strict';
  const root = document.documentElement;
  const intro = document.querySelector('#entry-intro');
  const texture = document.querySelector('#entry-texture');
  const backdrop = document.querySelector('#entry-backdrop');
  const shutter = document.querySelector('#entry-shutter');
  const pageTitle = document.querySelector('#hero-title');
  const dots = [...document.querySelectorAll('.entry-dot')];
  const skip = document.querySelector('#entry-skip');
  const replay = document.querySelector('#replay-intro');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const duration = 2600;
  const previousInert = new Map();
  const quietFocus = new Set();
  let active = false;
  let generation = 0;
  let animations = [];
  let deadline;
  let previousFocus;

  function clearQuietFocus() {
    for (const node of quietFocus) node.removeAttribute('data-entry-focus');
    quietFocus.clear();
  }

  function focusQuietly(node) {
    if (!node) return;
    node.setAttribute('data-entry-focus', '');
    quietFocus.add(node);
    node.focus({preventScroll: true});
  }

  function finish() {
    if (!active) { root.classList.remove('entry-pending'); return; }
    active = false;
    generation++;
    window.clearTimeout(deadline);
    const ownedFocus = intro.contains(document.activeElement);
    clearQuietFocus();
    intro.hidden = true;
    for (const animation of animations) animation.cancel();
    animations = [];
    root.classList.remove('entry-pending', 'entry-playing');
    for (const [node, inert] of previousInert) node.inert = inert;
    previousInert.clear();
    if (ownedFocus) {
      // An automatic entrance has no initiating control to restore. Land on
      // the page title instead of selecting the navbar logo after every visit.
      const target = previousFocus && previousFocus !== document.body && previousFocus.isConnected
        && previousFocus !== document.querySelector('.header .brand')
        ? previousFocus : pageTitle;
      focusQuietly(target);
    }
  }

  function animate(node, keyframes, options = {}) {
    const animation = node.animate(keyframes, {duration, fill: 'both', ...options});
    animations.push(animation);
    // Cancellation is normal when the reader skips or changes preferences.
    animation.finished.catch(() => {});
    return animation;
  }

  async function decodeTexture() {
    const source = root.dataset.theme === 'light' ? texture.dataset.srcLight : texture.dataset.src;
    if (texture.getAttribute('src') !== source) texture.src = source;
    let timeout;
    try {
      await Promise.race([
        texture.decode(),
        new Promise((_, reject) => { timeout = window.setTimeout(() => reject(new Error('Texture unavailable')), 700); })
      ]);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function play() {
    if (active || motion.matches) { if (motion.matches) finish(); return; }
    if (typeof texture.animate !== 'function' || typeof texture.decode !== 'function') { finish(); return; }
    active = true;
    const run = ++generation;
    deadline = window.setTimeout(finish, 3500);
    previousFocus = document.activeElement;
    for (const node of document.body.children) {
      if (node === intro) continue;
      previousInert.set(node, node.inert);
      node.inert = true;
    }
    intro.hidden = false;
    root.classList.remove('entry-pending');
    root.classList.add('entry-playing');
    focusQuietly(skip);
    try {
      await decodeTexture();
      if (!active || run !== generation) return;

      // Read viewport dimensions once. The fixed-size decoded bitmap is then
      // scaled by the compositor instead of rerasterizing an SVG each frame.
      const {width, height} = intro.getBoundingClientRect();
      // Animate the actual heading, never a typographic replica. Its final
      // transform is identity, so removing the animation cannot move the text,
      // even with fractional pixels, different fonts, zoom, or scrollbars.
      const heading = pageTitle.getBoundingClientRect();
      const textRange = document.createRange();
      textRange.selectNodeContents(pageTitle);
      const word = textRange.getBoundingClientRect();
      const headingStyle = window.getComputedStyle(pageTitle);
      const startScale = Math.min(64, width * .055) / parseFloat(headingStyle.fontSize);
      const dx = width / 2 - heading.left - (word.left - heading.left + word.width / 2) * startScale;
      const dy = height / 2 - heading.top - (word.top - heading.top + word.height / 2) * startScale;
      const centeredTitle = `translate3d(${dx}px, ${dy}px, 0) scale(${startScale})`;
      const base = Math.max(width, height) * 1.5 / 1024;
      const end = (Math.hypot(width, height) / 2 + 32) / 102.4;
      const transform = (scale, angle) => `translate3d(-50%, -50%, 0) rotate(${angle}deg) scale(${scale})`;
      shutter.style.transform = `translate3d(-50%, -50%, 0) scale(${base})`;
      const reveal = animate(texture, [
        {transform: transform(base * .98, -35), offset: 0},
        {transform: transform(base * .98, -35), offset: .125, easing: 'ease-out'},
        {transform: transform(base, -22), offset: .36, easing: 'ease-in-out'},
        {transform: transform(base * 1.06, 20), offset: .55, easing: 'cubic-bezier(.4,0,.2,1)'},
        {transform: transform(end, 20), offset: .96},
        {transform: transform(end, 20), offset: 1}
      ]);
      animate(texture, [{opacity: 0, offset: 0}, {opacity: 0, offset: .125}, {opacity: 1, offset: .29}, {opacity: 1, offset: 1}]);
      const coverFade = [{opacity: 1, offset: 0}, {opacity: 1, offset: .25}, {opacity: 0, offset: .43}, {opacity: 0, offset: 1}];
      animate(backdrop, coverFade);
      animate(shutter, coverFade);
      animate(pageTitle, [
        {transform: centeredTitle, offset: 0},
        {transform: centeredTitle, offset: .43, easing: 'cubic-bezier(.22,1,.36,1)'},
        {transform: 'none', offset: .9},
        {transform: 'none', offset: 1}
      ]);
      animate(pageTitle, [{opacity: 0, offset: 0}, {opacity: 0, offset: .16}, {opacity: 1, offset: .25}, {opacity: 1, offset: 1}]);
      for (const node of document.querySelectorAll('.header, .hero-bottom, .hero-footer')) {
        animate(node, [
          {opacity: 0, transform: 'translate3d(0, 8px, 0)', offset: 0},
          {opacity: 0, transform: 'translate3d(0, 8px, 0)', offset: .43, easing: 'ease-out'},
          {opacity: 1, transform: 'translate3d(0, 0, 0)', offset: .9},
          {opacity: 1, transform: 'translate3d(0, 0, 0)', offset: 1}
        ]);
      }
      dots.forEach((dot, index) => animate(dot, [{opacity: 0}, {opacity: 1, offset: .5}, {opacity: 0}], {duration: 220, delay: index * 80}));
      try { sessionStorage.setItem('skyfall-entry-seen', '1'); } catch { /* Optional persistence. */ }
      reveal.finished.then(() => { if (active && run === generation) finish(); }, () => {});
    } catch {
      // A missing image or unsupported animation must never block the paper.
      if (run === generation) finish();
    }
  }

  skip.addEventListener('click', finish);
  intro.addEventListener('click', finish);
  window.addEventListener('keydown', event => {
    clearQuietFocus();
    if (active && event.key === 'Escape') finish();
  });
  window.addEventListener('wheel', () => { if (active) finish(); }, {passive: true});
  window.addEventListener('touchmove', () => { if (active) finish(); }, {passive: true});
  window.addEventListener('resize', () => { if (active) finish(); }, {passive: true});
  document.addEventListener('visibilitychange', () => { if (document.hidden && active) finish(); });
  function updateMotion() {
    replay.disabled = motion.matches;
    if (motion.matches) finish();
  }
  motion.addEventListener('change', updateMotion);
  replay.hidden = false;
  replay.addEventListener('click', () => {
    if (motion.matches) return;
    const home = document.querySelector('.header nav a[href="#top"]');
    home?.click();
    window.scrollTo({top: 0, behavior: 'instant'});
    focusQuietly(home);
    play();
  });
  updateMotion();
  if (root.classList.contains('entry-pending')) play();
})();
