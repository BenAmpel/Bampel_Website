/* Moved out of layouts/shortcodes/paper_diff.html so the site CSP can drop script-src 'unsafe-inline'. */
(() => {
const root = document.querySelector('[data-paper-diff]');
if (!root) return;

const normalizeBaseUrl = (url) => {
if (!url) return '';
if (url === '/') return '';
return url.endsWith('/') ? url.slice(0, -1) : url;
};

const baseUrl = normalizeBaseUrl(root.getAttribute('data-baseurl'));
const buildUrl = (path) => {
const clean = String(path || '').replace(/^\/+/, '');
return baseUrl ? `${baseUrl}/${clean}` : `/${clean}`;
};

const selectA = root.querySelector('[data-diff-select="a"]');
const selectB = root.querySelector('[data-diff-select="b"]');
const btnSwap = root.querySelector('[data-diff-swap]');
const btnRandom = root.querySelector('[data-diff-random]');

const stopwords = new Set([
'the','and','for','with','from','into','that','this','their','these','those','using','use','used','paper','study','approach','analysis','toward','towards','based','data','model','models','learning','system','systems','framework','research','information','security','cyber','threat','intelligence','towards','between','across','through','within','into','over','under','about','case'
]);

const tokenize = (text) => {
return (text || '')
.toLowerCase()
.replace(/[^a-z0-9\s]/g, ' ')
.split(/\s+/)
.filter(word => word.length > 3 && !stopwords.has(word));
};

const topTerms = (paper) => {
const tokens = tokenize(`${paper.title || ''} ${paper.abstract || ''}`);
const counts = new Map();
tokens.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
return Array.from(counts.entries())
.sort((a,b) => b[1] - a[1])
.slice(0, 8)
.map(entry => entry[0]);
};

const normalizeAuthor = (name) => (name || '').toLowerCase().replace(/\s+/g, ' ').trim();

const percentile = (arr, p) => {
if (!arr.length) return 0;
const sorted = arr.slice().sort((a,b) => a - b);
const idx = Math.floor((sorted.length - 1) * p);
return sorted[idx];
};

Promise.all([
loadPublications(),
fetch(buildUrl('data/dashboard_network.json')).then(r => r.ok ? r.json() : null)
]).then(([pubData, network]) => {
if (pubData && pubData.individualPublications) pubData = pubData.individualPublications;
const papers = Array.isArray(pubData) ? pubData : [];
if (!papers.length) return;

const centrality = (network && network.centrality && network.centrality.papers) ? network.centrality.papers : [];
const centralityMap = new Map();
centrality.forEach(item => {
if (item && item.title) centralityMap.set(item.title.toLowerCase(), item);
});

const eigenVals = centrality.map(c => c.eigen || 0);
const betweenVals = centrality.map(c => c.between || 0);
const degreeVals = centrality.map(c => c.degree || 0);
const thresholds = {
eigen: percentile(eigenVals, 0.75),
between: percentile(betweenVals, 0.75),
degree: percentile(degreeVals, 0.75)
};

const sortedPapers = papers.slice().sort((a,b) => (b.year || 0) - (a.year || 0));
const optionsHtml = sortedPapers.map((paper, index) => {
const label = `${paper.year || '—'} · ${paper.title}`;
return `<option value="${index}">${label}</option>`;
}).join('');

selectA.innerHTML = optionsHtml;
selectB.innerHTML = optionsHtml;
selectA.selectedIndex = 0;
selectB.selectedIndex = sortedPapers.length > 1 ? 1 : 0;

const getRoles = (paper) => {
const entry = centralityMap.get((paper.title || '').toLowerCase());
if (!entry) return ['—'];
const roles = [];
if (entry.eigen >= thresholds.eigen) roles.push('Influence');
if (entry.between >= thresholds.between) roles.push('Bridge');
if (entry.degree >= thresholds.degree) roles.push('Hub');
return roles.length ? roles : ['—'];
};

const renderChips = (container, items, uniqueSet) => {
if (!container) return;
if (!items.length) {
container.innerHTML = '<span class="paper-diff-chip is-muted">—</span>';
return;
}
container.innerHTML = items.map(item => {
const isUnique = uniqueSet && !uniqueSet.has(item.toLowerCase());
return `<span class="paper-diff-chip${isUnique ? ' is-unique' : ''}">${item}</span>`;
}).join('');
};

const updateCard = (card, paper, other) => {
if (!card) return;
const titleEl = card.querySelector('[data-diff-title]');
const metaEl = card.querySelector('[data-diff-meta]');
const linkEl = card.querySelector('[data-diff-link]');
if (titleEl) titleEl.textContent = paper.title || 'Untitled';
if (metaEl) metaEl.textContent = `${paper.year || '—'} · ${paper.venue || '—'}`;
if (linkEl) linkEl.href = paper.url ? paper.url : '#';

const otherAuthors = new Set((other.authors || []).map(normalizeAuthor));
const otherTerms = new Set(topTerms(other));

const roles = getRoles(paper);
renderChips(card.querySelector('[data-diff-role]'), roles, new Set());

const authors = (paper.authors || []).map(a => a.trim()).filter(Boolean);
renderChips(card.querySelector('[data-diff-authors]'), authors, otherAuthors);

const terms = topTerms(paper);
renderChips(card.querySelector('[data-diff-terms]'), terms, otherTerms);
};

const render = () => {
const a = sortedPapers[Number(selectA.value) || 0];
const b = sortedPapers[Number(selectB.value) || 0];
if (!a || !b) return;
updateCard(root.querySelector('[data-diff-card="a"]'), a, b);
updateCard(root.querySelector('[data-diff-card="b"]'), b, a);
};

selectA.addEventListener('change', render);
selectB.addEventListener('change', render);

btnSwap.addEventListener('click', () => {
const temp = selectA.value;
selectA.value = selectB.value;
selectB.value = temp;
render();
});

btnRandom.addEventListener('click', () => {
const max = sortedPapers.length;
if (max < 2) return;
let first = Math.floor(Math.random() * max);
let second = Math.floor(Math.random() * max);
while (second === first) second = Math.floor(Math.random() * max);
selectA.value = String(first);
selectB.value = String(second);
render();
});

render();
}).catch(() => {});
})();
