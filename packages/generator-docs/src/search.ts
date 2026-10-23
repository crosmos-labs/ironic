export const searchScript = `
const input = document.querySelector('#doc-search');
const results = document.querySelector('#search-results');
const root = document.body.dataset.root || '';
input?.addEventListener('input', () => {
  const query = input.value.trim().toLowerCase();
  results.replaceChildren();
  results.hidden = !query;
  if (!query) return;
  const matches = entries.filter((entry) =>
    (entry.title + ' ' + entry.detail).toLowerCase().includes(query)).slice(0, 12);
  if (!matches.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No results found';
    results.append(empty);
  }
  for (const entry of matches) {
    const link = document.createElement('a');
    link.href = root + entry.href;
    const title = document.createElement('strong');
    title.textContent = entry.title;
    const detail = document.createElement('small');
    detail.textContent = entry.detail;
    link.append(title, detail);
    results.append(link);
  }
});
input?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') results.querySelector('a')?.click();
  if (event.key === 'Escape') { input.value = ''; results.hidden = true; }
});
`;
