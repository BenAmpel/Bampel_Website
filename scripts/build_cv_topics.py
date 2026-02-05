import json
import math
import pathlib
import re

import pdfplumber
from sklearn.decomposition import NMF
from sklearn.feature_extraction import text as sklearn_text
from sklearn.feature_extraction.text import TfidfVectorizer


CV_PATH = pathlib.Path("static/uploads/cv.pdf")
OUTPUT_PATH = pathlib.Path("static/data/cv_topics.json")
PUBLICATIONS_PATH = pathlib.Path("static/data/publications.json")


def load_cv_text(path: pathlib.Path) -> str:
    if not path.exists():
        raise FileNotFoundError(f"Missing CV at {path}")
    with pdfplumber.open(path) as pdf:
        pages = [p.extract_text() or "" for p in pdf.pages]
    raw = "\n".join(pages)
    raw = raw.replace("\u00ad", "")
    raw = re.sub(r"\s+", " ", raw)
    # Remove years and numeric-heavy tokens
    raw = re.sub(r"\b(19|20)\d{2}\b", " ", raw)
    raw = re.sub(r"\b\d+\b", " ", raw)
    return raw


def extract_title_vocab_from_publications() -> set[str]:
    if not PUBLICATIONS_PATH.exists():
        return set()
    data = json.loads(PUBLICATIONS_PATH.read_text())
    if isinstance(data, dict):
        papers = data.get("individualPublications", [])
    else:
        papers = data
    titles = [p.get("title", "") for p in papers if isinstance(p, dict)]
    title_text = " ".join(titles)
    title_text = re.sub(r"\b(19|20)\d{2}\b", " ", title_text)
    title_text = re.sub(r"[^a-zA-Z ]+", " ", title_text)
    title_text = re.sub(r"\s+", " ", title_text).strip()
    tokens = re.findall(r"[a-zA-Z][a-zA-Z]+", title_text.lower())
    return set(tokens)


def split_documents(raw: str) -> list[str]:
    section_delims = re.compile(
        r"(Education|Research|Publications|Teaching|Service|Awards|Grants|Experience|Skills|Presentations|Talks|Press|Media)",
        re.I,
    )
    parts = []
    last = 0
    for match in section_delims.finditer(raw):
        if match.start() > last:
            parts.append(raw[last : match.start()])
        last = match.start()
    parts.append(raw[last:])

    docs = [p.strip() for p in parts if len(p.strip()) > 200]
    if len(docs) >= 6:
        return docs

    sentences = re.split(r"(?<=[.!?])\s+", raw)
    buffer: list[str] = []
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        buffer.append(sentence)
        if len(" ".join(buffer)) > 300:
            docs.append(" ".join(buffer))
            buffer = []
    if buffer:
        docs.append(" ".join(buffer))

    return docs


def build_topics(docs: list[str], title_vocab: set[str]) -> dict:
    custom_stop = {
        "university",
        "college",
        "school",
        "department",
        "assistant",
        "professor",
        "associate",
        "research",
        "publication",
        "publications",
        "paper",
        "papers",
        "journal",
        "conference",
        "workshop",
        "award",
        "awards",
        "teaching",
        "course",
        "courses",
        "grant",
        "grants",
        "experience",
        "service",
        "member",
        "chair",
        "reviewer",
        "editor",
        "students",
        "student",
        "phd",
        "ms",
        "bs",
        "b.s",
        "m.s",
        "u.s",
        "usa",
        "information",
        "systems",
        "system",
        "management",
        "business",
        "program",
        "programs",
        "education",
        "honors",
        "honor",
        "thesis",
        "dissertation",
        "presentations",
        "talks",
        "title",
        "presentation",
        "event",
        "round",
        "review",
        "year",
        "spring",
        "fall",
        "summer",
        "winter",
        "jan",
        "january",
        "feb",
        "february",
        "mar",
        "march",
        "apr",
        "april",
        "may",
        "jun",
        "june",
        "jul",
        "july",
        "aug",
        "august",
        "sep",
        "sept",
        "september",
        "oct",
        "october",
        "nov",
        "november",
        "dec",
        "december",
        "arizona",
        "georgia",
        "state",
        "benjamin",
        "ampel",
        "bampel",
        "gsu",
        "samtani",
        "chen",
        "nunamaker",
        "patton",
        "yang",
        "zhu",
        "lazarine",
        "ullman",
        "gao",
        "reyes",
        "hashim",
        "marx",
        "dacosta",
        "wagner",
        "vahedi",
        "otto",
        "ch",
        "ry",
        "jf",
        "misq",
        "isi",
        "icis",
        "amcis",
        "hicss",
        "kdd",
        "wisp",
        "indiana",
        "hawaii",
        "nashville",
        "tennessee",
        "arlington",
        "tucson",
        "phoenix",
        "austin",
        "atlanta",
        "panama",
        "barcelona",
        "charlotte",
        "san",
        "antonio",
        "washington",
        "shenzhen",
        "rochester",
        "bloomington",
        "maui",
        "state",
        "present",
        "mentor",
        "lecturer",
        "quarterly",
        "mis",
        "ieee",
        "acm",
        "sigmis",
        "robinson",
        "garcia",
        "yuan",
        "source",
        "duration",
        "role",
        "academic",
        "international",
        "unique",
        "best",
        "national",
        "conferences",
        "digital",
        "doctoral",
        "consortium",
    }
    stop_words = set(sklearn_text.ENGLISH_STOP_WORDS).union(custom_stop)
    title_vocab = {t for t in title_vocab if t not in stop_words and len(t) > 2}
    if not title_vocab:
        raise ValueError("No title vocabulary available to constrain topics.")

    vectorizer = TfidfVectorizer(
        stop_words=list(stop_words),
        max_df=0.9,
        min_df=1,
        ngram_range=(1, 1),
        token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z]+\b",
        vocabulary=sorted(title_vocab),
    )
    X = vectorizer.fit_transform(docs)
    terms = vectorizer.get_feature_names_out()

    n_docs, n_terms = X.shape
    if n_docs < 4 or n_terms < 10:
        raise ValueError("Not enough content to extract topics.")

    k_min = 4
    k_max = min(10, n_docs, n_terms - 1)

    best = None
    best_score = -1e9

    for k in range(k_min, k_max + 1):
        nmf = NMF(n_components=k, random_state=42, init="nndsvda", max_iter=400)
        W = nmf.fit_transform(X)
        H = nmf.components_
        err = nmf.reconstruction_err_
        top_n = 8
        top_terms = []
        for topic in H:
            idx = topic.argsort()[::-1][:top_n]
            top_terms.extend([terms[i] for i in idx])
        diversity = len(set(top_terms)) / (k * top_n)
        score = (diversity * 0.65) - (math.log(err + 1) * 0.35)
        if score > best_score:
            best_score = score
            best = (k, W, H)

    if best is None:
        raise ValueError("Failed to select topics.")

    k, W, H = best
    weights = W.sum(axis=0)
    total = weights.sum()
    weights = weights / total if total else weights

    topics = []
    for i, topic in enumerate(H):
        idx = topic.argsort()[::-1][:8]
        words = [terms[j] for j in idx]
        label = " / ".join([w.title() for w in words[:2]])
        topics.append(
            {
                "label": label,
                "keywords": words,
                "weight": float(weights[i]),
            }
        )

    topics.sort(key=lambda t: t["weight"], reverse=True)

    return {"k": k, "topics": topics, "source": str(CV_PATH.name)}


def main() -> None:
    raw = load_cv_text(CV_PATH)
    docs = split_documents(raw)
    title_vocab = extract_title_vocab_from_publications()
    data = build_topics(docs, title_vocab)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(data, indent=2))
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
