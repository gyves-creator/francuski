# francuski.fr — publication 100 % automatique

Même système que libelille.fr, adapté à francuski.fr :

- **le robot** (GitHub Actions) lit l'actualité **toutes les heures**, fait rédiger les articles par une IA gratuite
  (Groq, puis Gemini en secours), trouve une **vraie photo** et publie **environ 10 articles par jour** ;
- **les brèves** du « fil » sont ajoutées à chaque passage (toutes les 30 minutes) ;
- **8 rubriques**, les mêmes que les simulateurs : Salaire & Travail, Immobilier, Retraite, Fiscalité, Aides & Social,
  Entreprise, Auto, Placements. Chaque article renvoie vers les simulateurs de sa rubrique (« Faites le calcul ») ;
- **les simulateurs, les pages de calcul et les anciens articles** gardent **la même adresse** ;
- le site est **statique** (de simples fichiers), envoyé sur ton **VPS Windows** par **SFTP**, et servi par Nginx.
  Plus de Node, de PM2, de Claude payant ni de DALL-E pour francuski.

Coût : **0 €** (hors nom de domaine et VPS que tu gardes de toute façon).

---

## Mise en ligne (une seule fois)

### 1. Ouvrir l'envoi sécurisé (SFTP) sur le VPS
Sur le VPS, ouvre **PowerShell en administrateur** et colle, bloc par bloc :

```powershell
# a) Le serveur SFTP inclus dans Windows Server
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
```

```powershell
# b) Un utilisateur réservé au robot, qui ne peut écrire QUE dans le dossier du site
$mdp = Read-Host -AsSecureString "Choisis un mot de passe pour le robot"
New-LocalUser -Name "francuski-envoi" -Password $mdp -PasswordNeverExpires
New-Item -ItemType Directory C:\sites\francuski -Force
icacls C:\sites\francuski /grant "francuski-envoi:(OI)(CI)M"
```

```powershell
# c) Ce compte ne peut faire QUE des envois de fichiers (pas de commandes)
Add-Content C:\ProgramData\ssh\sshd_config "`r`nMatch User francuski-envoi`r`n    ForceCommand internal-sftp`r`n    AllowTcpForwarding no`r`n"
Restart-Service sshd
```

> Si le pare-feu réseau OVH (« Network Firewall ») est activé sur l'IP du VPS, autorise le port **22**.

### 2. Donner les accès au robot (secrets GitHub)
Dans le dépôt **francuski** : **Settings → Secrets and variables → Actions → New repository secret** :

| Nom | Valeur |
|---|---|
| `GROQ_API_KEY` | ta clé Groq (la même que libelille) |
| `GEMINI_API_KEY` | ta clé Gemini (la même que libelille) |
| `PIXABAY_API_KEY` | ta clé Pixabay (la même que libelille) |
| `FTP_SERVER` | l'adresse IP du VPS |
| `FTP_USER` | `francuski-envoi` |
| `FTP_PASSWORD` | le mot de passe choisi à l'étape 1 b |
| `FTP_DOSSIER` | `C:/sites/francuski` |

### 3. Premier envoi (sans toucher au site en ligne)
**Actions → Publication automatique → Run workflow**, mets **`0`**, puis **Run**.
Le site est construit et copié dans `C:\sites\francuski` sur le VPS. Le site en ligne ne change pas encore :
Nginx envoie toujours les visiteurs vers l'ancien site Node.

### 4. Basculer Nginx sur le nouveau site
1. Sauvegarde : copie `C:\nginx\conf\nginx.conf` en `nginx.conf.avant-francuski`.
2. Dans `nginx.conf`, remplace les blocs `server { … }` de **francuski.fr** (ceux qui font `proxy_pass` vers Node)
   par le contenu du fichier **`state/nginx-francuski.conf`** du dépôt (il contient aussi les redirections des anciennes adresses).
   Ne touche pas aux blocs de geek-space.
3. Vérifie puis recharge :
   ```powershell
   cd C:\nginx
   .\nginx.exe -t
   .\nginx.exe -s reload
   ```
4. Vérifie https://www.francuski.fr, un simulateur, un ancien article.
   En cas de problème : remets `nginx.conf.avant-francuski` et refais `.\nginx.exe -s reload`.

### 5. Arrêter l'ancienne publication payante
```powershell
Disable-ScheduledTask -TaskName "Francuski-AutoPost"
pm2 stop francuski
pm2 save
```
Garde le dossier `C:\projets\francuski` quelques semaines, par sécurité.
Le site geek-space n'est pas concerné.

### 6. Lancer le robot
Relance **Run workflow** avec **`3`** : trois articles sont publiés tout de suite. Ensuite tout est automatique.

### 7. Prévenir Google
Dans **Search Console** → **Sitemaps** : ajoute `https://www.francuski.fr/sitemap.xml` et `https://www.francuski.fr/news-sitemap.xml`.

### 8. Publicité, statistiques, mentions légales
- `config.yaml` : renseigne `adsense_client` (ca-pub-…) et `ga4` (G-…).
- **AdSense → Confidentialité et messages** : active le message de consentement européen (RGPD).
- Complète les champs `[À COMPLÉTER]` des pages légales (`content/statiques/`).

---

## Comment le robot travaille

- **Horaires** (`config.yaml`, bloc `creneaux`) : 6 h-7 h, 11 h-12 h, 16 h-17 h et 20 h, juste avant les pics de lecture.
- **Sources** : Google Actualités (recherche par thème) et les rubriques économie de grands médias.
  Au premier lancement, regarde le journal (onglet Actions) : un flux marqué ✗ peut être remplacé dans `config.yaml`.
- **Rédaction** : uniquement les faits des dépêches ; jamais « selon tel média » (noms masqués pour l'IA, puis contrôle) ;
  jamais de source inventée ; conditionnel si non confirmé ; montants et taux seulement s'ils sont dans les dépêches ;
  distinction voté / proposé / envisagé ; aucun conseil d'investissement ; neutralité politique ; contrôle de la langue.
- **Photos** : jamais d'article sans photo (sinon il n'est pas publié), jamais deux fois la même photo.
  D'abord une vraie photo du sujet (Wikipédia / Wikimedia Commons), puis Pixabay, puis les photos par défaut de la rubrique.
  Pas de tableaux, cartes, graphiques, logos ni marques concurrentes (liste dans `config.yaml`, bloc `photos`).
  Requêtes Wikimedia espacées (1 par seconde) avec un robot identifié.
- **Accueil** : la une = le sujet le plus repris par les médias, avec photo ; à côté, le fil avec les brèves repliables.

## Au quotidien
- **Réglages** : `config.yaml` (nombre d'articles, rubriques, flux, simulateurs proposés).
- **Supprimer un article** : supprime son fichier dans `content/articles/`.
- **Suivre le robot** : onglet **Actions** de GitHub.
- **Augmenter le rythme** : passe `articles_par_jour` à 15, puis 20, et ajoute des créneaux.
