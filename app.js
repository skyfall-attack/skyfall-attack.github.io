/* SKYFALL — the research text remains fully readable without JavaScript. */
'use strict';

const themeButton = document.querySelector('#theme-toggle');
function applyTheme(theme) {
  const light = theme === 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  themeButton.setAttribute('aria-pressed', String(light));
  themeButton.title = light ? 'Switch to dark mode' : 'Switch to light mode';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', light ? '#f8f7f4' : '#0a0c10');
}
applyTheme(document.documentElement.dataset.theme);
themeButton.hidden = false;
themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
  try { localStorage.setItem('skyfall-theme', theme); } catch { /* Switching still works without storage. */ }
  scheduleReadingUpdate();
});
window.addEventListener('storage', event => {
  if (event.key === 'skyfall-theme') applyTheme(event.newValue);
});

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = motionQuery.matches;
function updateMotion() {
  document.body.classList.toggle('motion-paused', paused);
}
motionQuery.addEventListener('change', event => {
  paused = event.matches;
  updateMotion();
});
updateMotion();

const progress = document.querySelector('.reading-progress');
const navLinks = [...document.querySelectorAll('.header nav a')];
const navSections = navLinks.map(link => document.querySelector(link.getAttribute('href')));
let pendingFrame = false;
let navigationTarget = null;

function setActiveSection(active) {
  navLinks.forEach((link, index) => {
    link.classList.toggle('active', index === active);
    if (index === active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

function updateHeaderOffset() {
  const headerHeight = Math.ceil(document.querySelector('.header').getBoundingClientRect().height);
  const offset = headerHeight + 24;
  document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);
  document.documentElement.style.setProperty('--header-offset', `${offset}px`);
  return offset;
}

// Keep the chosen destination active until the reader starts scrolling again.
// Near the page end, a short section cannot always reach the header's edge.
document.querySelectorAll('a[href^="#"]').forEach(link => {
  const index = navSections.findIndex(section => `#${section.id}` === link.getAttribute('href'));
  if (index < 0) return;
  link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const offset = updateHeaderOffset();
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const top = Math.max(0, Math.min(maxScroll, window.scrollY + navSections[index].getBoundingClientRect().top - offset));
    navigationTarget = index;
    setActiveSection(index);
    if (window.location.hash !== link.getAttribute('href')) {
      window.history.pushState(null, '', link.getAttribute('href'));
    }
    window.scrollTo({top, behavior: paused ? 'instant' : 'smooth'});
    scheduleReadingUpdate();
  });
});

function releaseNavigationTarget() {
  navigationTarget = null;
  scheduleReadingUpdate();
}
window.addEventListener('wheel', releaseNavigationTarget, {passive: true});
window.addEventListener('touchmove', releaseNavigationTarget, {passive: true});
window.addEventListener('pointerdown', event => {
  if (event.target === document.documentElement) releaseNavigationTarget();
});
window.addEventListener('keydown', event => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) releaseNavigationTarget();
});
window.addEventListener('scrollend', scheduleReadingUpdate);
function updateHistorySelection() {
  const index = navLinks.findIndex(link => link.getAttribute('href') === window.location.hash);
  navigationTarget = index >= 0 ? index : null;
  scheduleReadingUpdate();
}
window.addEventListener('popstate', updateHistorySelection);
window.addEventListener('hashchange', updateHistorySelection);

function updateReadingPosition() {
  pendingFrame = false;
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.width = `${scrollable > 0 ? window.scrollY / scrollable * 100 : 0}%`;
  const offset = updateHeaderOffset();
  if (navigationTarget !== null) {
    setActiveSection(navigationTarget);
    return;
  }
  let active = -1;
  navSections.forEach((section, index) => {
    if (section.getBoundingClientRect().top <= offset + 8) active = index;
  });
  if (window.scrollY >= scrollable - 2 && scrollable > 0) {
    navSections.forEach((section, index) => {
      if (section.getBoundingClientRect().top < window.innerHeight - 40) active = index;
    });
  }
  setActiveSection(active);
}

function scheduleReadingUpdate() {
  if (!pendingFrame) {
    pendingFrame = true;
    window.requestAnimationFrame(updateReadingPosition);
  }
}
window.addEventListener('scroll', scheduleReadingUpdate, {passive: true});
window.addEventListener('resize', scheduleReadingUpdate, {passive: true});
if ('ResizeObserver' in window) {
  const headerObserver = new ResizeObserver(scheduleReadingUpdate);
  headerObserver.observe(document.querySelector('.header'));
}
updateReadingPosition();

async function copyCitation(status, citation = document.querySelector('#citation-text')) {
  try {
    await navigator.clipboard.writeText(citation.textContent.trim());
    status.textContent = 'BibTeX copied.';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(citation);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    status.textContent = 'Citation selected. Copy it with Ctrl+C or ⌘C.';
  }
}
document.querySelector('#cite-button').addEventListener('click', () => copyCitation(document.querySelector('#copy-status')));

const citationDialog = document.querySelector('#citation-dialog');
document.querySelector('#dialog-citation-text').textContent = document.querySelector('#citation-text').textContent.trim();
document.querySelectorAll('[data-open-citation]').forEach(trigger => {
  trigger.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || typeof citationDialog.showModal !== 'function') return;
    event.preventDefault();
    citationDialog.showModal();
  });
});
document.querySelector('#dialog-copy-button').addEventListener('click', () => copyCitation(document.querySelector('#dialog-copy-status'), document.querySelector('#dialog-citation-text')));
citationDialog.addEventListener('click', event => {
  if (event.target === citationDialog) citationDialog.close();
});

// Paper Eq. 1: recovered Zen 3/4 hash, with the paper's output-bit ordering.
// BigInt preserves all address bits, including canonical 64-bit virtual addresses.
function computeZen34Microtag(address) {
  const value = BigInt(address);
  let tag = 0n;
  for (let i = 0n; i < 8n; i++) {
    const first = i < 3n ? i + 12n : 22n - i;
    const second = 27n - i;
    tag |= (((value >> first) ^ (value >> second)) & 1n) << i;
  }
  return Number(tag);
}

// The static HTML contains the same computed example for readers without JS.
const collisionToggle = document.querySelector('#collision-toggle');
const collisionFigure = document.querySelector('.collision-example');
const collisionResult = document.querySelector('#collision-result');
const physicalAddress = 0x0000000001234000n;
const collidingAddress = 0x00007f0009235000n;
const nonCollidingAddress = 0x00007f0009234000n;
const hexTag = value => `0x${value.toString(16).padStart(2, '0')}`;
let colliding = true;
collisionToggle.hidden = false;

function updateCollisionExample() {
  const virtualAddress = colliding ? collidingAddress : nonCollidingAddress;
  const physicalTag = computeZen34Microtag(physicalAddress);
  const virtualTag = computeZen34Microtag(virtualAddress);
  const matches = physicalTag === virtualTag;
  collisionFigure.classList.toggle('no-collision', !matches);
  document.querySelector('#example-address').textContent = `0x${virtualAddress.toString(16).padStart(16, '0')}`;
  document.querySelector('#physical-tag').textContent = hexTag(physicalTag);
  document.querySelector('#example-tag').textContent = hexTag(virtualTag);
  for (let i = 0; i < 8; i++) {
    const first = BigInt(i < 3 ? i + 12 : 22 - i);
    const second = BigInt(27 - i);
    const a = Number((virtualAddress >> first) & 1n);
    const b = Number((virtualAddress >> second) & 1n);
    document.querySelector(`#hash-virtual-${i}`).textContent = `${a} ⊕ ${b} = ${a ^ b}`;
  }
  const binary = value => `0b${value.toString(2).padStart(8, '0')}`;
  document.querySelector('#hash-total').textContent = `Physical U = ${binary(physicalTag)} = ${hexTag(physicalTag)}; virtual U = ${binary(virtualTag)} = ${hexTag(virtualTag)}.`;
  collisionResult.replaceChildren();
  collisionResult.append(document.createTextNode(matches ? 'Different addresses. Same µtag.' : 'Different addresses. Different µtags.'));
  const explanation = document.createElement('span');
  explanation.textContent = matches
    ? 'Both can select the way containing the protected data.'
    : 'No collision with the protected address in this example.';
  collisionResult.append(explanation);
  collisionToggle.firstChild.textContent = colliding ? 'Try a non-colliding address ' : 'Return to the collision ';
}
collisionToggle.addEventListener('click', () => {
  colliding = !colliding;
  updateCollisionExample();
});
updateCollisionExample();

// Mark each chapter once on arrival. Content is never hidden or scroll-gated.
if ('IntersectionObserver' in window) {
  const chapterObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      if (!paused) entry.target.classList.add('chapter-arrived');
      chapterObserver.unobserve(entry.target);
    }
  }, {rootMargin: '0px 0px -6% 0px', threshold: 0});
  document.querySelectorAll('.research-content > section').forEach(section => chapterObserver.observe(section));
}
