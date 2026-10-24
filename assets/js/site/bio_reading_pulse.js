(function () {
  const details = document.querySelector('.bio-story');
  if (!details) return;

  const progressBar = details.querySelector('[data-bio-progress-bar]');
  if (!progressBar) return;

  const content = details.querySelector('.spoiler-content');
  if (!content) return;

  const updateProgress = () => {
    if (!details.open) {
      progressBar.style.transform = 'scaleX(0)';
      return;
    }

    const scrollTop = content.scrollTop;
    const scrollHeight = content.scrollHeight - content.clientHeight;
    const progress = scrollHeight > 0 ? Math.min(scrollTop / scrollHeight, 1) : 0;
    progressBar.style.transform = `scaleX(${progress})`;
  };

  content.addEventListener('scroll', updateProgress, { passive: true });
  details.addEventListener('toggle', updateProgress);
  window.addEventListener('resize', updateProgress);

  updateProgress();
})();
