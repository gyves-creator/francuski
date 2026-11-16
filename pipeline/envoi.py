"""Envoi du site (dossier public/) sur le VPS Windows par SFTP (OpenSSH, inclus dans Windows Server).

    FTP_SERVER=... FTP_USER=... FTP_PASSWORD=... python -m pipeline.envoi

N'envoie que les fichiers qui ont changé depuis le dernier envoi : la liste des empreintes du dernier envoi
est gardée sur le serveur (.manifeste-envoi.json). Les fichiers que le robot avait envoyés et qui n'existent plus
sont supprimés ; tout autre fichier présent sur le serveur est laissé tel quel.
"""
import hashlib
import json
import os
import posixpath
import sys
from pathlib import Path

import paramiko

RACINE = Path(__file__).resolve().parent.parent
PUBLIC = RACINE / "public"
MANIFESTE = ".manifeste-envoi.json"


def empreintes(dossier):
    res = {}
    for f in sorted(dossier.rglob("*")):
        if f.is_file():
            res[f.relative_to(dossier).as_posix()] = hashlib.sha1(f.read_bytes()).hexdigest()
    return res


def chemin_distant(dossier):
    """« C:\\sites\\francuski » ou « C:/sites/francuski » → « /C:/sites/francuski » (format OpenSSH Windows)."""
    d = dossier.strip().replace("\\", "/").rstrip("/")
    if len(d) >= 2 and d[1] == ":":
        d = "/" + d
    return d or "."


def creer_dossiers(sftp, chemin, deja):
    morceaux, courant = chemin.strip("/").split("/"), ""
    for m in morceaux:
        courant = (courant + "/" + m) if courant else ("/" + m if chemin.startswith("/") else m)
        if courant in deja:
            continue
        try:
            sftp.stat(courant)
        except IOError:
            sftp.mkdir(courant)
        deja.add(courant)


def main():
    hote = os.environ.get("FTP_SERVER", "").strip()
    user = os.environ.get("FTP_USER", "").strip()
    mdp = os.environ.get("FTP_PASSWORD", "")
    if not (hote and user and mdp):
        print("Envoi : secrets FTP_SERVER / FTP_USER / FTP_PASSWORD pas encore renseignés, rien n'est envoyé.")
        return 0   # pas une erreur : le site n'est simplement pas encore branché sur le VPS
    port = int(os.environ.get("FTP_PORT", "").strip() or 22)
    base = chemin_distant(os.environ.get("FTP_DOSSIER", "").strip() or "C:/sites/francuski")

    t = paramiko.Transport((hote, port))
    t.connect(username=user, password=mdp)
    sftp = paramiko.SFTPClient.from_transport(t)
    try:
        dossiers = set()
        creer_dossiers(sftp, base, dossiers)
        try:
            with sftp.open(posixpath.join(base, MANIFESTE), "r") as f:
                ancien = json.loads(f.read().decode("utf-8"))
        except (IOError, ValueError):
            ancien = {}
        nouveau = empreintes(PUBLIC)
        a_envoyer = [k for k, v in nouveau.items() if ancien.get(k) != v]
        a_supprimer = [k for k in ancien if k not in nouveau]
        print(f"Envoi : {len(a_envoyer)} fichier(s) à envoyer, {len(a_supprimer)} à supprimer, "
              f"{len(nouveau) - len(a_envoyer)} inchangé(s).")
        for i, rel in enumerate(a_envoyer, 1):
            dest = posixpath.join(base, rel)
            creer_dossiers(sftp, posixpath.dirname(dest), dossiers)
            sftp.put(str(PUBLIC / rel), dest)
            if i % 200 == 0:
                print(f"  … {i}/{len(a_envoyer)}")
        for rel in a_supprimer:
            try:
                sftp.remove(posixpath.join(base, rel))
            except IOError:
                pass
        # le manifeste est écrit en dernier : si l'envoi est interrompu, le prochain passage renverra ce qui manque
        with sftp.open(posixpath.join(base, MANIFESTE), "w") as f:
            f.write(json.dumps(nouveau).encode("utf-8"))
        print("Envoi terminé.")
    finally:
        sftp.close()
        t.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
