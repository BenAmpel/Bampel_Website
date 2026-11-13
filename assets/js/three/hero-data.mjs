// Turns a publication list into hero data: one node per paper, grouped by research thread, with links between papers
// that share co-authors. Works with both author formats the site uses: a list of full names ("Sagar Samtani") and the
// CCAIR string ("Ampel, B.M., Samtani, S., ...").
const SELF = /^ampel$/i;
const INITIALS = /^([A-Z][a-z]?\.?[\s-]*)+$/;

function key(surname, given) {
  return `${surname.toLowerCase().replace(/[^a-zÀ-ɏ-]/g, '')}:${(given || '').trim().charAt(0).toLowerCase()}`;
}

export function authorKeys(authors) {
  const out = [];
  if (Array.isArray(authors)) {
    authors.forEach((name) => {
      const parts = String(name).replace(/\*/g, '').trim().split(/\s+/);
      if (!parts[0]) return;
      const surname = parts[parts.length - 1];
      if (!SELF.test(surname)) out.push(key(surname, parts[0]));
    });
    return out;
  }
  // "Surname, I.I., Surname, I., and Surname, I."
  const tokens = String(authors || '').replace(/\band\b|&/g, ',').split(',').map((t) => t.trim()).filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    const surname = tokens[i];
    const next = tokens[i + 1];
    const given = next && INITIALS.test(next) ? next : '';
    if (given) i += 1;
    if (!SELF.test(surname)) out.push(key(surname, given));
  }
  return out;
}

const WEIGHT = { journal: 1, conference: 0.6, workshop: 0.4 };

// rules: [{ group, re }] tried in order on the title, then on the abstract. assign: { url: group } wins over rules.
export function fromPublications(pubs, { rules = [], assign = {}, defaultGroup = 0, minShared = 2, maxLinks = 160 } = {}) {
  const classify = (p) => {
    const hit = (text) => rules.find((r) => r.re.test(text || ''));
    if (p.url && assign[p.url] != null) return assign[p.url];
    const r = hit(p.title) || hit(p.abstract);
    return r ? r.group : defaultGroup;
  };
  const nodes = pubs.map((p) => ({
    group: classify(p),
    year: +p.year || 0,
    weight: Math.min(1.3, (WEIGHT[p.type] || 0.5) + (p.award ? 0.3 : 0)),
    authors: authorKeys(p.authors),
  }));
  const links = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const a = new Set(nodes[i].authors);
    for (let j = i + 1; j < nodes.length; j += 1) {
      let shared = 0;
      for (const k of nodes[j].authors) if (a.has(k)) shared += 1;
      if (shared >= minShared) links.push([i, j, shared]);
    }
  }
  links.sort((x, y) => y[2] - x[2]);
  return { nodes: nodes.map(({ group, year, weight }) => ({ group, year, weight })), links: links.slice(0, maxLinks).map(([i, j]) => [i, j]) };
}
