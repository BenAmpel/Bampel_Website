/* Funding list: sort by newest or largest award and filter by role. The list is complete without this script. */
(() => {
  const list = document.getElementById('gx-list');
  const bar = document.getElementById('gx-toolbar');
  const status = document.getElementById('gx-status');
  if (!list || !bar) return;
  const items = Array.from(list.children);
  const state = { sort: 'newest', role: 'all' };

  const press = (attr, value) => {
    bar.querySelectorAll(`[${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value)));
  };

  const apply = () => {
    const sorted = items.slice().sort((a, b) => (state.sort === 'largest'
      ? Number(b.dataset.amount) - Number(a.dataset.amount)
      : Number(a.dataset.order) - Number(b.dataset.order)));
    sorted.forEach((li) => list.appendChild(li));
    let shown = 0;
    items.forEach((li) => {
      const on = state.role === 'all' || li.dataset.role === state.role;
      li.hidden = !on;
      if (on) shown += 1;
    });
    status.textContent = `Showing ${shown} of ${items.length}`;
  };

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.gxSort) { state.sort = btn.dataset.gxSort; press('data-gx-sort', state.sort); }
    if (btn.dataset.gxRole) { state.role = btn.dataset.gxRole; press('data-gx-role', state.role); }
    apply();
  });

  bar.hidden = false;
  apply();
})();
