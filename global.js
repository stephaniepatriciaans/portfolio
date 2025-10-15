console.log('IT\'S ALIVE!');

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

// Detect if we're on localhost or GitHub Pages
const BASE_PATH = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  ? "/" 
  : "/portofolio/";

// Define all pages for automatic navigation
let pages = [
  { url: '', title: 'Home' },
  { url: 'projects/', title: 'Projects' },
  { url: 'contact/', title: 'Contact' },
  { url: 'cv/', title: 'CV' },
  { url: 'https://github.com/stephaniepatriciaans', title: 'GitHub' }
];

// ==================== DARK MODE SWITCHER ====================
document.body.insertAdjacentHTML(
  'afterbegin',
  `
  <label class="color-scheme">
    Theme:
    <select>
      <option value="light dark">Automatic</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>`
);

// ==================== AUTOMATIC NAVIGATION ====================
// Find existing nav or create new one
let nav = document.querySelector('.navbar nav');
if (!nav) {
  const header = document.querySelector('.navbar');
  if (header) {
    nav = document.createElement('nav');
    header.querySelector('.container')?.appendChild(nav) || header.appendChild(nav);
  }
}

if (nav) {
  // Clear existing navigation
  nav.innerHTML = '';
  
  // Add all pages to navigation
  for (let p of pages) {
    let url = p.url;
    let title = p.title;
    
    // Adjust URL for local vs GitHub Pages
    if (!url.startsWith('http')) {
      url = BASE_PATH + url;
    }
    
    // Create link element
    let a = document.createElement('a');
    a.href = url;
    a.textContent = title;
    
    // Highlight current page
    // Compare pathnames more carefully to handle trailing slashes
    let currentPath = location.pathname.replace(/\/$/, '');
    let linkPath = new URL(a.href).pathname.replace(/\/$/, '');
    
    if (a.host === location.host && linkPath === currentPath) {
      a.classList.add('current');
    }
    
    // Open external links in new tab
    if (a.host !== location.host) {
      a.target = "_blank";
      a.rel = "noopener";
    }
    
    nav.append(a);
  }
}

// ==================== DARK MODE FUNCTIONALITY ====================
const select = document.querySelector('.color-scheme select');

// Function to set color scheme
function setColorScheme(colorScheme) {
  document.documentElement.style.setProperty('color-scheme', colorScheme);
  if (select) {
    select.value = colorScheme;
  }
}

// Load saved preference on page load
if ("colorScheme" in localStorage) {
  setColorScheme(localStorage.colorScheme);
}

// Listen for changes and save preference
select?.addEventListener('input', function(event) {
  const colorScheme = event.target.value;
  setColorScheme(colorScheme);
  localStorage.colorScheme = colorScheme;
  console.log('Color scheme changed to:', colorScheme);
});

// ==================== BETTER CONTACT FORM ====================
const form = document.querySelector('form[action^="mailto:"]');

form?.addEventListener('submit', function(event) {
  event.preventDefault();
  
  // Get form data
  const data = new FormData(form);
  
  // Build URL with proper encoding
  let url = form.action;
  let params = [];
  
  for (let [name, value] of data) {
    if (value) { // Only add non-empty values
      params.push(`${name}=${encodeURIComponent(value)}`);
    }
  }
  
  if (params.length > 0) {
    url += '?' + params.join('&');
  }
  
  console.log('Opening email client with URL:', url);
  
  // Open email client with prefilled data
  location.href = url;
});