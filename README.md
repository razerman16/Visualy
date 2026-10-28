# Screnzly

Plateforme d’affichage dynamique auto-hébergée pour un réseau local : une administration web, un lecteur plein écran par appareil, une API et PostgreSQL. Le logiciel fonctionne sans compte cloud ni service externe à l’exécution. Le téléchargement initial des images Docker et des dépendances nécessite Internet ; les images peuvent ensuite être transportées vers un serveur isolé.

## Démarrer sur votre serveur

Prérequis : Docker Engine avec Docker Compose v2, ou Docker Desktop avec les conteneurs Linux sous Windows/macOS. Point de départ conseillé : 4 cœurs, 6 Go de RAM et de l’espace disque adapté aux médias. Les performances vidéo dépendent aussi de chaque lecteur.

Depuis ce dossier :

```sh
sh scripts/init-env.sh
# Configurer ADMIN_DOMAIN et PLAYER_DOMAIN dans .env et dans votre DNS local.
docker compose up -d --build --wait
docker compose ps
```

Sous Windows, exécutez ces commandes depuis WSL ou Git Bash. Le script crée un fichier `.env` local avec un mot de passe PostgreSQL aléatoire ; il préserve un fichier existant. Ne commitez pas ce fichier.

Les noms par défaut sont `https://admin.scenzly.home.arpa` et `https://player.scenzly.home.arpa`. Faites-les pointer vers le serveur sur votre DNS local et approuvez l’autorité de certification Caddy sur chaque poste/lecteur. Voir [HTTPS local](docs/deployment.md#https-local-et-cache-hors-connexion).

L’installation du premier administrateur exige la **clé SETUP_TOKEN** stockée dans `.env`, à consulter localement sur le serveur. Elle n’est plus possible avec le seul accès réseau. Après création du premier compte, l’installation est fermée. PostgreSQL, l’API et le convertisseur ne publient aucun port sur l’hôte.

**Mise à jour d’une installation existante :** suivre [la migration de sécurité](docs/security/hardening.md) avant de redémarrer. HTTPS devient obligatoire par défaut et le compte DB applicatif change ; les données des volumes sont conservées.

## Premier programme

Les sélecteurs en haut de l’interface permettent de choisir le thème **clair, sombre ou système**, ainsi que la langue **français ou anglais**. Ces préférences sont mémorisées dans le navigateur, séparément pour l’administration et le lecteur. Les noms de vos médias et le contenu des scènes restent inchangés. Voir [le guide de l’interface](docs/interface.md).

1. Importez une image JPEG, PNG ou WebP, ou une vidéo MP4/WebM lisible par vos navigateurs.
2. Créez une scène ou assemblez les médias dans un programme. Réglez les durées, puis publiez le programme.
3. Ouvrez le lecteur sur l’écran à associer et recopiez son code dans l’administration.
4. Affectez un programme de secours à cet écran. Ajoutez une campagne datée ou récurrente si nécessaire.
5. Laissez le lecteur ouvert en plein écran. Les modifications publiées sont récupérées automatiquement.

Les programmes publiés conservent une révision figée : modifier un brouillon ne change pas immédiatement ce qui est diffusé. Republiez pour appliquer une nouvelle version. Un écran sans contenu affiche un visuel de secours intégré.

## HTTPS et fonctionnement hors connexion

HTTPS et le proxy Caddy local sont activés par défaut, sans service cloud. Le cache hors connexion nécessite un certificat approuvé par chaque appareil. L’override `compose.https.yaml` reste accepté pour les anciennes commandes.

Le mode HTTP de développement doit être demandé explicitement avec `-f compose.yaml -f compose.dev.yaml` ; il publie uniquement `127.0.0.1:8080/8081`. Il ne convient pas aux écrans distants.

## Sauvegarde et restauration

```sh
sh scripts/backup.sh
# Sur l'instance a restaurer, apres creation des conteneurs :
sh scripts/restore.sh ../scenzly-backups/SCENZLY_SAUVEGARDE --replace-existing-data
```

La sauvegarde interrompt brièvement l’API pour figer les écritures et sauvegarder ensemble PostgreSQL et les médias. La restauration remplace les données existantes. Conservez les sauvegardes hors du serveur et protégez-les : elles contiennent les comptes et les données de l’application. Détails dans [le guide d’exploitation](docs/deployment.md).

## Développement et tests

Le monorepo utilise Node.js 22+ et npm workspaces :

```sh
npm ci
npm run build
npm test
```

`npm run dev:api`, `npm run dev:admin` et `npm run dev:player` lancent les services de développement. L’API nécessite `DATABASE_URL` et un `MEDIA_DIR` accessible en écriture. Les deux serveurs Vite proxient `/api` vers l’API sur le port 3000. Le déploiement Docker reste la méthode la plus simple pour démarrer l’ensemble.

Les tests d’intégration modifient une instance dédiée et vide ; ne les exécutez pas sur une installation utilisée :

```sh
SCENZLY_TEST_URL=http://127.0.0.1:8080 npm run test:smoke
```

Les détails du contrat sont dans [docs/api-contract.md](docs/api-contract.md). Les points d’entrée sont `apps/admin`, `apps/player`, `apps/api` et `packages/shared` pour les types et la planification.

## Périmètre de cette première version

Cette base couvre le parcours local de création, publication, jumelage et diffusion. Elle n’implémente pas encore la totalité du cahier des charges : import PowerPoint, éditeur avancé avec groupes/annuler-rétablir, historique de restauration des versions, récupération de compte par email, quotas par organisation et intégrations matérielles restent à développer. FFmpeg et Poppler assurent les conversions vidéo et PDF dans l’image API.

Les vidéos sont lues sans son par défaut pour respecter les règles d’autoplay des navigateurs. Le démarrage automatique en mode kiosque, l’heure NTP, l’allumage de la dalle et sa mise en veille se configurent sur l’appareil. Les événements de lecture décrivent le rendu du navigateur ; ils ne prouvent pas l’affichage physique de la dalle. La recette matérielle, les performances 4K et l’autonomie hors connexion doivent être vérifiées sur vos écrans cibles.

## PostgreSQL 18 et import PDF

Les nouvelles installations utilisent PostgreSQL 18, avec le volume `scenzly_postgres18-data` monté sur `/var/lib/postgresql` (organisation propre aux images PostgreSQL 18).

**Installation existante PostgreSQL 17 : ne lancez pas directement `docker compose up`.** Après récupération du nouveau code, et pendant que votre ancien conteneur PostgreSQL 17 fonctionne, lancez :

```sh
sh scripts/migrate-postgres18.sh
```

Le script construit les images, sauvegarde la base et les médias, arrête les écritures, démarre PostgreSQL 18 dans un nouveau volume et restaure les données. Il refuse une cible non vide. Le volume PostgreSQL 17 et la sauvegarde restent conservés. En cas d’échec de restauration, l’API reste arrêtée ; conservez les volumes et utilisez la sauvegarde pour diagnostiquer. Ne supprimez aucun ancien volume avant validation.

Dans **Médiathèque → Documents PDF**, importez un document (25 Mo, 50 pages maximum). Le traitement en arrière-plan crée une image PNG par page, disponible pour les scènes et programmes. La file est persistée dans PostgreSQL et reprise au redémarrage. L’interface affiche les imports en attente, terminés ou en erreur. Le traitement est exécuté par l’API, à concurrence limitée à un document par instance ; la conversion vidéo dispose de sa propre file persistante.

## Conversion vidéo

Dans **Médiathèque → Conversion vidéo**, importez un MP4/MOV, MKV/WebM ou AVI. La conversion en arrière-plan crée un nouveau média MP4 H.264, pixels YUV420p, audio AAC stéréo si la source contient du son et index `faststart` pour la lecture web. Une source sans piste audio est acceptée. Le fichier initial n’est pas publié ; seul le résultat complet rejoint la médiathèque.

Limites : 500 Mo, 1 heure, dimensions source 8192 pixels maximum ; sortie limitée à 1920 × 1080 en conservant le ratio. Une conversion utilise deux threads et expire après 15 minutes. Un travail par instance API est traité à la fois, indépendamment des imports PDF. La file reprend les travaux interrompus après redémarrage ; les erreurs sont visibles dans l’interface. Les fichiers sources temporaires sont supprimés après succès ou échec définitif. L’import direct des médias existant reste disponible sans conversion.

Les tests de conversion nécessitent FFmpeg/ffprobe et Poppler sur la machine qui lance `npm test`. Pour vérifier aussi la lecture Chromium sur une instance de recette vide : `SCENZLY_CHROMIUM=/usr/bin/chromium npm run test:smoke`.

## Interface

Identité visuelle aux couleurs de Screnzly, navigation adaptative, éditeur de scènes et écran de jumelage harmonisés. Logos et polices sont servis localement. Voir la [recette visuelle](docs/interface.md).

![Tableau de bord Screnzly — données de démonstration](docs/screenshots/dashboard.png)
