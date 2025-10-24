import { fetchJSON, renderProjects, fetchGitHubData } from './global.js';

(async () => {
  // latest 3
  const all = await fetchJSON('./lib/projects.json');
  const latest = Array.isArray(all) ? all.slice(0, 3) : [];
  const container = document.querySelector('.projects');
  renderProjects(latest, container, 'h3');

  // GitHub stats
  const stats = document.querySelector('#profile-stats');
  if (stats) {
    const data = await fetchGitHubData('stephaniepatriciaans');
    stats.innerHTML = data ? `
      <h2>GitHub Profile</h2>
      <dl class="grid-stats">
        <dt>Public Repos</dt><dd>${data.public_repos}</dd>
        <dt>Public Gists</dt><dd>${data.public_gists}</dd>
        <dt>Followers</dt><dd>${data.followers}</dd>
        <dt>Following</dt><dd>${data.following}</dd>
      </dl>
    ` : '<p class="muted">Unable to load GitHub stats.</p>';
  }
})();