"""Test hors ligne : faux flux RSS + IA simulée, dans une copie du projet.

    python tests/simulation.py
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent
TMP = Path(tempfile.mkdtemp(prefix="lefil-test-"))
shutil.copytree(SRC, TMP / "p", ignore=shutil.ignore_patterns("public", ".git", "content", "state"))
P = TMP / "p"
(P / "content" / "articles").mkdir(parents=True)
(P / "state").mkdir()

now = datetime.now(timezone.utc)
SUJETS = {
    "salaire-travail": [("Le smic sera revalorisé au 1er janvier", "Le gouvernement a confirmé une hausse du salaire minimum au 1er janvier, a annoncé le ministère du Travail."),
                        ("Smic : revalorisation confirmée au 1er janvier", "Le salaire minimum augmentera au 1er janvier selon le ministère du Travail."),
                        ("Assurance chômage : les partenaires sociaux se réunissent", "Syndicats et patronat ouvrent une négociation sur les règles d'indemnisation.")],
    "immobilier": [("Crédit immobilier : les taux d'emprunt repartent à la baisse", "Les taux moyens des prêts immobiliers ont reculé en octobre pour la deuxième fois consécutive."),
                   ("Les taux de crédit immobilier baissent encore en octobre", "Nouvelle baisse des taux d'emprunt immobilier le mois dernier.")],
    "retraite": [("Retraites : les pensions Agirc-Arrco revalorisées", "Le conseil d'administration de l'Agirc-Arrco a voté une revalorisation des pensions complémentaires.")],
    "fiscalite": [("Budget 2027 : l'Assemblée vote la partie recettes", "Les députés ont adopté la première partie du projet de loi de finances pour 2027."),
                  ("Projet de loi de finances 2027 : vote de la partie recettes à l'Assemblée", "La partie recettes du budget 2027 a été adoptée par les députés.")],
    "aides-social": [("CAF : la prime d'activité versée plus tôt en décembre", "La Caisse d'allocations familiales avance la date de versement de la prime d'activité.")],
    "entreprise": [("Micro-entrepreneurs : l'URSSAF change le calendrier des déclarations", "Les micro-entrepreneurs devront déclarer leur chiffre d'affaires selon un nouveau calendrier.")],
    "auto": [("Carburant : les prix à la pompe reculent cette semaine", "Le prix du gazole et de l'essence baisse dans les stations-service.")],
    "placements": [("Livret A : le taux reste inchangé en février", "La Banque de France propose de maintenir le taux du Livret A.")],
}


def rss(media, items):
    corps = "".join(
        f"<item><title>{t}</title><description>{d}</description><link>https://{media}.example/{i}-{abs(hash(t))}</link>"
        f"<pubDate>{format_datetime(now - timedelta(minutes=30 + 7 * i))}</pubDate></item>"
        for i, (t, d) in enumerate(items)
    )
    return f'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>{media}</title>{corps}</channel></rss>'


cfg = (P / "config.yaml").read_text(encoding="utf-8")
for slug, items in SUJETS.items():
    fichiers = []
    for j, media in enumerate(["MediaA", "MediaB"]):
        f = TMP / f"{slug}-{media}.xml"
        f.write_text(rss(media, items[j::2] if len(items) > 1 else items), encoding="utf-8")
        fichiers.append(f"file://{f}")
    # remplace les flux de la rubrique par les faux flux
    cfg = re.sub(
        rf"(slug: {slug}\n(?:.*\n)*?    flux:\n)((?:      - .*\n)+)",
        lambda m: m.group(1) + "".join(f"      - {x}\n" for x in fichiers),
        cfg,
        count=1,
    )
(P / "config.yaml").write_text(cfg, encoding="utf-8")

env = {**os.environ, "LEFIL_SIMULATION": "1", "LEFIL_QUOTA": "10"}
print("=== Passage 1 ===")
subprocess.run([sys.executable, "-m", "pipeline.run"], cwd=P, env=env, check=True)
print("\n=== Passage 2 (doit éviter les doublons) ===")
subprocess.run([sys.executable, "-m", "pipeline.run"], cwd=P, env=env, check=True)
subprocess.run([sys.executable, "build.py"], cwd=P, env=env, check=True)
print("\nArticles :", sorted(p.name for p in (P / "content" / "articles").glob("*.json")))
print("Dossier de test :", P)
