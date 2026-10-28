# Vérification des correctifs — 28 octobre 2026

Les correctifs S01 à S10 sont implémentés. Le [guide de migration](hardening.md) décrit les changements de déploiement et les limites d’exploitation. La restauration a été vérifiée sur une installation jetable ; aucune installation utilisateur n’a été migrée à distance.

## Résultats

- Compilation TypeScript et bundles de production : réussite.
- Tests existants : 32 réussites ; tests de sécurité supplémentaires : 5 réussites, soit **37 tests** au total.
- Audit npm : **0 vulnérabilité signalée**, après migration Zod 4.6.7 et ajout du lecteur d’archive en flux.
- Recette HTTP complète réussie sur Docker : authentification, PDF, transcodage vidéo, médias, scènes, publication figée, jumelage, droits média, planification, commandes et révocation du lecteur.
- Tests comptes réussis : refus éditeur/observateur, contrôle Origin, rejet d’un fond URL, changement de mot de passe invalidant deux sessions, révocation, désactivation/réactivation, réinitialisation administrative et protection du dernier superadministrateur.
- Tests lecteur réussis : types d’événement réservés refusés, lots trop grands refusés, quota par appareil appliqué, événements préfixés `player.`.
- Tests SQL : rôle applicatif non-superuser, sans création de base/rôle ; CREATE TABLE, DELETE/TRUNCATE du journal de sécurité refusés, y compris après restauration.
- Tests navigateur réels : en-têtes présents sur HTML, script et réponse 404 ; interface chargée sous CSP ; ancienne scène avec fond URL ignorée ; image externe bloquée avant émission réseau ; français/anglais, thèmes, mobile et brouillons préservés.
- Lecteur hors connexion : shell, logo, polices et préférences conservés après rechargement sous les en-têtes de production.
- HTTPS local : chaîne vérifiée avec le certificat racine Caddy via `curl --cacert`, sans option `-k`. Une requête avec X-Real-IP et X-Forwarded-For falsifiés est journalisée avec l’adresse du client vue par Caddy, et non l’adresse injectée ni celle de Caddy.
- Sauvegarde puis restauration sur l’instance jetable : réussite ; schéma et permissions applicatives réappliqués, API redémarrée.
- Configuration Compose et syntaxe des scripts shell : validation réussie.

## Images et risques résiduels

La [synthèse des scans](image-scan-summary-2026-10-28.json) contient les identifiants d’images et les résultats Trivy. Les décomptes sont des occurrences paquet/avis et peuvent contenir plusieurs occurrences d’une même CVE.

| Image testée | Alertes HIGH/CRITICAL avec correction annoncée | Alertes HIGH/CRITICAL sans correction annoncée |
| --- | ---: | ---: |
| Administration, Nginx 1.30 / Alpine 3.24 | 0 | 0 |
| Lecteur, Nginx 1.30 / Alpine 3.24 | 0 | 0 |
| API, Debian 12 | 0 | 57 |
| Convertisseur, Debian 12 | 0 | 274 |

Les alertes des images API/convertisseur concernent les paquets système Debian ; aucune alerte HIGH/CRITICAL Node n’est remontée dans ces images finales. Cela ne signifie pas qu’elles sont exemptes de vulnérabilités. L’absence de version corrigée annoncée par Trivy ne vaut pas non-exploitabilité. Conserver les restrictions réseau, les limites de ressources et l’isolation du convertisseur, et surveiller les correctifs de la distribution. Les images PostgreSQL et Caddy n’ont pas fait l’objet de ce scan final.

Le scan initial des images web Nginx 1.28 remontait 66 occurrences corrigibles par image. L’accès aux dépôts APK a été refusé par le proxy de l’environnement (HTTP 403). La correction finale utilise l’image officielle Nginx 1.30 et supprime curl et le module de traitement d’images serveur inutilisés, ce qui retire aussi leurs dépendances vulnérables. Les deux images web finales ont été recontrôlées : aucune alerte HIGH/CRITICAL restante. Aucun contournement des contrôles du dépôt n’a été ajouté au projet.

Les constructions complètes ont été exécutées avec le proxy et son certificat propres à cet environnement, via des fichiers temporaires extérieurs au dépôt. Après saturation du stockage Docker, les derniers essais ont réutilisé les bases déjà construites avec les fichiers compilés courants et les mêmes étapes runtime (retrait de npm, Nginx 1.30, permissions statiques et suppression des composants inutilisés). La CI reconstruit le Dockerfile complet et exécute les tests d’intégration sur une installation neuve ; son résultat après publication reste à vérifier.

## Exploitation

Pour rafraîchir les images de base, utiliser `docker compose build --pull`, puis `docker compose up -d --wait` après sauvegarde et préparation de la migration HTTPS. Une simple reconstruction avec une base locale en cache ne garantit pas la récupération des derniers correctifs.

Les scripts `tests/security/run-integration.sh`, `accounts.mjs`, `player-events.mjs` et `database.mjs` visent des installations jetables. Ne pas les exécuter sur les données de production.
