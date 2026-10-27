# Screnzly

Plateforme d’affichage dynamique auto-hébergée pour un réseau local : une administration web, un lecteur plein écran par appareil, une API et PostgreSQL. Le logiciel fonctionne sans compte cloud ni service externe à l’exécution. Le téléchargement initial des images Docker et des dépendances nécessite Internet ; les images peuvent ensuite être transportées vers un serveur isolé.

## Démarrer sur votre serveur

Prérequis : Docker Engine avec Docker Compose v2, ou Docker Desktop avec les conteneurs Linux sous Windows/macOS. Point de départ conseillé : 2 cœurs, 4 Go de RAM et de l’espace disque adapté aux médias. Les performances vidéo dépendent aussi de chaque lecteur.

Depuis ce dossier :

```sh
sh scripts/init-env.sh
docker compose up -d --build --wait
docker compose ps
```

Sous Windows, exécutez ces commandes depuis WSL ou Git Bash. Le script crée un fichier `.env` local avec un mot de passe PostgreSQL aléatoire ; il préserve un fichier existant. Ne commitez pas ce fichier.

Sur votre réseau, remplacez `IP_DU_SERVEUR` par l’adresse de votre machine :

| Interface | Adresse |
| --- | --- |
| Administration | `http://IP_DU_SERVEUR:8080` |
| Lecteur écran | `http://IP_DU_SERVEUR:8081` |

Ouvrez l’administration et créez immédiatement le premier compte administrateur. Il n’existe aucun compte ni mot de passe prédéfini. Cette inscription initiale se ferme après création du premier compte ; effectuez-la depuis un réseau de confiance. PostgreSQL et l’API ne publient aucun port sur l’hôte.

## Premier programme

1. Importez une image JPEG, PNG ou WebP, ou une vidéo MP4/WebM lisible par vos navigateurs.
2. Créez une scène ou assemblez les médias dans un programme. Réglez les durées, puis publiez le programme.
3. Ouvrez le lecteur sur l’écran à associer et recopiez son code dans l’administration.
4. Affectez un programme de secours à cet écran. Ajoutez une campagne datée ou récurrente si nécessaire.
5. Laissez le lecteur ouvert en plein écran. Les modifications publiées sont récupérées automatiquement.

Les programmes publiés conservent une révision figée : modifier un brouillon ne change pas immédiatement ce qui est diffusé. Republiez pour appliquer une nouvelle version. Un écran sans contenu affiche un visuel de secours intégré.

## HTTPS et fonctionnement hors connexion

Les ports 8080/8081 permettent les premiers essais sur le LAN. Pour activer le Service Worker et le cache après redémarrage du navigateur sur les écrans distants, utilisez **HTTPS avec un certificat approuvé par chaque appareil**. Une adresse HTTP sur le LAN n’est généralement pas un contexte sécurisé.

Une configuration Caddy avec autorité de certification locale est fournie. Elle fonctionne sans DNS public ni certificat cloud. Voir [le guide de déploiement](docs/deployment.md#https-local-et-cache-hors-connexion) pour configurer les noms locaux et installer le certificat racine.

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

Cette base couvre le parcours local de création, publication, jumelage et diffusion. Elle n’implémente pas encore la totalité du cahier des charges : conversion PDF et transcodage vidéo asynchrones, import PowerPoint, éditeur avancé avec groupes/annuler-rétablir, historique de restauration des versions, récupération de compte par email, quotas par organisation et intégrations matérielles restent à développer. Les outils FFmpeg et Poppler sont présents dans l’image API pour les futurs traitements, sans promettre de conversion automatique.

Les vidéos sont lues sans son par défaut pour respecter les règles d’autoplay des navigateurs. Le démarrage automatique en mode kiosque, l’heure NTP, l’allumage de la dalle et sa mise en veille se configurent sur l’appareil. Les événements de lecture décrivent le rendu du navigateur ; ils ne prouvent pas l’affichage physique de la dalle. La recette matérielle, les performances 4K et l’autonomie hors connexion doivent être vérifiées sur vos écrans cibles.
