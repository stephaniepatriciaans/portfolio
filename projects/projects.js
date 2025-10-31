// /projects/projects.js
import { fetchJSON, renderProjects, updateProjectCount, BASE_PATH } from "../global.js";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

/* ----------------------------- DOM bootstrap ----------------------------- */
const projectsGrid = document.querySelector(".projects");
const titleEl = document.querySelector(".projects-title");

// Make sure pie + legend + search location above the grid
let pieContainer = document.querySelector(".pie-container");
if (!pieContainer) {
  pieContainer = document.createElement("div");
  pieContainer.className = "pie-container";
  pieContainer.innerHTML = `
    <svg id="projects-pie-plot" viewBox="-50 -50 100 100"></svg>
    <ul class="legend"></ul>
    <input class="searchBar" type="search" aria-label="Search projects" placeholder="🔍  Search projects…"/>
  `;
  projectsGrid?.parentElement?.insertBefore(pieContainer, projectsGrid);
}

const svg = d3.select("#projects-pie-plot");
const legendUL = d3.select(".legend");
const searchInput = document.querySelector(".searchBar");


if (!document.getElementById("lab5-inline-styles")) {
  const style = document.createElement("style");
  style.id = "lab5-inline-styles";
  style.textContent = `
    .pie-container{display:flex;gap:1.25rem;align-items:flex-start;flex-wrap:wrap;margin:1rem 0 0}
    #projects-pie-plot{max-width:22rem;min-width:260px;overflow:visible}
    .legend{display:grid;grid-template-columns:repeat(auto-fill,minmax(9em,1fr));gap:.75rem;list-style:none;padding:0;margin:0;flex:1}
    .legend li{display:flex;align-items:center;gap:.5rem;padding:.4rem .55rem;border:1px solid #e6eaff;border-radius:10px;background:var(--card)}
    .legend .swatch{display:inline-block;width:1rem;height:1rem;aspect-ratio:1;border-radius:4px;background:var(--color,#999)}
    .legend li.selected{outline:2px solid oklch(60% 0.2 250); outline-offset:2px}
    #projects-pie-plot path{cursor:pointer;transition:opacity .2s ease, transform .2s ease}
    .searchBar{margin-top:.5rem;flex-basis:100%;max-width:24rem;padding:.6rem .75rem;border-radius:10px;border:1px solid #d8e0ff;background:#f9fbff}
  `;
  document.head.appendChild(style);
}

/* --------------------------------- State --------------------------------- */
let ALL = [];
let query = "";
let selectedYear = null; 

// Respect URL hash (#YYYY) on load / change
const parseHashYear = () => {
  const yr = location.hash?.replace("#", "");
  selectedYear = /^\d{4}$/.test(yr) ? yr : null;
};
window.addEventListener("hashchange", () => {
  parseHashYear();
  renderAll(); 
});
parseHashYear();

/* ------------------------------- Data loading ---------------------------- */
(async function init() {
  if (!projectsGrid) {
    console.warn("[projects.js] .projects container not found");
    return;
  }

  projectsGrid.innerHTML = '<p class="muted">Loading projects…</p>';
  const data = await fetchJSON(`${BASE_PATH}lib/projects.json`);

  if (!Array.isArray(data)) {
    projectsGrid.innerHTML = `
      <p class="error">Could not load projects.json.</p>
      <p class="muted">Check that <code>/lib/projects.json</code> exists and is valid JSON.</p>
    `;
    return;
  }

  // Sort newest first by year
  ALL = [...data].sort((a, b) => (Number(b?.year) || 0) - (Number(a?.year) || 0));

  // Wire events
  searchInput?.addEventListener("input", (e) => {
    query = String(e.target.value || "");
    renderAll();
  });

  renderAll();
})();

/* --------------------------------- Utils --------------------------------- */
function normalizeText(x) {
  return String(x ?? "").toLowerCase();
}

function searchFilter(projects, q) {
  if (!q) return projects;
  const qnorm = normalizeText(q);
  return projects.filter((p) => {
    const values = Object.values(p).join("\n");
    return normalizeText(values).includes(qnorm);
  });
}

function yearFilter(projects, yr) {
  if (!yr) return projects;
  return projects.filter((p) => String(p?.year) === String(yr));
}

function filteredForPie() {
  return searchFilter(ALL, query);
}
function filteredForList() {
  return yearFilter(searchFilter(ALL, query), selectedYear);
}

function rolledYearCounts(projects) {
  // Sorted by year ascending
  const rolled = d3.rollups(projects, (v) => v.length, (d) => String(d.year));
  return rolled
    .map(([year, count]) => ({ label: year, value: count }))
    .sort((a, b) => Number(a.label) - Number(b.label));
}

/* ----------------------- Rendering: Cards + Title ------------------------ */
function renderCards() {
  const list = filteredForList();
  renderProjects(list, projectsGrid, "h2");
  updateProjectCount(list);

  if (titleEl) {
    const base = titleEl.dataset.baseText || "Projects";
    titleEl.dataset.baseText = base;
    if (selectedYear) {
      titleEl.textContent = `${base} – ${selectedYear} (${list.length})`;
    } else if (query) {
      titleEl.textContent = `${base} – Search: “${query}” (${list.length})`;
    } else {
      titleEl.textContent = `${base} (${list.length})`;
    }
  }
}

/* --------------------------- Rendering: Pie/Legend ----------------------- */
function renderPie() {
  const dataForPie = rolledYearCounts(filteredForPie());
  svg.selectAll("*").remove();
  legendUL.selectAll("*").remove();

  if (dataForPie.length === 0) {
    return;
  }

  // Custom color palette by year
  const colorMap = {
    "2023": "#C2F0FF", 
    "2024": "#C5D9FF",
    "2025": "#D9C2F0" 
  };

  // Ordinal scale that falls back to gray if a year is missing
  const colors = d3.scaleOrdinal()
    .domain(dataForPie.map(d => d.label))
    .range(dataForPie.map(d => colorMap[d.label] || "#ccc"));


  // PIE + ARCS
  const arcGenerator = d3.arc().innerRadius(0).outerRadius(48);
  const sliceGenerator = d3.pie().value((d) => d.value);
  const arcData = sliceGenerator(dataForPie);

  // Draw wedges
  const g = svg.append("g");
  const paths = g
    .selectAll("path")
    .data(arcData)
    .enter()
    .append("path")
    .attr("d", arcGenerator)
    .attr("fill", (d) => colors(d.data.label))
    .attr("data-year", (d) => d.data.label);

  // hover fade
  paths
    .on("mouseover", function (_, d) {
      const yr = d.data.label;
      paths.filter((p) => p.data.label !== yr).attr("opacity", 0.45);
    })
    .on("mouseout", function () {
      paths.attr("opacity", 1);
    });

  // click to (de)select year
  paths.on("click", (_, d) => toggleYear(d.data.label));

  // Legend
  const items = legendUL
    .selectAll("li")
    .data(dataForPie)
    .enter()
    .append("li")
    .style("--color", (d) => colors(d.label))
    .attr("data-year", (d) => d.label)
    .html((d) => `<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`);

  items.on("click", (_, d) => toggleYear(d.label));

  updateSelectionStyling();
}

function updateSelectionStyling() {
  const allPaths = svg.selectAll("path");
  const allItems = legendUL.selectAll("li");

  if (!selectedYear) {
    allPaths.attr("opacity", 1);
    allItems.classed("selected", false);
    return;
  }

  allPaths.attr("opacity", (d) => (d.data.label === selectedYear ? 1 : 0.45));
  allItems.classed("selected", (d) => d.label === selectedYear);
}

/* ------------------------------ Interactions ----------------------------- */
function toggleYear(yr) {
  selectedYear = selectedYear === yr ? null : yr;

  // keep URL hash in sync (nice for deep links)
  if (selectedYear) {
    history.replaceState(null, "", `#${selectedYear}`);
  } else {
    history.replaceState(null, "", location.pathname + location.search);
  }

  renderAll();
}

/* --------------------------------- Orchestrator -------------------------- */
function renderAll() {
  renderCards(); // uses search + year
  renderPie();   // uses search only
}
