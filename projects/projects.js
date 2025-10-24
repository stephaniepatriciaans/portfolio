import { fetchJSON, renderProjects, updateProjectCount, BASE_PATH } from '../global.js';

(async () => {
  const container = document.querySelector('.projects'); // target grid
  const titleEl   = document.querySelector('.projects-title'); // for count
  if (!container) {
    console.warn('[projects.js] .projects container not found');
    return;
  }

  container.innerHTML = '<p class="muted">Loading projects…</p>';
  const data = await fetchJSON(`${BASE_PATH}lib/projects.json`);

  if (!Array.isArray(data)) {
    container.innerHTML = `
      <p class="error">Could not load projects.json.</p>
      <p class="muted">Check that <code>/lib/projects.json</code> exists and is valid JSON.</p>
    `;
    return;
  }

  // Sort by year
  const projects = [...data].sort((a, b) => {
    const ya = Number(a?.year) || -Infinity;
    const yb = Number(b?.year) || -Infinity;
    return yb - ya;
  });

  // Render cards
  renderProjects(projects, container, 'h2');
  updateProjectCount(projects);

  const applyHashFilter = () => {
    const yr = location.hash?.slice(1);
    if (!yr) return;
    const filtered = projects.filter(p => String(p.year) === yr);
    renderProjects(filtered, container, 'h2');
    if (titleEl) titleEl.textContent = `Projects – ${yr} (${filtered.length})`;
  };
  window.addEventListener('hashchange', applyHashFilter);
  applyHashFilter();
})();
