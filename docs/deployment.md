> **Mise à jour sécurité :** HTTPS est maintenant le mode par défaut. Avant de mettre à jour une installation existante, suivre [la procédure de migration](security/hardening.md). Les anciens réglages `COOKIE_SECURE=false`, `ADMIN_PORT` et `PLAYER_PORT` ne réactivent pas HTTP en production.

# Déploiement et exploitation sur un réseau local

## Architecture

```text
Navigateurs → HTTPS :443 Caddy → admin-web / player-web → API → PostgreSQL
                                                        ├→ volume médias
                                                        └→ convertisseur isolé
```

Seuls les ports web sont publiés. Les fichiers et données sont conservés dans les volumes Docker `scenzly_media-data` et `scenzly_postgres18-data`. `docker compose down` préserve ces volumes ; `docker compose down -v` les supprime. Les conteneurs redémarrent automatiquement avec Docker, sauf s’ils ont été arrêtés explicitement.

Ne créez pas de redirection de ports sur votre box pour une installation LAN. Autorisez les ports choisis dans le pare-feu du serveur uniquement pour le réseau des administrateurs et des écrans. Réservez une adresse DHCP fixe au serveur. L’application ne configure pas le réseau ou le démarrage kiosque à la place de votre système.

## Variables et premier démarrage

Le script `sh scripts/init-env.sh` génère `.env` sans afficher son secret. Variables prises en charge :

| Variable | Valeur initiale | Utilisation |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | aléatoire, 64 caractères hexadécimaux | Compte PostgreSQL interne |
| `BIND_ADDRESS` | `0.0.0.0` | Adresse d’écoute des ports publiés ; choisir l’IP LAN pour restreindre l’interface |
| `APP_DB_PASSWORD` | aléatoire, 64 caractères hexadécimaux | Compte applicatif à droits limités |
| `SETUP_TOKEN` | aléatoire | Clé de création du premier compte |
| `CONVERTER_TOKEN` | aléatoire | Authentification interne du convertisseur |
| `MEDIA_QUOTA_MB` | `10240` | Quota média avec réservations d’import |
| `ADMIN_DOMAIN` | `admin.scenzly.home.arpa` | Nom DNS local HTTPS |
| `PLAYER_DOMAIN` | `player.scenzly.home.arpa` | Nom DNS local HTTPS |

Le mot de passe est incorporé dans une URL PostgreSQL : utilisez le script ou une valeur hexadécimale. Modifier `.env` après initialisation ne modifie pas le mot de passe de la base déjà créée. Une rotation nécessite aussi `ALTER ROLE` dans PostgreSQL, puis une recréation du conteneur API ; ne supprimez pas les volumes pour changer un mot de passe.

```sh
docker compose up -d --build --wait
docker compose ps
docker compose logs --tail 100 api
```

Le service ponctuel `migrate` met à niveau le schéma avant le démarrage de l’API. Sa sonde `/api/v1/health` vérifie également la connexion à PostgreSQL. Créez le premier administrateur depuis le portail avec la clé `SETUP_TOKEN` disponible localement dans `.env`. Le mot de passe du compte doit comporter au moins 12 caractères.

## HTTPS local et cache hors connexion

1. Configurez dans le DNS local (routeur, Pi-hole, serveur DNS interne) les noms `admin.scenzly.home.arpa` et `player.scenzly.home.arpa` vers l’IP LAN du serveur. À défaut, ajoutez les entrées aux fichiers hosts des postes qui le permettent. Les deux noms doivent être résolus par chaque écran.
2. Démarrez la configuration HTTPS par défaut :

   ```sh
   docker compose up -d --build --wait
   ```

   Seul Caddy publie les ports 80/443. Caddy redirige HTTP vers HTTPS et émet les certificats avec sa propre autorité locale ; aucun service ACME public n’est utilisé.
3. Exportez uniquement le certificat public racine :

   ```sh
   docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ../scenzly-root.crt
   ```

4. Installez ce certificat dans le magasin des autorités de confiance de chaque poste/écran et du navigateur lorsqu’il utilise son propre magasin. Sous Windows, utilisez le magasin « Autorités de certification racines de confiance ». Sous Linux, utilisez le mécanisme de votre distribution et vérifiez aussi le magasin Chromium/Firefox. Les bornes Android/TV doivent permettre l’installation d’une autorité approuvée ; qualifiez le matériel avant déploiement.
5. Ouvrez `https://admin.scenzly.home.arpa` et `https://player.scenzly.home.arpa` sans avertissement de certificat. Les cookies de l’administration deviennent sécurisés. Le lecteur peut alors enregistrer son Service Worker et ses médias locaux. Un changement d’origine HTTP→HTTPS exige un nouveau jumelage sur le nouvel emplacement.

Ignorer un avertissement de certificat ne constitue pas une configuration fiable pour le cache. Le cache reste soumis à l’espace disque et aux politiques du navigateur ; attendez la fin de la synchronisation puis testez une coupure réseau et un redémarrage sur chaque modèle d’écran. Les ressources externes ne sont pas garanties hors ligne.

Conservez les volumes `caddy-data` et `caddy-config` pour garder l’autorité locale après redémarrage. Si vous migrez le serveur, sauvegardez-les de façon protégée : `caddy-data` contient une clé privée. Le script de sauvegarde applicatif ci-dessous ne copie pas ces volumes.

Le mode de développement HTTP exige explicitement `docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait` et n’écoute que sur localhost. Ne pas l’utiliser pour un déploiement LAN.

## Sauvegarder

```sh
sh scripts/backup.sh
# Ou un emplacement specifique :
sh scripts/backup.sh /chemin/protege/scenzly-backups
```

Le script arrête temporairement l’API, lance `pg_dump` au format PostgreSQL personnalisé, copie les fichiers du volume médias et calcule leurs sommes SHA-256. Il redémarre l’API s’il l’avait trouvée active, même après erreur. Les écrans déjà synchronisés peuvent continuer à lire leur cache. Aucun arrêt de PostgreSQL n’est nécessaire.

Chaque dossier contient `database.dump`, `media.tar.gz`, `checksums.sha256` et `FORMAT`. Un dossier sans `FORMAT` correspond à une sauvegarde incomplète. Copiez uniquement les sauvegardes réussies vers un autre disque ou un NAS et appliquez votre politique de rétention. Le dossier par défaut est à côté du dépôt, dans `../scenzly-backups`. Protégez séparément `.env` et, le cas échéant, les volumes Caddy.

Exemple cron quotidien, après adaptation des chemins et redirection des logs vers un emplacement protégé :

```cron
0 3 * * * cd /srv/scenzly && sh scripts/backup.sh /mnt/sauvegardes/scenzly >> /var/log/scenzly-backup.log 2>&1
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

Sur une machine de préparation connectée, construisez les quatre images Screnzly (API, convertisseur, administration, lecteur) et récupérez l’image PostgreSQL et Caddy. Exportez-les avec `docker image save`, transférez l’archive et rechargez-la avec `docker image load` sur le serveur local. Conservez les mêmes noms d’images et démarrez avec `docker compose up -d --no-build --wait`. La synchronisation et les médias restent ensuite sur le LAN ; aucun compte externe n’est requis.

## Diagnostic

- API indisponible : regardez `docker compose logs api postgres` et le mot de passe PostgreSQL initial, sans publier `.env`.
- Upload refusé : vérifiez format, signature réelle du fichier et limites de taille. Pour les PDF et les vidéos à convertir, utilisez les imports dédiés et consultez leur état ; vérifiez aussi le quota et l’espace libre.
- Écran vide : vérifiez le programme publié, son affectation de secours et les heures dans `Europe/Paris` ; le player affiche sinon son écran de secours intégré.
- Cache indisponible : vérifiez HTTPS, la confiance du certificat, la capacité de stockage et le support Service Worker du navigateur.
- Média vidéo non lu : testez MP4 H.264/AAC sur Chromium récent et privilégiez une lecture muette ; la compatibilité dépend des codecs et de l’appareil.
- Horaires décalés : synchronisez le système des écrans par NTP. Le planificateur applique le fuseau IANA de la campagne et traite les créneaux traversant minuit.

Ne publiez pas les journaux complets ou les sauvegardes : ils peuvent contenir des données internes. Les journaux nginx omettent volontairement la chaîne de requête, qui peut transporter un jeton de lecteur.

Pour migrer une installation PostgreSQL 17, suivre la section PostgreSQL 18 du README avant tout redémarrage avec le nouveau fichier Compose. Le volume 17 ne doit jamais être monté directement dans PostgreSQL 18.
