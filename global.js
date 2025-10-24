// ==================== BOOT ====================
console.log("IT'S ALIVE!");

// Small utility: $$ = querySelectorAll → Array
export function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

// Detect location --> localhost or GitHub Pages
export const BASE_PATH =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1") ? "/" : "/portofolio/";

// Automatic navigation
const pages = [
  { url: "",            title: "Home" },
  { url: "projects/",   title: "Projects" },
  { url: "contact/",    title: "Contact" },
  { url: "cv/",         title: "CV" },
  { url: "https://github.com/stephaniepatriciaans", title: "GitHub" }
];

// ==================== THEME SWITCHER ====================
document.body.insertAdjacentHTML(
  "afterbegin",
  `
  <label class="color-scheme" style="position:sticky;top:0;display:inline-flex;gap:.5rem;align-items:center;padding:.5rem .75rem;z-index:50">
    Theme:
    <select>
      <option value="light dark">Automatic</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>`
);

const select = document.querySelector(".color-scheme select");

function setColorScheme(colorScheme) {
  // Set the CSS property recognized by UA + CSS
  document.documentElement.style.setProperty("color-scheme", colorScheme);

  // Add/remove data-theme for CSS selectors
  if (colorScheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (colorScheme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }

  if (select) select.value = colorScheme;
  console.log("Color scheme set to:", colorScheme);
}

// Load saved preference on page load
if ("colorScheme" in localStorage) {
  setColorScheme(localStorage.colorScheme);
}

// Listen for changes and save preference
select?.addEventListener("input", (event) => {
  const colorScheme = event.target.value;
  setColorScheme(colorScheme);
  localStorage.colorScheme = colorScheme;
});

// ==================== AUTOMATIC NAVIGATION ====================
(function buildNav() {
  let nav = document.querySelector(".navbar nav");
  if (!nav) {
    const header = document.querySelector(".navbar");
    if (header) {
      nav = document.createElement("nav");
      (header.querySelector(".container")?.appendChild(nav)) || header.appendChild(nav);
    }
  }

  if (!nav) return;

  nav.innerHTML = ""; // Clear
  for (const p of pages) {
    let url = p.url;
    if (!url.startsWith("http")) {
      url = BASE_PATH + url;
    }
    const a = document.createElement("a");
    a.href = url;
    a.textContent = p.title;

    // Highlight current page
    const currentPath = location.pathname.replace(/\/$/, "");
    const linkPath = new URL(a.href).pathname.replace(/\/$/, "");
    if (a.host === location.host && linkPath === currentPath) {
      a.classList.add("current");
    }

    // External links → new tab
    if (a.host !== location.host) {
      a.target = "_blank";
      a.rel = "noopener";
    }

    nav.append(a);
  }
})();

// ==================== CONTACT (mailto:) ENHANCER ====================
const form = document.querySelector('form[action^="mailto:"]');
form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  let url = form.action;
  const params = [];

  for (const [name, value] of data) {
    if (value) params.push(`${name}=${encodeURIComponent(value)}`);
  }
  if (params.length > 0) url += "?" + params.join("&");

  console.log("Opening email client with URL:", url);
  location.href = url;
});

/**
 * Fetch JSON safely with nice errors.
 * @param {string} url
 * @returns {Promise<any|null>}
 */
export async function fetchJSON(url) {
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error("Error fetching/parsing JSON:", err);
    return null; // callers should handle null
  }
}

/**
 * @param {Array<object>} projects
 * @param {HTMLElement} container
 * @param {"h1"|"h2"|"h3"|"h4"|"h5"|"h6"} heading
 */
export function renderProjects(projects, container, heading = "h2") {
  if (!container) return;

  container.innerHTML = "";
  if (!Array.isArray(projects) || projects.length === 0) {
    container.innerHTML = '<p class="muted">No projects yet.</p>';
    return;
  }

  const allowed = new Set(["h1","h2","h3","h4","h5","h6"]);
  const H = allowed.has(heading) ? heading : "h2";

  for (const p of projects) {
    const art = document.createElement("article");
    art.className = "card";

    const title = p?.title ?? "Untitled";
    const href  = p?.href || null;
    const img   = p?.image ?? "/portofolio/images/me.png";
    const desc  = p?.description ?? "";
    const pts   = Array.isArray(p?.points) ? p.points : null;
    const stack = p?.stack ?? "";

    // Title but make sure --> linked if href provided
    const headingMarkup = `<${H}>${title}</${H}>`;
    const titleBlock = href
      ? `<a href="${href}" target="_blank" rel="noopener">${headingMarkup}</a>`
      : headingMarkup;

    art.innerHTML = `
      ${titleBlock}
      ${img ? `<img src="${img}" alt="${title}">` : ""}
      ${desc ? `<p>${desc}</p>` : ""}
      ${pts ? `<ul>${pts.map(li => `<li>${li}</li>`).join("")}</ul>` : ""}
      ${stack ? `<p class="tech-stack">Tech Stack: ${stack}</p>` : ""}
    `;

    container.appendChild(art);
  }
}

/**
 * @param {Array<object>} projects
 */
export function updateProjectCount(projects) {
  const el = document.querySelector(".projects-title");
  if (!el) return;
  const base = el.dataset.baseText || el.textContent.trim();
  el.dataset.baseText = base;
  el.textContent = `${base} (${Array.isArray(projects) ? projects.length : 0})`;
}

/**
 * @param {string} username
 */
export async function fetchGitHubData(username) {
  return fetchJSON(`https://api.github.com/users/${username}`);
}