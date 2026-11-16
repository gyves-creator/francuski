"""Génère le site statique francuski.fr dans public/.

    python build.py

Sources :
  content/articles/*.json      actualité (robot)
  content/breves/*.json        brèves du fil (robot)
  content/pages/*.json         anciens articles /actualite/... repris dans le nouveau design (adresse inchangée)
  content/simulateurs/*.json   simulateurs et pages de calcul de l'ancien site (adresse inchangée)
  content/statiques/*.html     pages à propos, mentions légales, confidentialité, cookies, contact
  legacy/                      fichiers copiés tels quels (scripts des simulateurs, images, ads.txt…)

Adresses : sans barre finale (/actualite/mon-article), comme l'ancien site. Chaque page est écrite dans
<adresse>/index.html ; Nginx la sert sans redirection (try_files $uri $uri/index.html), voir state/nginx-francuski.conf.
"""
import html
import json
import os
import re
import shutil
from collections import defaultdict
from datetime import datetime, timedelta
from email.utils import format_datetime

import markdown

from pipeline.util import RACINE, charger_config, heure_locale, lire_json, maintenant, tous_les_articles

SORTIE = RACINE / "public"
MOIS = "janvier février mars avril mai juin juillet août septembre octobre novembre décembre".split()
MOIS_ABR = "janv. févr. mars avr. mai juin juil. août sept. oct. nov. déc.".split()
JOURS = "lundi mardi mercredi jeudi vendredi samedi dimanche".split()

cfg = charger_config()
SITE = cfg["site"]
RUBS = {r["slug"]: r for r in cfg["rubriques"]}
DOMAINE = (SITE.get("domaine") or "").strip().strip("/")
URL_SITE = f"https://{DOMAINE}" if DOMAINE else os.environ.get("LEFIL_SITE_URL", "").rstrip("/")
PREFIXE = SITE.get("prefixe_articles", "/actualite/")
e = html.escape


def absolu(chemin):
    return f"{URL_SITE}{chemin}" if URL_SITE else chemin


def dt(iso):
    return datetime.fromisoformat(iso)


def date_courte(iso):
    d = heure_locale(cfg, dt(iso))
    return f"{d.day} {MOIS_ABR[d.month - 1]} {d.year}"


def date_longue(iso, heure=True):
    d = heure_locale(cfg, dt(iso))
    s = f"{JOURS[d.weekday()]} {d.day} {MOIS[d.month - 1]} {d.year}"
    return s + (f" à {d:%Hh%M}" if heure else "")


def nom_rub(slug):
    return RUBS.get(slug, {"nom": slug.replace("-", " ").capitalize()})["nom"]


def url_de(x):
    return x.get("url") or f"{PREFIXE}{x['slug']}"


def url_rub(slug):
    return f"/categorie/{slug}"


# ── Chargement des contenus repris de l'ancien site ─────────────────────

def charger_dossier(nom):
    res = []
    for f in sorted((RACINE / "content" / nom).glob("*.json")):
        x = lire_json(f, None)
        if x:
            res.append(x)
    return res


# ── Briques HTML ─────────────────────────────────────────────────────────

def visuel(x):
    p = x.get("photo")
    src = p["url"] if p else x.get("image")
    if src:
        return f'<div class="visuel"><img src="{e(src)}" alt="" loading="lazy" decoding="async"></div>'
    return f'<div class="visuel visuel-vide r-{e(x.get("rubrique", ""))}"><span>{e(nom_rub(x.get("rubrique", "")))}</span></div>'


def carte(x, variante="", avec_visuel=True):
    rub = x.get("rubrique", "")
    date = x.get("publie_le") or x.get("date")
    quand = f'<time datetime="{e(date)}">{date_courte(date)}</time>' if date else ""
    if date and x.get("type", "actu") == "actu":
        quand = f'<time datetime="{e(date)}">{date_courte(date)}, {heure_locale(cfg, dt(date)):%Hh%M}</time>'
    chapeau = f'<p class="chapeau">{e(x["chapeau"])}</p>' if variante in ("une", "large") and x.get("chapeau") else ""
    return f"""<article class="carte {variante}"><a href="{e(url_de(x))}" class="carte-lien">
{visuel(x) if avec_visuel else ''}<div class="carte-texte"><span class="etiquette r-{e(rub)}">{e(nom_rub(rub))}</span>
<h3>{e(x['titre'])}</h3>{chapeau}{quand}</div></a></article>"""


def tete_pub():
    s = ""
    if SITE.get("adsense_client"):
        s += (f'<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='
              f'{e(SITE["adsense_client"])}" crossorigin="anonymous"></script>\n')
    if SITE.get("ga4"):
        s += (f'<script async src="https://www.googletagmanager.com/gtag/js?id={e(SITE["ga4"])}"></script>'
              f"<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}"
              f"gtag('js',new Date());gtag('config','{e(SITE['ga4'])}');</script>\n")
    return s


def page(titre, contenu, description="", canonique="/", extra_head="", rub_active="", titre_exact=None, scripts=""):
    nav = "".join(
        f'<a href="{url_rub(r)}"{" class=actif" if r == rub_active else ""}>{e(v["nom"])}</a>' for r, v in RUBS.items())
    nav += f'<a href="/actualite"{" class=actif" if rub_active == "actualite" else ""}>Actualité</a>'
    titre_complet = titre_exact or (f"{titre} — {SITE['nom']}" if titre != SITE["nom"] else f"{SITE['nom']} — {SITE['slogan']}")
    return f"""<!DOCTYPE html>
<html lang="{SITE['langue']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titre_complet)}</title>
<meta name="description" content="{e((description or SITE['slogan'])[:300])}">
<link rel="canonical" href="{e(absolu(canonique))}">
<link rel="alternate" type="application/rss+xml" title="{e(SITE['nom'])}" href="/rss.xml">
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#1e3a5f">
{tete_pub()}{extra_head}
</head>
<body>
<header class="bandeau">
  <div class="bandeau-haut">
    <a href="/" class="logo"><span class="logo-f">F</span><span>{e(SITE['nom'])}<span class="point">.fr</span></span></a>
    <span class="slogan">{e(SITE['slogan'])}</span>
    <span class="date-jour" id="date-jour"></span>
  </div>
  <nav class="rubriques"><a href="/"{" class=actif" if rub_active == "une" else ""}>Accueil</a>{nav}</nav>
</header>
<main>
{contenu}
</main>
<footer class="pied">
  <a href="/" class="logo petit"><span class="logo-f">F</span><span>{e(SITE['nom'])}<span class="point">.fr</span></span></a>
  <nav>{nav}</nav>
  <nav class="legal"><a href="/a-propos">À propos</a><a href="/contact">Contact</a><a href="/mentions-legales">Mentions légales</a><a href="/confidentialite">Confidentialité</a><a href="/cookies">Cookies</a><a href="/rss.xml">RSS</a><a href="/sitemap.xml">Plan du site</a></nav>
  <p>Les résultats des simulateurs sont des estimations indicatives : pour un calcul officiel, adressez-vous à l'organisme concerné ou à un professionnel.<br>
  © {heure_locale(cfg).year} {e(SITE['nom'])}.fr · Photos : Wikimedia Commons (licences libres), <a href="https://pixabay.com/fr/" rel="nofollow noopener">Pixabay</a>.</p>
</footer>
<script>(function(){{try{{document.getElementById('date-jour').textContent=new Date().toLocaleDateString('fr-FR',{{weekday:'long',day:'numeric',month:'long',year:'numeric'}});}}catch(_){{}}}})();</script>
{scripts}</body>
</html>"""


def ecrire(chemin, contenu):
    """/actualite/x → public/actualite/x/index.html ; /rss.xml → public/rss.xml"""
    rel = chemin.strip("/")
    f = SORTIE / rel if "." in rel.rsplit("/", 1)[-1] else SORTIE / rel / "index.html"
    if not rel:
        f = SORTIE / "index.html"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(contenu, encoding="utf-8")


def jsonld(type_, titre, description, url, date=None, image=None, section=None):
    d = {"@context": "https://schema.org", "@type": type_, "headline": titre[:110], "description": description or "",
         "inLanguage": "fr", "mainEntityOfPage": absolu(url),
         "author": {"@type": "Organization", "name": f"{SITE['nom']}.fr"},
         "publisher": {"@type": "Organization", "name": f"{SITE['nom']}.fr",
                       "logo": {"@type": "ImageObject", "url": absolu("/logo-512.png")}}}
    if date:
        d["datePublished"] = d["dateModified"] = date
    if image:
        d["image"] = [image if image.startswith("http") else absolu(image)]
    if section:
        d["articleSection"] = section
    return f'<script type="application/ld+json">{json.dumps(d, ensure_ascii=False)}</script>'


def og(titre, description, image=None, type_="article"):
    s = (f'<meta property="og:title" content="{e(titre)}">\n<meta property="og:description" content="{e(description or "")}">\n'
         f'<meta property="og:type" content="{type_}">\n<meta property="og:site_name" content="{e(SITE["nom"])}.fr">')
    if image:
        s += f'\n<meta property="og:image" content="{e(image if image.startswith("http") else absolu(image))}">'
    return s


def bloc_simulateurs(slug, titre="Faites le calcul", sims=None):
    sims = sims if sims is not None else (RUBS.get(slug, {}).get("simulateurs") or simulateurs_de(slug))
    if not sims:
        return ""
    items = "".join(f'<li><a href="{e(s["url"])}"><span class="ico">=</span>{e(s["nom"])}</a></li>' for s in sims[:6])
    return f'<aside class="bloc-calcul"><h2>{e(titre)}</h2><ul>{items}</ul></aside>'


SIMULATEURS = []   # rempli dans main() : [{nom, url, rubrique, description}]


def simulateurs_de(slug):
    """Simulateurs d'une catégorie : ceux de l'ancien site s'ils sont chargés, sinon ceux de config.yaml."""
    liste = sorted((s for s in SIMULATEURS if s.get("rubrique") == slug and s.get("genre") == "simulateur"),
                   key=lambda s: s.get("ordre", 999))
    return liste or RUBS.get(slug, {}).get("simulateurs", [])


def charger_breves(heures=30):
    limite = maintenant() - timedelta(hours=heures)
    tout = []
    for f in sorted((RACINE / "content" / "breves").glob("*.json"))[-2:]:
        tout += lire_json(f, [])
    return [b for b in tout if dt(b["publie_le"]) >= limite]


def identite_site():
    d = [{"@context": "https://schema.org", "@type": "WebSite", "name": f"{SITE['nom']}.fr", "alternateName": DOMAINE,
          "url": absolu("/"), "inLanguage": "fr"},
         {"@context": "https://schema.org", "@type": "Organization", "name": f"{SITE['nom']}.fr", "url": absolu("/"),
          "logo": {"@type": "ImageObject", "url": absolu("/logo-512.png"), "width": 512, "height": 512}}]
    return "".join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n' for x in d)


# ── Pages ────────────────────────────────────────────────────────────────

def choisir_une(actus):
    """La une : parmi les articles des 12 dernières heures AVEC photo, le sujet le plus repris par les médias
    (grande actualité nationale), puis le plus récent."""
    limite = maintenant() - timedelta(hours=12)
    recents = [a for a in actus[:15] if dt(a["publie_le"]) >= limite] or actus[:8]
    avec_photo = [a for a in recents if a.get("photo")] or [a for a in actus if a.get("photo")][:1] or recents
    return max(avec_photo, key=lambda a: (a.get("importance", 1), dt(a["publie_le"]).timestamp()))


def page_accueil(actus):
    if actus:
        une = choisir_une(actus)
        suite = [a for a in actus if a is not une][:4]
        elements = [(a["publie_le"], "article", a) for a in actus[:15]]
        elements += [(b["publie_le"], "breve", b) for b in charger_breves()]
        elements.sort(key=lambda x: x[0], reverse=True)
        lignes = []
        for quand, genre, x in elements[:12]:
            h = f'<time>{heure_locale(cfg, dt(quand)):%Hh%M}</time>'
            if genre == "article":
                lignes.append(f'<li>{h}<a href="{e(url_de(x))}">{e(x["titre"])}</a></li>')
            else:
                lignes.append(f'<li class="breve">{h}<details><summary>{e(x["titre"])}</summary>'
                              f'<p>{e(x["texte"])}</p></details></li>')
        haut = f"""<section class="une-zone"><div class="une-principale">{carte(une, 'une')}</div>
<div class="une-secondaires">{''.join(carte(a, 'compacte') for a in suite)}</div>
<aside class="fil-direct"><h2 class="titre-section">Le fil</h2><ol>{''.join(lignes)}</ol>
<p><a class="voir-tout" href="/actualite">Toute l'actualité →</a></p></aside></section>"""
    else:
        haut = '<section class="vide"><h1>Les premiers articles arrivent…</h1><p>Le robot publie l\'actualité de votre argent dès ce matin.</p></section>'
    # Les simulateurs, par catégorie
    cats = "".join(
        f'<div class="cat-sim"><h3><a href="{url_rub(slug)}">{e(r["nom"])}</a></h3><ul>'
        + "".join(f'<li><a href="{e(s["url"])}">{e(s["nom"])}</a></li>' for s in simulateurs_de(slug)[:5])
        + f'</ul><a class="voir-tout" href="{url_rub(slug)}">Tous les calculs →</a></div>'
        for slug, r in RUBS.items())
    blocs = [f'<section class="bloc-rubrique simulateurs"><h2 class="titre-section">Nos simulateurs gratuits</h2><div class="grille-sim">{cats}</div></section>']
    salaires = [s for s in SIMULATEURS if s.get("url", "").startswith("/salaire/")]
    if salaires:
        salaires.sort(key=lambda s: int("".join(c for c in s["url"] if c.isdigit()) or 0))
        blocs.append('<section class="bloc-rubrique"><h2 class="titre-section">Salaire brut en net par montant</h2><div class="tag-cloud">'
                     + "".join(f'<a href="{e(s["url"])}">{e(s["nom"].replace(" en net", ""))}</a>' for s in salaires) + "</div></section>")
    for slug, r in RUBS.items():
        liste = [a for a in actus if a["rubrique"] == slug][:4]
        if liste:
            blocs.append(f'<section class="bloc-rubrique"><h2 class="titre-section"><a href="{url_rub(slug)}">{e(r["nom"])}</a></h2>'
                         f'<div class="grille">{"".join(carte(a) for a in liste)}</div></section>')
    ecrire("/", page(SITE["nom"], haut + "".join(blocs), canonique="/", rub_active="une", extra_head=identite_site(),
                     titre_exact=SITE.get("titre_accueil")))


def page_categorie(slug, actus, anciens):
    r = RUBS[slug]
    ancienne = CATEGORIES_ANCIENNES.get(slug, {})
    contenu = f'<h1 class="titre-rubrique">{e(ancienne.get("h1") or r["nom"])}</h1>'
    if ancienne.get("intro"):
        contenu += f'<div class="intro">{ancienne["intro"]}</div>'
    sims = simulateurs_de(slug)
    if sims:
        contenu += '<h2 class="titre-section">Les simulateurs</h2><div class="grille-liens">' + "".join(
            f'<a class="lien-sim" href="{e(s["url"])}"><strong>{e(s["nom"])}</strong>'
            + (f'<span>{e(s["description_courte"])}</span>' if s.get("description_courte") else "") + "</a>" for s in sims) + "</div>"
    calculs = [s for s in SIMULATEURS if s.get("rubrique") == slug and s.get("genre") == "calcul"]
    calculs.sort(key=lambda s: int("".join(c for c in s["url"] if c.isdigit()) or 0))
    if calculs:
        contenu += ('<h2 class="titre-section">Calculs tout faits</h2><div class="simulateur-nu"><div class="tag-cloud">'
                    + "".join(f'<a href="{e(s["url"])}">{e(s["nom"])}</a>' for s in calculs) + "</div></div>")
    liste = [a for a in actus if a["rubrique"] == slug]
    if liste:
        contenu += f'<h2 class="titre-section">L\'actualité {e(r["nom"])}</h2><div class="grille grille-rubrique">{"".join(carte(a) for a in liste[:60])}</div>'
    vieux = [p for p in anciens if p.get("rubrique") == slug]
    if vieux:
        contenu += '<h2 class="titre-section">Dossiers</h2><ul class="liste-simple">' + "".join(
            f'<li><a href="{e(url_de(p))}">{e(p["titre"])}</a></li>' for p in vieux) + "</ul>"
    desc = ancienne.get("description") or f"{r['nom']} : simulateurs gratuits et actualité"
    ecrire(url_rub(slug), page(r["nom"], contenu, desc, url_rub(slug), rub_active=slug, titre_exact=ancienne.get("title")))


def page_actualite(actus, anciens):
    contenu = '<h1 class="titre-rubrique">Actualité</h1><p class="intro">L\'actualité de votre argent : salaire, logement, retraite, impôts, aides, entreprise, auto et épargne.</p>'
    if actus:
        contenu += f'<div class="grille grille-rubrique">{"".join(carte(a) for a in actus[:90])}</div>'
    if anciens:
        contenu += '<h2 class="titre-section">Nos dossiers</h2><ul class="liste-simple">' + "".join(
            f'<li><a href="{e(url_de(p))}">{e(p["titre"])}</a></li>' for p in anciens) + "</ul>"
    ecrire("/actualite", page("Actualité", contenu, "Toute l'actualité de votre argent", "/actualite", rub_active="actualite"))


def mention():
    return f'<aside class="mention-ia">{e(SITE["mention_ia"])}</aside>'


def bloc_lire_aussi(x, actus):
    autres = [y for y in actus if y["rubrique"] == x.get("rubrique") and url_de(y) != url_de(x)][:3]
    if not autres:
        return ""
    return (f'<section class="bloc-rubrique a-lire"><h2 class="titre-section">À lire aussi</h2>'
            f'<div class="grille">{"".join(carte(y) for y in autres)}</div></section>')


def page_article(a, actus):
    rub = a["rubrique"]
    p = a.get("photo")
    url = url_de(a)
    figure = ""
    if p:
        lic = f'<a href="{e(p["licence_url"])}" rel="license nofollow">{e(p["licence"])}</a>' if p.get("licence_url") else e(p.get("licence", ""))
        figure = (f'<figure class="photo-article"><img src="{e(p["url"])}" alt="{e(p.get("legende") or a["titre"])}">'
                  f'<figcaption>{e(p.get("legende", ""))} <span class="credit">Photo : {e(p["credit"])} · {lic} · '
                  f'<a href="{e(p["page"])}" rel="nofollow">{e(p.get("source", "Wikimedia Commons"))}</a></span></figcaption></figure>')
    corps = markdown.markdown(html.escape(a["corps"], quote=False), extensions=["sane_lists"])
    contenu = f"""<article class="article"><header>
<a class="etiquette r-{e(rub)}" href="{url_rub(rub)}">{e(nom_rub(rub))}</a>
<h1>{e(a['titre'])}</h1><p class="chapeau">{e(a['chapeau'])}</p>
<p class="meta">Publié le <time datetime="{a['publie_le']}">{date_longue(a['publie_le'])}</time></p></header>
{figure}<div class="texte">{corps}</div>{bloc_simulateurs(rub)}{mention()}</article>{bloc_lire_aussi(a, actus)}"""
    img = p["url"] if p else None
    head = jsonld("NewsArticle", a["titre"], a["chapeau"], url, a["publie_le"], img, nom_rub(rub)) + og(a["titre"], a["chapeau"], img)
    ecrire(url, page(a["titre"], contenu, a["chapeau"], url, head, rub_active=rub))


def avertissement_ancien(p):
    if not p.get("date"):
        return ""
    return (f'<aside class="avertissement">Article publié le {date_longue(p["date"], heure=False)}. Montants, taux et règles '
            'ont pu changer depuis : vérifiez votre situation sur <a href="https://www.service-public.fr" rel="nofollow">service-public.fr</a> '
            'ou auprès de l\'organisme concerné.</aside>')


def page_ancienne(p, actus):
    """Ancien article /actualite/... : même adresse, même texte, nouveau design."""
    url = url_de(p)
    rub = p.get("rubrique", "")
    img = p.get("image")
    figure = f'<figure class="photo-article"><img src="{e(img)}" alt="{e(p.get("image_alt") or p["titre"])}"></figure>' if img else ""
    meta = f'<p class="meta">Publié le {date_longue(p["date"], heure=False)}</p>' if p.get("date") else ""
    etiquette = f'<a class="etiquette r-{e(rub)}" href="{url_rub(rub)}">{e(nom_rub(rub))}</a>' if rub in RUBS else ""
    chapeau = f'<p class="chapeau">{e(p["chapeau"])}</p>' if p.get("chapeau") else ""
    contenu = f"""<article class="article">{etiquette}<header><h1>{e(p['titre'])}</h1>{chapeau}{meta}</header>
{figure}<div class="texte">{p['corps']}</div>{avertissement_ancien(p)}{bloc_simulateurs(rub) if rub in RUBS else ''}{mention() if p.get("ia") else ''}</article>{bloc_lire_aussi(p, actus)}"""
    desc = p.get("description") or html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", p["corps"]))).strip()[:160]
    head = jsonld("Article", p["titre"], desc, url, p.get("date"), img, nom_rub(rub) if rub in RUBS else None) + og(p["titre"], desc, img)
    ecrire(url, page(p["titre"], contenu, desc, url, head, rub_active=rub, titre_exact=p.get("title")))


def page_simulateur(s):
    """Simulateur ou page de calcul de l'ancien site : même adresse, même contenu, dans le nouveau cadre."""
    url = s["url"]
    rub = s.get("rubrique", "")
    ariane = (f'<p class="fil-ariane"><a href="/">Accueil</a> › <a href="{url_rub(rub)}">{e(nom_rub(rub))}</a> › {e(s.get("h1") or s["nom"])}</p>'
              if rub in RUBS else "")
    actus_rub = [a for a in ACTUS if a["rubrique"] == rub][:3]
    lies = (f'<section class="bloc-rubrique a-lire"><h2 class="titre-section">L\'actualité {e(nom_rub(rub))}</h2>'
            f'<div class="grille">{"".join(carte(a) for a in actus_rub)}</div></section>') if actus_rub else ""
    contenu = f'{ariane}<div class="simulateur">{s["html"]}</div>{lies}'
    head = s.get("head", "") + (og(s.get("h1") or s["nom"], s.get("description", ""), type_="website"))
    ecrire(url, page(s.get("h1") or s["nom"], contenu, s.get("description", ""), url, head, rub_active=rub,
                     titre_exact=s.get("title"), scripts=SCRIPTS_SIM))


SCRIPTS_SIM = "".join(f'<script src="/js/simulateurs-{x}.js"></script>\n' for x in
                      ("salaire", "immobilier", "retraite", "fiscalite", "aides", "entreprise", "auto", "placements"))
SCRIPTS_SIM = '<script src="/js/rates.js"></script>\n' + SCRIPTS_SIM + '<script src="/sim.js"></script>\n'


def page_statiques():
    dossier = RACINE / "content" / "statiques"
    defaut = {
        "a-propos": ("À propos", f"""<p class="chapeau">{e(SITE['nom'])}.fr propose des simulateurs financiers gratuits et l'actualité de votre argent : salaire, logement, retraite, impôts, aides, entreprise, auto et épargne.</p>
<h2>Comment sont produits nos articles</h2><p>Les articles d'actualité sont préparés à l'aide d'une intelligence artificielle à partir d'informations recoupées entre plusieurs sources publiques, et le signalent explicitement. Les montants et taux cités sont ceux connus à la date de publication.</p>
<h2>Nos simulateurs</h2><p>Les résultats sont des estimations indicatives, calculées à partir des barèmes publics. Pour un calcul officiel, adressez-vous à l'organisme concerné (impots.gouv.fr, caf.fr, info-retraite.fr…) ou à un professionnel.</p>"""),
        "mentions-legales": ("Mentions légales", "<p>[À COMPLÉTER] Éditeur du site, directeur de la publication, hébergeur, contact.</p>"),
        "confidentialite": ("Politique de confidentialité", "<p>[À COMPLÉTER]</p>"),
        "cookies": ("Cookies", "<p>Ce site utilise des cookies de mesure d'audience (Google Analytics) et de publicité (Google AdSense), déposés uniquement avec votre accord via le bandeau de consentement.</p>"),
        "contact": ("Contact", "<p>Une erreur, une remarque ? Écrivez-nous : nous corrigerons rapidement.</p>"),
    }
    for slug, (titre, corps) in defaut.items():
        f = dossier / f"{slug}.html"
        meta = lire_json(dossier / f"{slug}.json", {})
        if f.exists():
            corps = f.read_text(encoding="utf-8")
        titre = meta.get("h1", titre)
        ecrire(f"/{slug}", page(titre, f'<article class="article statique"><h1>{e(titre)}</h1><div class="texte">{corps}</div></article>',
                                meta.get("description", ""), f"/{slug}", titre_exact=meta.get("title")))
    (SORTIE / "404.html").write_text(page("Page introuvable", '<section class="vide"><h1>Page introuvable</h1><p><a href="/">Retour à l\'accueil</a></p></section>'), encoding="utf-8")


# ── Redirections, flux, plans de site ────────────────────────────────────

def nginx(redirections):
    """Configuration Nginx à installer une seule fois sur le VPS (voir README)."""
    q = lambda s: s.replace('"', '\\"')  # noqa: E731
    redir = "\n".join(f'    location = "{q(a)}" {{ return 301 {b}; }}' for a, b in redirections)
    conf = f"""# francuski.fr — site statique généré par GitHub Actions (remplace le proxy vers Node/PM2).
# Généré par build.py : à copier dans la configuration Nginx du VPS (voir README, étape « Nginx »).

server {{
    listen 80;
    server_name francuski.fr www.francuski.fr;
    return 301 https://www.francuski.fr$request_uri;
}}

server {{
    listen 443 ssl;
    server_name francuski.fr;
    ssl_certificate     C:/nginx/conf/francuski.fr-chain.pem;
    ssl_certificate_key C:/nginx/conf/francuski.fr-key.pem;
    return 301 https://www.francuski.fr$request_uri;
}}

server {{
    listen 443 ssl;
    server_name www.francuski.fr;
    ssl_certificate     C:/nginx/conf/francuski.fr-chain.pem;
    ssl_certificate_key C:/nginx/conf/francuski.fr-key.pem;

    root C:/sites/francuski;
    index index.html;
    charset utf-8;
    error_page 404 /404.html;

    # fichiers internes (liste d'envoi du robot…) : pas d'accès
    location ~ /\\.(?!well-known) {{ deny all; }}

    # adresses sans barre finale : /actualite/mon-article → actualite/mon-article/index.html
    location = / {{
        try_files /index.html =404;
    }}
    location / {{
        try_files $uri $uri/index.html =404;
    }}
    # adresse avec barre finale → sans barre (une seule adresse par page)
    rewrite ^/(.+)/$ /$1 permanent;

    # anciennes images (PNG très lourdes) désormais servies en JPEG
    location ~ ^/images/uploads/(.+)\\.png$ {{ return 301 /images/uploads/$1.jpg; }}
    location ^~ /admin {{ return 410; }}
    location ^~ /api/ {{ return 410; }}
    location ~* \\.(?:css|js|jpg|jpeg|png|webp|svg|ico|woff2?)$ {{
        expires 7d;
        try_files $uri =404;
    }}

    # anciennes adresses déplacées
{redir}
}}
"""
    (RACINE / "state" / "nginx-francuski.conf").write_text(conf, encoding="utf-8")


def flux_et_sitemaps(actus, anciens, sims):
    items = "".join(
        f"""<item><title>{e(a['titre'])}</title><link>{e(absolu(url_de(a)))}</link><guid>{e(absolu(url_de(a)))}</guid>
<pubDate>{format_datetime(dt(a['publie_le']))}</pubDate><category>{e(nom_rub(a['rubrique']))}</category>
<description>{e(a['chapeau'])}</description></item>""" for a in actus[:50])
    ecrire("/rss.xml", f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>{e(SITE['nom'])}.fr</title><link>{e(absolu('/'))}</link>
<description>{e(SITE['slogan'])}</description><language>fr-fr</language>{items}</channel></rss>""")

    def url_xml(u, lastmod=None):
        lm = f"<lastmod>{lastmod if 'T' in str(lastmod) else str(lastmod)[:10]}</lastmod>" if lastmod else ""
        return f"<url><loc>{e(absolu(u))}</loc>{lm}</url>"
    dernier = actus[0]["publie_le"] if actus else None
    urls = [url_xml("/", dernier), url_xml("/actualite", dernier)] + [url_xml(url_rub(s)) for s in RUBS]
    urls += [url_xml(s["url"]) for s in sims]
    urls += [url_xml(url_de(a), a["publie_le"]) for a in actus]
    urls += [url_xml(url_de(p), p.get("date")) for p in anciens]
    urls += [url_xml(f"/{s}") for s in ("a-propos", "contact", "mentions-legales", "confidentialite", "cookies")]
    ecrire("/sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
           + "".join(urls) + "</urlset>")
    limite = maintenant() - timedelta(hours=48)
    news = "".join(
        f"""<url><loc>{e(absolu(url_de(a)))}</loc><news:news><news:publication><news:name>{e(SITE['nom'])}</news:name>
<news:language>fr</news:language></news:publication><news:publication_date>{a['publie_le']}</news:publication_date>
<news:title>{e(a['titre'])}</news:title></news:news></url>""" for a in actus if dt(a["publie_le"]) >= limite)
    ecrire("/news-sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
           'xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">' + news + "</urlset>")
    ecrire("/robots.txt", f"User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: {absolu('/sitemap.xml')}\n"
                          f"Sitemap: {absolu('/news-sitemap.xml')}\n")


ACTUS = []
CATEGORIES_ANCIENNES = {}


def main():
    if SORTIE.exists():
        shutil.rmtree(SORTIE)
    SORTIE.mkdir()
    if (RACINE / "legacy").exists():
        shutil.copytree(RACINE / "legacy", SORTIE, dirs_exist_ok=True)
    for f in (RACINE / "static").iterdir():
        shutil.copy(f, SORTIE / f.name)

    taux = lire_json(RACINE / "content" / "rates.json", None)
    if taux:
        (SORTIE / "js").mkdir(exist_ok=True)
        (SORTIE / "js" / "rates.js").write_text("window.RATES = " + json.dumps(taux, ensure_ascii=False) + ";\n", encoding="utf-8")

    actus = tous_les_articles()
    for a in actus:
        a["type"] = "actu"
    ACTUS[:] = actus
    anciens = charger_dossier("pages")
    anciens.sort(key=lambda p: p.get("date") or "", reverse=True)
    sims = charger_dossier("simulateurs")
    SIMULATEURS[:] = sims
    CATEGORIES_ANCIENNES.update(lire_json(RACINE / "content" / "categories.json", {}))

    page_accueil(actus)
    for slug in RUBS:
        page_categorie(slug, actus, anciens)
    page_actualite(actus, anciens)
    for a in actus:
        page_article(a, actus)
    for p in anciens:
        page_ancienne(p, actus)
    for s in sims:
        page_simulateur(s)
    page_statiques()
    redirections = lire_json(RACINE / "state" / "redirections.json", [])
    nginx(redirections)
    flux_et_sitemaps(actus, anciens, sims)
    print(f"Site généré : {len(actus)} actus, {len(anciens)} anciens articles, {len(sims)} simulateurs/pages de calcul, "
          f"{len(redirections)} redirections → {SORTIE}")


if __name__ == "__main__":
    main()
