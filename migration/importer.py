"""Reprise de l'ancien francuski.fr (Node + SQLite sur le VPS) dans le site statique.

    python migration/importer.py <pages_rendues> <donnees.json> <dossier_ancien_public>

- <pages_rendues> : chaque adresse du sitemap de l'ancien site, enregistrée telle que le serveur Node l'affichait
  (pages/simulateur-brut-net.html, pages/salaire/2000-euros-brut-en-net.html…).
- <donnees.json>  : export de lib/simulators.js, de la table « articles » et de rates.json.
- <dossier_ancien_public> : le dossier public/ de l'ancien site (scripts des simulateurs, images, ads.txt…).

Produit : content/simulateurs/*.json, content/pages/*.json, content/categories.json, content/rates.json,
legacy/ (scripts, images allégées, fichiers de vérification Google, ads.txt) et state/redirections.json.
Les adresses restent identiques ; seules deux adresses en double sont redirigées (301).
"""
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup
from PIL import Image

RACINE = Path(__file__).resolve().parent.parent
RENDU, DONNEES, PUBLIC = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
d = json.loads(DONNEES.read_text(encoding="utf-8"))

SIMS = {s["slug"]: s for s in d["SIMULATEURS"]}
CATS = {c["slug"]: c for c in d["CATEGORIES"]}

for dossier in ("content/simulateurs", "content/pages"):
    p = RACINE / dossier
    if p.exists():
        shutil.rmtree(p)
    p.mkdir(parents=True)


def lire(chemin):
    return BeautifulSoup((RENDU / chemin).read_text(encoding="utf-8"), "html.parser")


def tete(s):
    titre = s.title.get_text(strip=True) if s.title else ""
    m = s.find("meta", attrs={"name": "description"})
    schema = "".join(str(x) for x in s.find_all("script", attrs={"type": "application/ld+json"}))
    return titre, (m.get("content") or "").strip() if m else "", schema


_RE_CITATION = re.compile(r"[«\"“][^»\"”]{20,400}[»\"”]\s*,?\s*(?:[-–—]\s*[A-ZÉ]|(?:a |aurait )?(?:déclar|soulign|expliqu|affirm|précis|indiqu|estim|rappel|confi)\w*)")


def retirer_citations(html, url):
    """Les anciens articles (IA sans sources) contiennent des citations inventées, parfois attribuées à des personnes
    réelles : on retire chaque paragraphe ou encadré qui en contient une. Le reste de l'article est inchangé."""
    s = BeautifulSoup(html, "html.parser")
    for el in s.find_all(["blockquote", "p", "li"]):
        if el.find_parent("blockquote"):
            continue
        if el.name == "blockquote" or _RE_CITATION.search(el.get_text(" ", strip=True)):
            print(f"  citation retirée ({url}) : {el.get_text(' ', strip=True)[:90]}…")
            el.decompose()
    return str(s)


def nettoyer(html):
    html = re.sub(r"\n\s+", "\n", html)
    # les images PNG très lourdes de l'ancien site sont servies en JPEG (voir convertir_images)
    return re.sub(r'(/images/uploads/[^"\']+)\.png', r"\1.jpg", html)


# ── 1. Simulateurs et pages de calcul : même adresse, même contenu ──────────
n = 0
for f in sorted((RENDU / "pages").rglob("*.html")):
    rel = "/" + f.relative_to(RENDU / "pages").with_suffix("").as_posix()
    if rel in ("/_accueil", "/actualite") or rel.startswith(("/actualite/", "/categorie/")):
        continue
    slug = rel.strip("/")
    if slug in SIMS:
        sim, genre, rub = SIMS[slug], "simulateur", SIMS[slug]["categorie"]
        nom = re.sub(r"\s*20\d\d$", "", sim["titre"])
        desc_courte = sim["description"]
    elif rel.startswith("/salaire/"):
        genre, rub = "calcul", "salaire-travail"
        nom, desc_courte = re.sub(r"-euros-brut-en-net", "", slug.split("/")[-1]) + " € brut en net", ""
    elif rel.startswith("/aides/apl/"):
        genre, rub = "calcul", "aides-social"
        nom, desc_courte = "APL pour " + re.sub(r"\D", "", slug) + " € de loyer", ""
    elif rel.startswith("/immobilier/credit/"):
        genre, rub = "calcul", "immobilier"
        nom, desc_courte = "Emprunter " + f"{int(re.sub(r'[^0-9]', '', slug)):,}".replace(",", " ") + " €", ""
    else:
        continue  # pages légales et ancien article : traités plus bas
    s = lire(f.relative_to(RENDU))
    titre, description, schema = tete(s)
    main = s.select_one(".sim-main")
    h1 = main.find("h1").get_text(" ", strip=True)
    x = {"url": rel, "nom": nom, "h1": h1, "title": titre, "description": description, "rubrique": rub,
         "genre": genre, "html": nettoyer(main.decode_contents()), "head": schema}
    if desc_courte:
        x["description_courte"] = desc_courte
    if genre == "simulateur":
        x["ordre"] = list(SIMS).index(slug)
    nom_fichier = slug.replace("/", "__")
    (RACINE / "content" / "simulateurs" / f"{nom_fichier}.json").write_text(
        json.dumps(x, ensure_ascii=False, indent=1), encoding="utf-8")
    n += 1
print(f"{n} simulateurs et pages de calcul repris")

# ── 2. Catégories : titres et textes d'origine ──────────────────────────────
cats = {}
for slug, c in CATS.items():
    s = lire(f"pages/categorie/{slug}.html")
    titre, description, _ = tete(s)
    cats[slug] = {"h1": c["label"], "intro": c["description"], "title": titre, "description": description}
(RACINE / "content" / "categories.json").write_text(json.dumps(cats, ensure_ascii=False, indent=1), encoding="utf-8")

# ── 3. Anciens articles : même adresse, nouveau design ──────────────────────
CANONIQUE_HORS_ACTU = {"rachat-credit-entre-particuliers": "/rachat-credit-entre-particuliers"}
RUB_ANCIENNE = {"crédit": "", None: "aides-social"}
n = 0
for a in d["arts"]:
    rub = a["category"] if a["category"] in CATS else RUB_ANCIENNE.get(a["category"], "")
    date = datetime.strptime(a["created_at"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).isoformat()
    corps = re.sub(r"^\s*<article>|</article>\s*$", "", a["content"].strip())
    corps = re.sub(r"^\s*<h1>.*?</h1>", "", corps, flags=re.S)  # le titre est déjà affiché
    url = CANONIQUE_HORS_ACTU.get(a["slug"], f"/actualite/{a['slug']}")
    s = lire(f"pages{url}.html")
    titre, description, _ = tete(s)
    x = {"url": url, "titre": a["title"], "title": titre, "description": description or (a["excerpt"] or ""),
         "chapeau": a["excerpt"] or "", "corps": nettoyer(retirer_citations(corps, url)), "rubrique": rub, "date": date,
         "image": nettoyer(a["image_url"]) if a["image_url"] else None, "image_alt": a["title"], "ia": True}
    (RACINE / "content" / "pages" / f"{a['slug']}.json").write_text(json.dumps(x, ensure_ascii=False, indent=1), encoding="utf-8")
    n += 1
print(f"{n} anciens articles repris")

# ── 4. Taux des simulateurs ─────────────────────────────────────────────────
(RACINE / "content" / "rates.json").write_text(json.dumps(d["rates"], ensure_ascii=False, indent=2), encoding="utf-8")

# ── 5. Fichiers repris tels quels ──────────────────────────────────────────
LEG = RACINE / "legacy"
(LEG / "js").mkdir(parents=True, exist_ok=True)
for f in (PUBLIC / "js").glob("simulateurs-*.js"):
    shutil.copy(f, LEG / "js" / f.name)
for f in PUBLIC.glob("*.html"):          # fichiers de vérification (Google Search Console…)
    shutil.copy(f, LEG / f.name)
shutil.copy(PUBLIC / "ads.txt", LEG / "ads.txt")


def convertir_images():
    """Images de 2 à 3,5 Mo (PNG) → JPEG 1200 px (≈ 150 Ko). L'ancienne adresse .png redirige vers le .jpg."""
    dest = LEG / "images" / "uploads"
    dest.mkdir(parents=True, exist_ok=True)
    k = 0
    for f in sorted((PUBLIC / "images" / "uploads").glob("*.png")):
        cible = dest / (f.stem + ".jpg")
        if cible.exists():
            continue
        im = Image.open(f).convert("RGB")
        im.thumbnail((1200, 1200))
        im.save(cible, "JPEG", quality=82, optimize=True, progressive=True)
        k += 1
    print(f"{k} images converties")


convertir_images()

# ── 6. Redirections : uniquement les doublons ───────────────────────────────
redir = [["/rachat-credit-entre-particuliers.php", "/rachat-credit-entre-particuliers"],
         ["/actualite/rachat-credit-entre-particuliers", "/rachat-credit-entre-particuliers"]]
(RACINE / "state" / "redirections.json").write_text(json.dumps(redir, ensure_ascii=False, indent=1), encoding="utf-8")
print("Terminé.")
