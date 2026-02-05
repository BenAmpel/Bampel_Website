(function () {
  const chipWrap = document.querySelector('[data-bio-chips]');
  if (!chipWrap) return;

  const storyFull = document.querySelector('[data-story-full]');
  const storyRoot = document.querySelector('[data-story-mode]');
  const storyButtons = storyRoot ? Array.from(storyRoot.querySelectorAll('.bio-story-btn')) : [];

  function setDeepDive() {
    if (!storyRoot || !storyButtons.length) return;
    const deepBtn = storyButtons.find((btn) => btn.dataset.mode === 'deep');
    if (deepBtn && !deepBtn.classList.contains('is-active')) {
      deepBtn.click();
    }
  }

  function flashTarget(target) {
    const highlightTarget = target.closest('p') || target;
    highlightTarget.classList.remove('bio-highlight-flash');
    void highlightTarget.offsetWidth;
    highlightTarget.classList.add('bio-highlight-flash');
  }

  chipWrap.addEventListener('click', (event) => {
    const chip = event.target.closest('.bio-chip');
    if (!chip) return;

    const selector = chip.getAttribute('data-target');
    if (!selector) return;

    setDeepDive();

    const target = document.querySelector(selector);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flashTarget(target);
  });
})();
