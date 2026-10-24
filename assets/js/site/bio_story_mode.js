(function () {
  const storyRoot = document.querySelector('[data-story-mode]');
  const storyFull = document.querySelector('[data-story-full]');
  if (!storyRoot || !storyFull) return;

  const buttons = Array.from(storyRoot.querySelectorAll('.bio-story-btn'));
  if (!buttons.length) return;

  function setMode(mode) {
    const isDeep = mode === 'deep';
    storyRoot.classList.toggle('is-deep', isDeep);
    storyFull.classList.toggle('is-visible', isDeep);

    buttons.forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  setMode('scan');
})();
