> **Mode actuel :** HTTP direct sans Caddy par défaut. Pour appliquer les protections HTTPS de ce guide, activer explicitement `--https`, `--ip` ou `--localhost`. Voir [la procédure](../https.md).

# Correctifs de sécurité et migration

Les dix constats de `review-2026-10-27.md` font l’objet de corrections dans cette version. Le rapport initial reste une photographie du commit audité, pas une description du code corrigé.

## Installation existante

Prévoir une fenêtre de maintenance et une sauvegarde vérifiée. Ne jamais supprimer les volumes PostgreSQL ou médias pour appliquer cette mise à jour.

1. Sur l’ancienne version, exécuter `sh scripts/backup.sh` et conserver la sauvegarde hors du serveur. Protéger également `.env` et les certificats Caddy existants.
2. Récupérer le code : `git pull`. Lancer `sh scripts/migrate-visualy.sh` pour sauvegarder et migrer le projet Docker existant, puis `sh scripts/init-env.sh` : les secrets existants restent inchangés et les secrets manquants sont générés, sans être affichés.
3. Activer HTTPS avec `sh scripts/init-env.sh --https`. Choisir si nécessaire les ports publics `CADDY_HTTP_PORT` (80 par défaut) et `CADDY_HTTPS_PORT` (443) dans `.env`, puis définir `ADMIN_DOMAIN` et `PLAYER_DOMAIN` (par défaut `admin.visualy.home.arpa` et `player.visualy.home.arpa`). Faire pointer ces deux noms DNS locaux vers le serveur. Si `172.30.240.0/24` chevauche le LAN/VPN, définir un autre `FRONTEND_SUBNET`, une plage dynamique `FRONTEND_DYNAMIC_RANGE` à l’intérieur de ce sous-réseau et une adresse `CADDY_IP` dans le sous-réseau mais hors de cette plage ; cette adresse doit être réservée à Caddy.
4. Exécuter `docker compose up -d --build --wait`. Le service ponctuel `migrate` crée le rôle limité `screnzly_app`, met à niveau le schéma et accorde les droits. Seul ce service reçoit les identifiants du propriétaire PostgreSQL. L’API refuse désormais un compte superadministrateur PostgreSQL. Les volumes existants et les comptes sont conservés.
5. Exporter l’autorité locale avec `docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./visualy-root.crt`, puis installer ce certificat comme autorité approuvée sur chaque poste/lecteur. Ne jamais distribuer `root.key`. Ouvrir les deux URL HTTPS et vérifier l’absence d’erreur de certificat.
6. Vérifier `docker compose ps`, la connexion, un import PDF/vidéo et la diffusion. `migrate` doit avoir terminé avec code 0 ; les autres services doivent être sains.

Le passage de HTTP par IP à HTTPS par nom change l’origine du navigateur. Les préférences et caches ne sont pas transférés automatiquement ; reconnecter les administrateurs et jumeler à nouveau les lecteurs si nécessaire. Nettoyer les anciennes entrées d’écrans après vérification. Les anciennes sessions peuvent être révoquées depuis Paramètres.

Pour une nouvelle installation seulement, saisir la valeur locale `SETUP_TOKEN` dans le formulaire de création du premier compte. Ne pas envoyer cette clé par URL ni la publier. Une base déjà initialisée refuse toute nouvelle initialisation.

HTTP direct est désormais le mode par défaut (`ADMIN_PORT`/`PLAYER_PORT`). `compose.https.yaml` active Caddy, retire les ports HTTP directs et impose les cookies Secure. Le mode HTTP ne fournit pas la protection de transport de S01 ; choisir HTTPS pour la retrouver. Voir [la procédure actuelle](../https.md). Pour le développement seulement : `docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait`, accès exclusivement sur localhost.

## Protections par constat

| Constat | Correction |
| --- | --- |
| S01 | Avec l’override HTTPS : Caddy, cookies Secure et retrait des ports HTTP directs. Sans override : HTTP LAN sans chiffrement. Ports API/DB/conversion internes dans tous les modes. |
| S02 | Clé d’installation aléatoire obligatoire, verrou initial conservé, routes administratives absentes du proxy lecteur. |
| S03 | Zod 4 corrigé, contrôle précoce des grandes collections, audit npm en CI. |
| S04 | Migrations séparées, compte d’exécution sans superuser/DDL/création de rôles ; refus de démarrer avec un superuser. |
| S05 | Quotas d’espace, file et uploads ; conversion dans un service dédié sans DB/médias, réseau interne sans sortie Internet, système racine en lecture seule, capacités supprimées et limites mémoire/CPU/PID. |
| S06 | Couleurs strictes et `backgroundColor`, CSP bloquant les images et connexions externes, y compris pour les anciennes scènes. |
| S07 | En-têtes inclus explicitement dans chaque location Nginx, CSP et interdiction d’encadrement. |
| S08 | Changement/réinitialisation de mot de passe, désactivation/réactivation, révocation de toutes les sessions, protection du dernier superadmin actif et interface Paramètres. |
| S09 | En HTTPS, Caddy écrase X-Real-IP et Nginx ne fait confiance qu’à son IP réservée ; en HTTP direct, Nginx utilise l’adresse de connexion ; limites supplémentaires par compte/utilisateur/appareil. |
| S10 | Journal de sécurité distinct non modifiable par l’API, rétention de 90 jours via fonction restreinte ; événements lecteur à types limités et quotas par appareil. |

Les changements de rôle et de mot de passe révoquent toutes les sessions du compte concerné. Les réinitialisations administratives exigent le mot de passe courant du superadministrateur. Le changement personnel déconnecte toutes les sessions et exige une nouvelle connexion.

Les fonds de scènes acceptent les couleurs hexadécimales (3/4/6/8 chiffres) et `transparent`. Les anciens fonds CSS arbitraires sont ignorés par le rendu ; les remplacer par une couleur pour enregistrer la scène.

## Limites d’exploitation

- Médiathèque : quota par défaut de 10 Gio (`MEDIA_QUOTA_MB=10240`), deux uploads simultanés, dix demandes d’upload par minute et utilisateur, dix conversions en attente au maximum. Une réservation conservatrice de 1,5 Gio par import/upload et une marge de 1 Gio d’espace libre empêchent de remplir le disque. Le nombre effectif de travaux admis peut donc être inférieur à dix.
- Le quota s’applique aux uploads de l’application ; ce n’est pas un quota de filesystem contre un administrateur hôte ou une autre application. Garder une alerte externe sur l’espace disque et les volumes Docker.
- PDF : 25 Mio, 50 pages, conversion 120 s ; vidéo : 500 Mio, une heure, conversion 15 min. Sortie convertie limitée à 256 Mio. Le convertisseur dispose d’un espace temporaire mémoire de 768 Mio et d’une limite mémoire de 1 Gio ; un document trop complexe peut être rejeté ou le worker redémarré sans donner accès aux données de l’API. Les sources en erreur sont nettoyées après traitement.
- Le worker ne partage aucun volume avec l’API : transfert HTTP interne authentifié et sortie en archive lue en flux. Le client accepte seulement des fichiers réguliers nommés `page-N.png` ou `video.mp4`, refuse liens, doublons et dépassements de taille. Les commandes externes n’héritent pas des secrets du worker.
- Événements lecteur : 25 par appel, 100/minute et 32 Kio/minute par appareil, types réservés préfixés `player.` ; rétention 30 jours. Journal de sécurité : connexions, installation, changements de compte, publication et commandes ; rétention 90 jours. Son propriétaire DB peut toujours l’administrer : prévoir une collecte externe si une immutabilité hors hôte est requise.
- Les quotas d’identité sont en mémoire, adaptés à une instance API ; ils sont réinitialisés au redémarrage. Une architecture multi-instance demanderait un stockage partagé des quotas.
- Le cache hors connexion peut conserver des médias après révocation jusqu’à reconnexion. Protéger physiquement les lecteurs et leur profil navigateur.

## Vérification reproductible

```sh
npm ci
npm run build
npm test
npm run test:security
npm audit --audit-level=high
```

`tests/security/accounts.mjs` et `tests/smoke.mjs` créent des données : les exécuter uniquement sur une installation jetable, en fournissant `SCENZLY_TEST_URL`, `SCENZLY_TEST_EMAIL`, `SCENZLY_TEST_PASSWORD` et, pour l’installation initiale, `SCENZLY_SETUP_TOKEN`. `tests/security/database.mjs` vérifie les refus SQL avec `TEST_APP_DATABASE_URL` du rôle limité.

La CI exécute les tests et l’audit npm, et construit/scanne les quatre images avec Trivy. Les vulnérabilités HIGH/CRITICAL disposant d’une correction font échouer le scan ; les avis sans correctif doivent toujours être suivis par l’exploitant. Les images doivent être reconstruites régulièrement pour intégrer les correctifs système.

Les résultats de la recette et les risques système résiduels sont détaillés dans [la vérification du 28 octobre 2026](verification-2026-10-28.md). Pour rafraîchir les images de base, utiliser `docker compose build --pull` avant `docker compose up -d --wait`.
