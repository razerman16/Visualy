# Déploiement et exploitation sur un réseau local

Visualy démarre en **HTTP direct, sans Caddy**. Le mode HTTPS est optionnel : [procédure Caddy](https.md). Les ports HTTP sont `ADMIN_PORT=8080` et `PLAYER_PORT=8081` par défaut.

## Variables et premier démarrage

```sh
sh scripts/init-env.sh
# Modifier ADMIN_PORT et PLAYER_PORT dans .env si nécessaire.
docker compose up -d --build --wait
docker compose ps -a
```

Ouvrir `http://IP_DU_SERVEUR:8080` et `http://IP_DU_SERVEUR:8081`. Aucune adresse à déclarer, aucun DNS ou certificat à installer. Sur le serveur Docker, `localhost` fonctionne aussi. Utiliser `SETUP_TOKEN` de `.env` pour créer le premier administrateur. Le service `migrate` doit terminer avec code 0.

| Variable | Valeur initiale | Utilisation |
| --- | --- | --- |
| `ADMIN_PORT` | `8080` | Administration HTTP directe |
| `PLAYER_PORT` | `8081` | Lecteur HTTP direct |
| `BIND_ADDRESS` | `0.0.0.0` | Interfaces IPv4 publiées |
| `POSTGRES_PASSWORD` | aléatoire | Mot de passe du propriétaire PostgreSQL |
| `APP_DB_PASSWORD` | aléatoire, 64 caractères hexadécimaux | Compte API à droits limités |
| `SETUP_TOKEN` | aléatoire | Clé de création du premier compte |
| `CONVERTER_TOKEN` | aléatoire | Authentification du convertisseur |
| `MEDIA_QUOTA_MB` | `10240` | Quota média avec réservations d’import |
| `CADDY_HTTP_PORT` / `CADDY_HTTPS_PORT` | `80` / `443` | Mode HTTPS uniquement |
| `CADDY_PLAYER_HTTPS_PORT` | `8443` | Lecteur HTTPS par IP |
| `ADMIN_DOMAIN` / `PLAYER_DOMAIN` | `admin.visualy.home.arpa` / `player.visualy.home.arpa` | Noms pour HTTPS optionnel |
| `LOCAL_PLAYER_HTTPS_PORT` | `8443` | Lecteur HTTPS localhost |
| `DEV_ADMIN_PORT` / `DEV_PLAYER_PORT` | `8080` / `8081` | Override de développement, localhost uniquement |

Le script préserve les secrets et le mode existants. Pour revenir explicitement à HTTP après une ancienne configuration Caddy :

```sh
sh scripts/init-env.sh --http
docker compose up -d --build --remove-orphans --wait
```

Cela retire l’ancien conteneur Caddy, sans supprimer ses volumes. Ne pas remplacer `POSTGRES_PASSWORD` d’une base déjà initialisée : modifier `.env` ne modifie pas le mot de passe enregistré dans PostgreSQL. Une rotation demande une modification du rôle dans la base.

## Architecture

```text
HTTP par défaut : navigateurs → admin-web / player-web → API → PostgreSQL
HTTPS optionnel : navigateurs → Caddy → admin-web / player-web → API
                                                               └→ convertisseur isolé
```

Seuls les services web sont exposés. L’API, PostgreSQL et le convertisseur restent internes. Les volumes `visualy_postgres18-data` et `visualy_media-data` conservent les données des nouvelles installations. Une installation migrée réutilise ses volumes `scenzly_*` via `VOLUME_PREFIX=scenzly`. `docker compose down` conserve les volumes ; `down -v` les supprime.

HTTP convient à un réseau local de confiance et ne chiffre pas les identifiants ni les médias. Les sessions conservent HttpOnly et SameSite=Strict ; Secure est activé uniquement par les overrides HTTPS. Le cache persistant des lecteurs distants nécessite HTTPS approuvé. Autoriser les ports choisis dans le pare-feu LAN du serveur ; aucune redirection sur la box n’est nécessaire.

## Choisir les ports dans `.env`

Pour HTTP :

```dotenv
ADMIN_PORT=8080
PLAYER_PORT=8081
```

Les deux ports doivent être distincts et libres. Après modification, `docker compose up -d --wait` applique les changements ; un simple `restart` ne suffit pas. Ne pas utiliser `CADDY_IP` comme adresse du site : elle appartient au réseau interne Docker.

Pour HTTPS, configurer les ports Caddy selon [la procédure dédiée](https.md). Les ports HTTP directs sont alors retirés automatiquement. Une modification du mode, du nom ou du port change l’origine navigateur : se reconnecter et jumeler sur la nouvelle adresse.

## HTTPS local et cache hors connexion

Suivre [la procédure HTTPS avec Caddy](https.md). Choisir `--https` pour des noms DNS, `--ip` pour l’IP existante, ou `--localhost` pour un test sur la machine Docker. Installer la racine publique Caddy sur chaque client. Préserver les volumes Caddy et ne jamais distribuer `root.key`.

Un navigateur ayant déjà visité le site en HTTPS peut mémoriser HSTS et forcer HTTPS après retour à HTTP. Voir [le retour à HTTP](https.md#switching-from-an-earlier-caddy-installation-back-to-http). Ne pas confondre cette redirection du navigateur avec un conteneur Caddy encore actif.

## Accéder directement par l’IP du serveur

Le mode par défaut le permet sans détection : `http://IP_DU_SERVEUR:ADMIN_PORT` et `http://IP_DU_SERVEUR:PLAYER_PORT`. Pour HTTPS par IP, utiliser `sh scripts/init-env.sh --ip` et suivre [le guide](https.md#existing-server-ip-without-dns). Sous WSL/Docker Desktop, vérifier l’IP LAN du système hôte.

## Tester en HTTPS sur localhost

Utiliser `sh scripts/init-env.sh --localhost`, puis suivre [la procédure localhost](https.md#localhost). HTTP sur localhost fonctionne également avec la configuration de base et ses ports 8080/8081.

## Passage de Screnzly à Visualy

Le nom et les packages deviennent Visualy ; le projet Docker devient `visualy` ; exécuter `sh scripts/migrate-visualy.sh` avant le premier démarrage sur une installation `scenzly`. Le script sauvegarde les données, arrête l’ancien projet et configure la réutilisation de ses volumes. La base, le rôle `screnzly_app`, les cookies, les clés navigateur et le format des sauvegardes restent compatibles. Conserver `.env`, secrets et volumes. Ne pas changer simplement le nom du projet sans cette migration : Docker pourrait créer des volumes vides.

Les rapports de sécurité datés décrivent la version examinée à leur date ; le mode HTTP actuel est un choix de déploiement distinct. Pour les protections de transport, utiliser le mode HTTPS décrit dans [le durcissement](security/hardening.md).

## Sauvegarder

```sh
sh scripts/backup.sh
# Ou un emplacement specifique :
sh scripts/backup.sh /chemin/protege/visualy-backups
```

Le script arrête temporairement l’API, lance `pg_dump` au format PostgreSQL personnalisé, copie les fichiers du volume médias et calcule leurs sommes SHA-256. Il redémarre l’API s’il l’avait trouvée active, même après erreur. Les écrans déjà synchronisés peuvent continuer à lire leur cache. Aucun arrêt de PostgreSQL n’est nécessaire.

Chaque dossier contient `database.dump`, `media.tar.gz`, `checksums.sha256` et `FORMAT`. Un dossier sans `FORMAT` correspond à une sauvegarde incomplète. Copiez uniquement les sauvegardes réussies vers un autre disque ou un NAS et appliquez votre politique de rétention. Le dossier par défaut est à côté du dépôt, dans `../visualy-backups`. Protégez séparément `.env` et, le cas échéant, les volumes Caddy.

Exemple cron quotidien, après adaptation des chemins et redirection des logs vers un emplacement protégé :

```cron
0 3 * * * cd /srv/visualy && sh scripts/backup.sh /mnt/sauvegardes/visualy >> /var/log/visualy-backup.log 2>&1
```

## Restaurer

Testez régulièrement une restauration sur un serveur de secours. Utilisez des sauvegardes produites par cette application et conservées dans un emplacement de confiance.

1. Préparez la même version du code et des images, puis démarrez les conteneurs sur la destination.
2. Sauvegardez les données éventuellement présentes.
3. Lancez explicitement le remplacement :

   ```sh
   sh scripts/restore.sh /chemin/scenzly-SAUVEGARDE --replace-existing-data
   ```

4. Vérifiez `docker compose ps`, connectez-vous et vérifiez les médias, les programmes et les écrans. Si les noms DNS et le stockage navigateur restent identiques, les jetons appareils restaurés peuvent continuer à fonctionner ; sinon refaites le jumelage.

Le script vérifie les sommes de contrôle avant d’arrêter l’API. Il remplace la base et le volume médias. En cas d’erreur, l’API reste arrêtée pour éviter de diffuser un état partiellement restauré. Lisez l’erreur et corrigez le problème avant de relancer la restauration ou de démarrer l’API. L’option explicite est obligatoire pour éviter un remplacement involontaire.

## Mise à jour

Conservez une sauvegarde et la version précédente du code/des images, puis :

```sh
sh scripts/backup.sh
git pull --ff-only
sh scripts/init-env.sh
docker compose up -d --build --wait
docker compose logs --tail 100 api
```

HTTPS est inclus dans la configuration normale. Ne lancez pas `down -v`. Pour revenir à une version incompatible avec le schéma courant, restaurez aussi la sauvegarde correspondante. Cette version initialise son schéma de manière idempotente ; des migrations de schéma versionnées seront nécessaires pour les évolutions qui modifient les données.

## Réseau isolé

Sur une machine de préparation connectée, construisez les quatre images Visualy (API, convertisseur, administration, lecteur) et récupérez l’image PostgreSQL (et Caddy si HTTPS est activé). Exportez-les avec `docker image save`, transférez l’archive et rechargez-la avec `docker image load` sur le serveur local. Conservez les mêmes noms d’images et démarrez avec `docker compose up -d --no-build --wait`. La synchronisation et les médias restent ensuite sur le LAN ; aucun compte externe n’est requis.

## Diagnostic

- API indisponible : regardez `docker compose logs api postgres` et le mot de passe PostgreSQL initial, sans publier `.env`.
- Upload refusé : vérifiez format, signature réelle du fichier et limites de taille. Pour les PDF et les vidéos à convertir, utilisez les imports dédiés et consultez leur état ; vérifiez aussi le quota et l’espace libre.
- Écran vide : vérifiez le programme publié, son affectation de secours et les heures dans `Europe/Paris` ; le player affiche sinon son écran de secours intégré.
- Cache indisponible : vérifiez HTTPS, la confiance du certificat, la capacité de stockage et le support Service Worker du navigateur.
- Média vidéo non lu : testez MP4 H.264/AAC sur Chromium récent et privilégiez une lecture muette ; la compatibilité dépend des codecs et de l’appareil.
- Horaires décalés : synchronisez le système des écrans par NTP. Le planificateur applique le fuseau IANA de la campagne et traite les créneaux traversant minuit.

Ne publiez pas les journaux complets ou les sauvegardes : ils peuvent contenir des données internes. Les journaux nginx omettent volontairement la chaîne de requête, qui peut transporter un jeton de lecteur.

Pour migrer une installation PostgreSQL 17, suivre la section PostgreSQL 18 du README avant tout redémarrage avec le nouveau fichier Compose. Le volume 17 ne doit jamais être monté directement dans PostgreSQL 18.
