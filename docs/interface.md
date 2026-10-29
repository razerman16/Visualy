# Identité visuelle Visualy

L’interface conserve les sections et l’agencement du tableau de bord. La navigation claire, les titres bleu nuit et les accents cyan/bleu/violet reprennent le logo fourni. Les fichiers `public/brand` contiennent des déclinaisons adaptées du logo Visualy fourni : `visualy-logo.png` (horizontal transparent), `visualy-logo-dark.png` (lettrage clair sur fond bleu nuit) et `visualy-mark.png` (icône transparente). Le logo suit le thème choisi, y compris le mode système. Le lecteur met ces trois fichiers en cache pour fonctionner hors connexion. La police Manrope est distribuée localement avec les applications ; aucun CDN ni appel à Google Fonts n’est requis.

Les captures de recette utilisent des données de démonstration isolées, pas les données d’une installation. Les captures du tableau de bord figurent dans `screenshots/dashboard.png` (clair, français) et `screenshots/dashboard-dark-en.png` (sombre, anglais).

## Recette visuelle reproductible

Les commandes en haut de l’administration, de la connexion, de l’éditeur et du lecteur proposent les thèmes clair, sombre et système, ainsi que le français et l’anglais. Par défaut, l’interface est en français et suit le thème du système. Les choix sont conservés dans le stockage local du navigateur et synchronisés entre les onglets de la même origine. L’administration et le lecteur ayant des ports différents, leurs préférences sont indépendantes.

Changer de langue ou de thème conserve les formulaires et les brouillons en cours. Les textes de l’interface sont traduits, tandis que les noms saisis, les médias, les couleurs et le contenu des scènes restent inchangés. Les traductions sont embarquées : aucun service externe n’est appelé et le choix reste disponible dans le lecteur hors connexion une fois son cache installé.

Après `npm ci` et `npm run build`, lancer les interfaces de production dans deux terminaux (API Docker déjà accessible sur le port 8080) :

```sh
API_URL=http://127.0.0.1:8080 npm run preview -w @visualy/admin -- --host 127.0.0.1 --port 8280
API_URL=http://127.0.0.1:8080 npm run preview -w @visualy/player -- --host 127.0.0.1 --port 8281
```

Puis exécuter, avec Chromium installé :

```sh
VISUALY_ADMIN_URL=http://127.0.0.1:8280 VISUALY_PLAYER_URL=http://127.0.0.1:8281 node tests/ui/visual-check.mjs
node tests/ui/preferences.mjs
node tests/ui/offline-shell.mjs
```

`VISUALY_CHROMIUM` permet de choisir le binaire du navigateur. Les captures sont enregistrées dans `/tmp/visualy-design`, ou le répertoire `VISUALY_SCREENSHOTS`. La recette vérifie la navigation, les formulaires de jumelage, l’éditeur, les versions mobiles, les erreurs JavaScript et les débordements horizontaux. Le test hors connexion vérifie le cache de la page du lecteur, du logo et des polices ; il ne remplace pas les tests de diffusion des médias.

## Validation du passage à Visualy

- Compilation complète des quatre packages `@visualy/*`, 32 tests applicatifs et 5 tests de sécurité : réussis.
- Recette Chromium : navigation, éditeur, connexion, jumelage visuel, vues mobiles, thèmes clair/sombre/système et français/anglais ; aucun débordement horizontal ni erreur JavaScript.
- Mise à jour du lecteur : ancien cache d’interface remplacé, cache média et identifiant appareil préservés ; nouveau logo sombre, traductions et polices disponibles après rechargement hors connexion.
- Configuration Docker Compose validée ; aucun volume ou secret existant modifié.

## Revue de stabilité et de mise en page

La [revue du 29 octobre 2026](stability-review-2026-10-29.md) décrit les corrections, la matrice de 200 mises en page, les scénarios d’erreur et les commandes de recette. Le cache de l’interface du lecteur est désormais versionné automatiquement lors du build.
