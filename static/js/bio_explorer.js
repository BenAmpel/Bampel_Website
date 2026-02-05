(function () {
  const root = document.querySelector('[data-bio-explorer]');
  if (!root) return;

  const dataEl = root.querySelector('[data-bio-modes]');
  if (!dataEl) return;

  let modes = [];
  try {
    modes = JSON.parse(dataEl.textContent || '[]');
  } catch (err) {
    return;
  }

  if (!Array.isArray(modes) || modes.length === 0) return;

  const controls = root.querySelector('.bio-explorer-controls');
  const summary = root.querySelector('#bio-explorer-summary');
  const highlights = root.querySelector('#bio-explorer-highlights');
  const cta = root.querySelector('#bio-explorer-cta');

  if (!controls || !summary || !highlights) return;

  let activeIndex = 0;
  const defaultMode = root.getAttribute('data-default-mode');
  if (defaultMode) {
    const idx = modes.findIndex((mode) => mode.key === defaultMode);
    if (idx >= 0) activeIndex = idx;
  }

  const buttons = modes.map((mode, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bio-explorer-tab';
    button.textContent = mode.label || mode.key || `Track ${index + 1}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('data-mode', mode.key || `mode-${index + 1}`);
    button.addEventListener('click', () => setActive(index));
    controls.appendChild(button);
    return button;
  });

  function renderHighlights(items) {
    highlights.innerHTML = '';
    const list = Array.isArray(items) ? items : [];
    list.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      highlights.appendChild(li);
    });
  }

  function renderCta(mode) {
    if (!cta) return;
    if (mode && mode.cta && mode.cta.href) {
      cta.href = mode.cta.href;
      cta.textContent = mode.cta.label || 'Learn more';
      cta.style.display = 'inline-flex';
    } else {
      cta.style.display = 'none';
    }
  }

  function setActive(index) {
    const mode = modes[index];
    if (!mode) return;

    activeIndex = index;
    buttons.forEach((button, idx) => {
      const selected = idx === index;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.classList.toggle('is-active', selected);
      button.tabIndex = selected ? 0 : -1;
    });

    summary.textContent = mode.summary || '';
    renderHighlights(mode.highlights);
    renderCta(mode);
    root.setAttribute('data-active-mode', mode.key || '');
  }

  controls.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (activeIndex + direction + buttons.length) % buttons.length;
    buttons[nextIndex].focus();
    setActive(nextIndex);
  });

  setActive(activeIndex);
})();
