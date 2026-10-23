/** Apply a saved theme before CSS loads, falling back to the system preference. */
export const themeBootstrapScript = `
let savedTheme;
try { savedTheme = localStorage.getItem('ironic-docs-theme'); } catch {}
document.documentElement.dataset.theme = savedTheme === 'light' || savedTheme === 'dark'
  ? savedTheme
  : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
`;

export const themeScript = `
const themeToggle = document.querySelector('#theme-toggle');
const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
function updateThemeToggle() {
  if (!themeToggle) return;
  const dark = document.documentElement.dataset.theme === 'dark';
  themeToggle.textContent = dark ? '☀ Light mode' : '☾ Dark mode';
  themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  themeToggle.hidden = false;
}
themeToggle?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('ironic-docs-theme', next); } catch {}
  updateThemeToggle();
});
themeMedia.addEventListener('change', (event) => {
  let saved;
  try { saved = localStorage.getItem('ironic-docs-theme'); } catch {}
  if (saved === 'light' || saved === 'dark') return;
  document.documentElement.dataset.theme = event.matches ? 'dark' : 'light';
  updateThemeToggle();
});
updateThemeToggle();
`;
