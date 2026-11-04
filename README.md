# Voyage Culturel

> Explorer le monde. Répondre. Progresser.

Application web de jeu culturel **en réseau local**, mise en œuvre du dossier de conception :
un **joueur** explore un globe interactif et répond à des questions de géographie et de culture,
un **présentateur** pilote la partie depuis une interface séparée qui contient les réponses,
les indices et les commandes de validation.

- Deux écrans, un seul Wi-Fi, **aucune dépendance à un service cloud** pendant la partie.
- **Carte du monde réelle** : pays colorés, lacs, fleuves, routes, zoom jusqu'au détail régional.
- Le joueur répond **en cliquant sur le pays** : le serveur vérifie le clic et applique le barème.
- 120 questions culturelles (6 thèmes × 4 niveaux × 5 questions), banque locale au format JSON.
- La réponse attendue n'est **jamais** envoyée au navigateur du joueur avant validation.

---

## Interface épurée

- **Accueil** : créer une salle ou rejoindre une partie.
- **Joueur** : question, grande carte, pays choisi et bouton **Valider**. Le score, le numéro de
  question et la difficulté actuelle restent discrets ; les règles répétées et les panneaux superflus ont été retirés.
- **Présentateur** : thème, difficulté et nombre de questions. En partie, les commandes changent
  selon le contexte : indice / passer, puis question suivante.
- Options de seconde chance, explications, sources, historique et corrections restent accessibles
  dans des sections **repliées par défaut**, sans encombrer le jeu.

### Aperçu des écrans

| Joueur | Présentateur |
| --- | --- |
| ![Question, globe et validation](docs/apercus/interface-joueur.png) | ![Commandes essentielles et réponse privée](docs/apercus/interface-presentateur.png) |

[Voir l’interface mobile](docs/apercus/interface-mobile.png).

<details>
<summary>Aperçus de la carte et des routes</summary>

| Globe coloré | Carte du monde, pays réels |
| --- | --- |
| ![Globe coloré](docs/apercus/globe.png) | ![Carte du monde](docs/apercus/carte-monde.png) |

| Zoom régional : routes, fleuves, lacs, sélection | Verdict : repère du joueur et lieu attendu |
| --- | --- |
| ![Europe à fort zoom](docs/apercus/carte-europe.png) | ![Zoom avec repères](docs/apercus/carte-zoom.png) |

Aperçus cartographiques générés sans navigateur par `npm run preview:map` (voir `docs/DONNEES.md`).

</details>

## 1. Démarrage

```bash
npm install
npm run dev          # http://localhost:3000 (écoute aussi sur le réseau local)
```

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur local + Next.js en mode développement (HMR) |
| `npm run build` | Compilation de production — **arrêter le serveur de dev avant** |
| `npm start` | Serveur de production (`NODE_ENV=production`) |
| `npm run typecheck` | Vérification TypeScript |
| `npm run smoke` | Test de bout en bout du moteur (voir §8) |
| `npm test` | Tous les tests sans serveur : banque, progression, carte, score et confidentialité |
| `npm run test:questions` | Banque et quatre niveaux, filtres, tirages progressifs et barème expert |
| `npm run test:map` | Géométrie des pays, clics, barème et confidentialité (sans serveur) |
| `npm run test:ui` | Parcours navigateur sur ordinateur et mobile (Playwright) |
| `npm run preview:map` | Génère les aperçus PNG du globe et des routes |

Le port se change avec `PORT=4000 npm run dev`.

> **Vous travaillez dans VS Code ?** Guide pas à pas (clonage, extensions, `F5`, Git, Pull
> Requests, dépannage) : [`docs/VSCODE.md`](docs/VSCODE.md). Configurations prêtes à l'emploi dans
> `.vscode/` : `Ctrl+Shift+B` lance le serveur, `F5` le débogue.

### Utilisation en classe ou en famille

1. Lancer le serveur sur l'ordinateur du présentateur.
2. Ouvrir **`/presentateur`** sur cet ordinateur → *Créer la salle*.
3. Projeter le **code à 5 caractères** ou le **QR code**.
4. Le joueur scanne/ouvre le lien sur son téléphone ou sa tablette, saisit un pseudo.
5. Le présentateur démarre et distribue les indices. Le clic du joueur est vérifié automatiquement ; le présentateur peut corriger le verdict.

> ⚠️ Depuis un téléphone, n'utilisez jamais `localhost` : il désigne le téléphone lui-même.
> Utilisez l'adresse du type `http://192.168.x.x:3000` affichée au démarrage du serveur (ou le QR code).
> Le pare-feu de l'ordinateur doit autoriser les connexions entrantes sur le port.

Le QR code est généré **côté serveur** (`GET /api/qr?data=…`) à partir de l'adresse réellement
utilisée dans le navigateur : il fonctionne donc aussi bien en local que derrière un proxy.

---

## 2. Ce qui est implémenté (et où)

| Exigence du dossier | Mise en œuvre |
| --- | --- |
| Écran joueur : rejoindre par code/QR, pseudo, statut | `/jouer` — code et pseudo, reprise de session, alerte en cas de déconnexion |
| Globe / carte 3D zoomable, repères, retour à la vue globale | `src/components/WorldMap.tsx` — projection orthographique + carte plate (D3), rotation au doigt, molette/pincement, retour à la vue globale |
| « Colore la terre », pays réels | 241 pays et territoires Natural Earth à l’échelle 1:50 millions, coloriés comme un atlas, noms français au survol |
| Routes réelles détaillées selon le zoom | Lacs (toujours), rivières dès ×1,35, **routes réelles** (Natural Earth à l’échelle 1:10 millions) dès ×2,2, frontières renforcées — voir `docs/DONNEES.md` |
| Réponse par clic sur la carte | Clic → pays détecté (point-in-polygon), confirmation du nom, bouton *Valider* |
| Écoute de la question | Synthèse vocale (`speechSynthesis`) ; la dictée a été retirée, la réponse est cartographique |
| Score, niveau, progression, feedback | Score pendant la partie, résultat après validation, niveau et pays dans le bilan repliable |
| Interface présentateur : créer/démarrer/terminer | `/presentateur` — salle, QR, réglages, commandes |
| Réponse privée, explication, source | Panneau privé du présentateur ; explication et source dans une section repliable |
| Commandes : indice, passer, suivante, correction | Commandes contextuelles ; corrections et fin anticipée sous *Autres actions*, lecture de l’énoncé côté joueur |
| Temps réel | Socket.IO (repli long-polling automatique) |
| Accessibilité / robustesse | Réponse à la souris ou au doigt, zoom par boutons, contrastes, `aria-*`, `prefers-reduced-motion`, jeu utilisable sans voix ni WebGL |
| Sécurité / vie privée | Code de salle aléatoire, jeton présentateur, filtrage strict des états envoyés, données en mémoire seulement |

---

## 3. Règles du jeu

| Élément | Valeur par défaut |
| --- | --- |
| Points — facile / moyen / difficile / expert | 10 / 20 / 30 / 40 |
| Emplacement exact (bon pays, à moins de 400 km du lieu) | 100 % des points |
| Bon pays, mais loin du lieu précis | 60 % |
| À moins de 200 km, de l'autre côté d'une frontière | 40 % |
| Ailleurs | 0 point (résolu en échec) |
| Indice | −5 points (deux indices au plus par question) |
| Seconde chance (option, activée) | la question reste ouverte, la réponse vaut alors la moitié |
| Correction du présentateur | il peut **accorder** ou **retirer** les points après coup |
| Niveaux | 1 → 6 aux scores 0, 40, 100, 170, 260, 360 |
| Fin de partie | score, bonnes réponses, pays trouvés, badge (Apprenti → Explorateur légendaire) |
| Nombre de questions | 5, 8, 10, 12 ou 15, dans la limite des fiches disponibles |
| Thèmes | Tous, Capitales, Monuments, Langues, Nature, Traditions, Histoire |
| Difficulté | Facile, Moyen, Difficile, Expert, ou **Progressive** (facile → expert) |

Le présentateur peut régler thème, difficulté, nombre de questions et seconde chance **avant** le
démarrage ; ces réglages sont figés dès la première question.

### Quatre difficultés, une vraie progression

| Niveau | Exemple de question | Pays attendu |
| --- | --- | --- |
| **1 · Facile** | Tokyo est la capitale de quel pays ? | Japon |
| **2 · Moyen** | Canberra, et non Sydney, est la capitale de quel pays ? | Australie |
| **3 · Difficile** | Quel pays a Ljubljana pour capitale ? | Slovénie |
| **4 · Expert** | Quel pays de l’Himalaya a Thimphou pour capitale ? | Bhoutan |

Chaque thème propose **5 questions par niveau**. Tous les énoncés demandent un pays à désigner sur
la carte ; les indices, l’explication et la source restent associés à chaque fiche. Les sites
transfrontaliers précisent le côté visé (par exemple l’Everest côté Népal ou Niagara côté Ontario).

En mode **Progressive**, le tirage est mélangé séparément dans chaque niveau, puis réparti entre
les quatre paliers avant d’être ordonné du facile à l’expert. Exemple sur 8 questions :
**2 faciles → 2 moyennes → 2 difficiles → 2 expertes**. Même une partie de 5 questions atteint le
niveau expert ; le moteur gère aussi les manches de 3 questions avec des paliers espacés.

Un niveau fixe ne sort jamais du thème ou de la difficulté choisis. Si le nombre demandé dépasse
les fiches disponibles (par exemple 15 questions « Capitales / Expert », pour 5 fiches), la partie
utilise les **5 fiches uniques**, sans répétition ni ajout d’un autre niveau.

---

## 4. Architecture

```
server/
  index.mjs        Serveur HTTP + Next.js + Socket.IO, API /api/health, /api/bank, /api/qr
  rooms.mjs        État des salles, machine à états, barème, vues « présentateur » et « joueur »
  questions.mjs    Chargement et validation de la banque, tirage, distance, niveaux
data/
  questions.json   Banque de 120 questions (source par fiche, date de révision globale)
src/app/
  page.tsx         Accueil
  jouer/           Écran joueur
  presentateur/    Console présentateur
src/components/
  WorldMap.tsx     Globe orthographique et carte plate (D3 + TopoJSON, canvas)
  SiteHeader.tsx
src/lib/
  socket.ts        Client Socket.IO, appels avec acquittement, sessions locales
  types.ts         Types partagés des états
  map-geometry.mjs Index des pays et détection de clic partagés avec le serveur
  catalog.ts       Thèmes et difficultés pour les formulaires
server/geo.mjs     « Dans quel pays a-t-on cliqué ? » (point-in-polygon sur les frontières réelles)
public/geo/        Natural Earth : pays 50m et 110m, lacs, rivières, routes (voir docs/DONNEES.md)
scripts/smoke.mjs  Test automatisé du moteur via Socket.IO
scripts/test-map.mjs    Tests de la géométrie, du barème et de la confidentialité
scripts/test-questions.mjs Tests de la banque, des quatre niveaux et des files progressives
scripts/build-geo.mjs   Régénère les pays traduits en français
scripts/preview-map.mjs Rend les aperçus de la carte en PNG, sans navigateur
docs/DONNEES.md    Provenance des données, licences, niveau de détail
docs/apercus/      Aperçus du rendu (globe, carte du monde, Europe, zoom)
```

### Choix techniques

- **Next.js 15 + React 19 + TypeScript** (pile proposée par le dossier), servi par un **serveur Node
  personnalisé** : c'est lui qui porte Socket.IO et qui écoute sur `0.0.0.0` pour être joignable
  depuis le réseau local.
- **D3-geo + TopoJSON** plutôt que Three.js/WebGL : le globe est rendu en canvas, avec de vraies
  frontières, sans texture à télécharger, sans carte graphique requise et sans licence à vérifier.
  Il reste « rotatif, zoomable, cliquable », et se dégrade proprement sur les appareils modestes.
- **Socket.IO** avec `transports: ['polling', 'websocket']` : indispensable, car beaucoup de proxys
  Wi-Fi d'établissement bloquent les WebSockets.
- **Aucune ressource externe** à l'exécution (polices auto-hébergées via `@fontsource`, géographie
  locale) : le jeu fonctionne sans Internet. La connexion au serveur local reste nécessaire.

---

## 5. Protocole temps réel

Le serveur diffuse un état **différent** à chaque rôle ; il n'existe pas d'état « complet » partagé.

| Événement | Émetteur | Charge utile |
| --- | --- | --- |
| `host:create` | présentateur | `{theme, difficulty, count, allowRetry}` → `{code, hostToken}` |
| `host:rejoin` | présentateur | `{code, token}` |
| `host:command` | présentateur | `{code, type, payload}` — `start`, `hint`, `correct`, `incorrect`, `skip`, `next`, `end`, `restart`, `config` |
| `player:join` | joueur | `{code, pseudo}` → `{playerId, pseudo}` |
| `player:rejoin` | joueur | `{code, playerId}` |
| `player:submit` | joueur | `{code, pin:[lon,lat]}` |
| `state` | serveur | état filtré (`playerView` / `hostView`) |

Les commandes sont refusées si le socket n'est pas celui du présentateur (`room.hostSocketId`),
si la question n'est pas dans le bon état, ou si la partie n'a pas commencé.

---

## 6. Données

Chaque fiche de `data/questions.json` contient : `id`, `theme`, `difficulty` (1-4), `question`,
`answer` (pays attendu), `accepted` (noms du pays), `hints` (2), `explanation`, `country`, `countryCode`, `isoN`
(code ISO numérique utilisé pour surligner le pays sur la carte), `coords` `[lon, lat]` et
`source {label, url}`.

La date de vérification globale est `checkedAt` et s'affiche dans l'interface. Les sources sont
institutionnelles (UNESCO, Britannica, Larousse, musée du Louvre). Avant d'ajouter des questions,
vérifiez : exactitude, variantes acceptées, coordonnées, code `isoN` (le pays doit exister dans
`public/geo/countries-50m.json` pour pouvoir valider les clics).

Changer le nombre de questions ou de thèmes ne demande aucune modification de code : la banque est
lue au démarrage du serveur.

---

## 7. Sécurité et vie privée

- Code de salle aléatoire à 5 caractères, **jeton présentateur** secret conservé dans le
  `localStorage` de l'animateur (pas dans l'URL du joueur).
- `playerView()` ne contient la réponse, l'explication, le pays attendu et les coordonnées qu'après
  résolution ; les tests automatisés le vérifient sur le JSON réellement transmis.
- Le serveur tranche les réponses lui-même à partir de la géométrie des pays : le navigateur ne
  reçoit pas le corrigé pour « calculer » le verdict.
- Aucun compte, aucun courriel, aucune donnée persistée : pseudos, scores et historique vivent en
  mémoire et la salle est purgée après inactivité (6 h, 30 min sans aucun appareil connecté).
- Le trafic reste sur le réseau local. Cela ne remplace pas les protections de base : n'exposez pas
  ce serveur sur Internet.

---

## 8. Tests

**Sans serveur** — `npm test` lance 47 tests (21 carte + 26 banque/moteur).
`npm run test:questions` vérifie les 120 fiches, les codes pays, les cibles accessibles sur la carte,
les quotas et l’ordre de chaque format progressif, les filtres fixes sans doublon, le niveau 4 et
ses 40 points, les indices et la seconde chance, ainsi que la confidentialité avant résolution.
La présence d’une URL source est contrôlée ; ces tests ne vérifient pas le contenu des sites externes.

**Automatique** — `npm run smoke` (serveur démarré) vérifie 43 points : création de salle, mauvais
code refusé, arrivée du joueur, absence de la réponse et du pays attendu dans l'état joueur, indice
unique, refus d'une réponse sans clic, détection d'un mauvais clic, seconde chance, verdict exact,
correction du présentateur (accorder / retirer), passage, fin de partie, reconnexion, jeton
présentateur invalide, commande refusée à un tiers. La confidentialité est aussi vérifiée sur
l’accusé de réception d’une seconde chance (pas seulement sur l’événement `state`).

`npm run test:map` : 21 tests sans serveur — pays traversant l’antiméridien (États-Unis, Russie,
Nouvelle-Zélande, Kiribati), petits pays, comparaison géométrique sur 512 points, clics hors de la
Terre, coordonnées invalides, barème et confidentialité avant résolution.

**Navigateur** — `npm run test:ui` : 10 scénarios (5 sur ordinateur, 5 sur mobile) couvrent
l’accueil minimal, les trois critères de création, la sauvegarde du niveau expert, la montée
facile → moyen → difficile → expert sur les deux écrans, les erreurs de code et une partie complète : clic sur la carte, confidentialité pendant la seconde
chance, indice, validation, correction du présentateur, bilan, nouvelle partie et rechargement des
sessions. Le débordement horizontal est vérifié sur les deux formats.

Installer Chromium une seule fois, puis lancer les tests :

```powershell
npx playwright install chromium
npm run test:ui
```

Playwright réutilise le serveur déjà ouvert sur le port 3000, sinon il lance un serveur temporaire.
Les traces et captures d’échec sont rangées dans `.cache/playwright-results/` (ignoré par Git).

**Manuel** — la liste du dossier de conception :

1. Téléphone et ordinateur sur le même Wi-Fi, code erroné, déconnexion/reconnexion.
2. Question, indice, validation et score synchronisés sur les deux écrans.
3. La réponse privée n'apparaît jamais dans l'écran joueur (onglet « Réseau » du navigateur).
4. Zoom et déplacement à la souris **et** au doigt ; réseau lent (le repli long-polling prend le relais).
5. Clic sur un pays voisin : le verdict doit rester « à côté » ; clic dans le bon pays : « bon pays ».
6. Rendu : `npm run preview:map` régénère les aperçus PNG sans navigateur.

---

## 9. Décisions prises (à confirmer)

Le dossier listait plusieurs décisions ouvertes ; les valeurs retenues sont :

- **Un joueur et un présentateur** par salle (MVP). Le modèle de données est prêt pour plusieurs
  joueurs (score et pays suivis par joueur), l'interface devra être étendue.
- **Cartographie** : globe D3 + carte plate, plutôt que Three.js (voir §4).
- **Réponse** : clic sur la carte plutôt que saisie de texte — le jeu teste le repérage géographique,
  pas l'orthographe. Le présentateur garde la main via les corrections.
- **Catégories** : capitales, monuments, langues, nature, traditions, histoire.
- **Barème** : voir §3, tout est réglable côté présentateur (sauf le barème, centralisé dans
  `server/questions.mjs`).
- **Sans Internet** : oui ; le réseau local et le serveur restent nécessaires.

---

## 10. Limites connues et suites possibles

- Les **routes** Natural Earth sont les grands axes mondiaux : denses en Europe et en Amérique du
  Nord, rares en Afrique subsaharienne. Ce ne sont pas des données OpenStreetMap (bien trop lourdes
  pour un dépôt et pour un rendu temps réel).
- **Un seul joueur** par salle ; pas de mode équipe.
- Tout est en mémoire : un redémarrage du serveur termine les parties en cours (les sessions
  locales permettent au joueur de rejoindre une nouvelle salle sans perdre son pseudo).
- Pistes : sauvegarde SQLite des scores, mode multi-joueurs, mode « atelier » de création de
  questions, fonds de carte régionaux plus fins, vue 3D WebGL (Three.js) pour les machines dotées
  d'une carte graphique.
