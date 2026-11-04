# Voyage Culturel · International Students Day

**Un stand. Un visiteur à la fois. Le monde à découvrir.**

Un jeu culturel continu pour animer un stand : le visiteur tourne une **vraie Terre 3D**, choisit
un pays et valide. L’animateur accompagne la découverte depuis son pupitre. **Aucune salle à
créer, aucune partie à rejoindre, aucun compte, mot de passe ou code à saisir.**

- **`/jouer`** : question, globe, destination choisie, validation et score.
- **`/presentateur`** : pseudo facultatif, indices, verdict, question suivante, passage au visiteur suivant et classement.
- **`/` redirige directement vers `/jouer`**, sans ancien écran d’accueil.
- **Ctrl+F** active/désactive le plein écran. Un bouton est également disponible sur téléphone.
- **120 questions**, 6 thématiques, niveaux facile / moyen / difficile / expert ou progression automatique.
- Pays colorés et vraies routes locales. **Pas de couche de fleuves ni de lacs.**
- Réponses attendues réservées au présentateur avant résolution, y compris pendant la seconde chance.

## Aperçu

| Écran visiteur                                                           | Pupitre présentateur                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| ![Globe WebGL et question culturelle](docs/apercus/interface-joueur.png) | ![Pilotage du stand et corrigé privé](docs/apercus/interface-presentateur.png) |

[Écran mobile](docs/apercus/interface-mobile.png). Pseudos et scores des captures : **démonstration fictive**.

## Démarrer

**Node.js 22 ou supérieur**, npm et Git. Depuis la racine du dépôt :

```text
npm ci
npm run dev
```

Deux processus distincts sont lancés :

| Service              | Adresse locale          | Rôle                                               |
| -------------------- | ----------------------- | -------------------------------------------------- |
| **Frontend Next.js** | `http://localhost:3000` | Interfaces `/jouer` et `/presentateur`             |
| **Backend Express**  | `http://localhost:4000` | Moteur du stand, API, Socket.IO et sauvegarde JSON |

1. Ouvrir **`http://localhost:3000/presentateur`** sur l’ordinateur de l’animateur.
2. Ouvrir **`http://localhost:3000/jouer`** sur l’écran du stand. La première question est déjà prête.
3. Le visiteur sélectionne un pays sur la Terre et clique sur **Valider mon choix**.
4. L’animateur affiche un indice si nécessaire, puis **Question suivante** après le verdict.
5. **Terminer le passage** sauvegarde le résultat et prépare immédiatement le visiteur suivant.

**Sur téléphone**, utiliser l’IP de l’ordinateur, par exemple
`http://192.168.1.20:3000/jouer`, et non `localhost`. Même réseau et pare-feu autorisant le port 3000. Il n’y a ni recherche d’autres ordinateurs sur le Wi-Fi, ni serveur cloud nécessaire en jeu.
Les requêtes du navigateur restent sur l’adresse du frontend ; Next relaie `/api/*` et `/socket.io`
vers Express. Ne pas exposer le port 4000 aux visiteurs si le réseau peut le filtrer.

> Mode **LAN de confiance, sans authentification** : l’URL du présentateur n’est pas un accès
> protégé par mot de passe. Le premier onglet présentateur prend automatiquement la main.
> Une capacité technique opaque, conservée dans son `sessionStorage`, protège ses commandes et
> permet sa reconnexion ; elle n’est jamais demandée à l’utilisateur ni diffusée aux joueurs.
> Un deuxième navigateur ne peut pas reprendre tant que le premier présentateur est connecté.
> Fermer son onglet libère le pupitre. Ce n’est pas une protection pour un déploiement Internet public.

## Architecture entièrement TypeScript

```text
backend/
  src/                 Express, Socket.IO, moteur du stand, JSON atomique
  tsconfig.json        Compilation NodeNext → dist/ (généré, ignoré)
frontend/
  src/app/             Next.js : /jouer et /presentateur
  src/components/      Globe Three.js, secours 2D, contrôles, classement
  src/lib/             Connexion temps réel et chargement géographique
  public/geo/          Frontières et routes locales, sans fleuves
shared/
  types.ts             Contrats typés client/serveur et schémas de données
  geometry.ts          Picking commun et conversion sphère ↔ longitude/latitude
data/
  countries.json       Catalogue canonique des pays/territoires par ID
  questions.json       Questions regroupées dans byCountry[countryId]
  users.example.json   Schéma vide versionné
  users.json           Visiteurs et classement réels : créé localement, ignoré par Git
scripts/               Orchestration, préparation des frontières et smoke, en .ts
tests/                 Tests TypeScript unitaires, réseau et navigateur
```

Tous les **fichiers de code source** sont `.ts` ou `.tsx`, sans `allowJs`. JSON, CSS, SVG,
documentation et captures gardent naturellement leur format. Seul le JavaScript **généré** par les
compilateurs existe dans les répertoires ignorés.

### Jeu continu et barème simple

- Pas de nombre fixe de questions, de file de parties, de création ou de fermeture de salle.
- **Bon pays = points du niveau** : 10 / 20 / 30 / 40. Pas de calcul de distance au monument.
- Deux indices maximum, −5 points chacun ; une bonne réponse vaut au moins 5 points.
- Seconde chance facultative : moitié des points restants, arrondie, avec le même plancher de 5.
- Un clic dans l’océan, des coordonnées invalides ou une validation périmée ne consomment aucun essai.
- Le présentateur peut accepter/refuser un verdict, sans double attribution de points.
- En mode progressif, le niveau monte toutes les deux questions résolues, jusqu’à expert.
- Tirage sans répétition jusqu’à épuisement du filtre, puis nouveau cycle, sans écran de fin de partie.
- Pseudo facultatif de 24 caractères maximum ; sinon **Visiteur n**, sans inscription.

Le classement public affiche les 20 meilleurs passages terminés (les 3 premiers sur l’écran
joueur), triés par score, bonnes réponses puis date. Les écritures sont sérialisées et le JSON
remplacé atomiquement. Un échec d’enregistrement conserve le passage actif pour réessayer.
**Terminer le passage** est le point de sauvegarde normal ; l’arrêt propre du serveur sauvegarde
également le dernier passage résolu. Un arrêt brutal peut perdre le visiteur non encore enregistré.
La question courante et les indices restent en mémoire et ne reprennent pas après redémarrage.

### Vraie 3D et optimisation

Three.js utilise **WebGL**, une sphère maillée, des lumières, une atmosphère et un raycast de
sélection. Ce n’est plus une projection 2D présentée comme une 3D.

- Premier affichage léger 110m, puis détail 50m chargé en différé.
- Atlas coloré construit une fois et envoyé en texture, pas redessiné à chaque rotation.
- Vraies routes Natural Earth 10m téléchargées localement **seulement au premier zoom rapproché**.
- DPR plafonné (1,5 mobile / 1,75 ordinateur), anisotropie plafonnée et maillage adapté.
- Rendu à la demande, sans rotation automatique permanente ; pause hors écran/onglet masqué.
- Libération des géométries, textures et contrôles au démontage ; respect de `prefers-reduced-motion`.
- Carte 2D de secours cliquable si WebGL est absent ou si le contexte GPU est perdu ; bouton de nouvelle tentative 3D.

Clavier sur le globe : flèches pour explorer, Entrée pour sélectionner, `+`/`−` pour zoomer.
Le bouton haut-parleur lit l’énoncé via la voix du navigateur si disponible.
Aucune accélération RTX spécifique n’est requise ou revendiquée.

## Commandes

| Commande               | Effet                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `npm run dev`          | Lance Express et Next séparément, rechargement automatique                                 |
| `npm run build`        | Compile les deux workspaces — arrêter le serveur de développement avant                    |
| `npm start`            | Lance les deux processus en production après compilation                                   |
| `npm run typecheck`    | Vérifie backend, frontend, contrats, scripts et tests en TypeScript strict                 |
| `npm test`             | Tests autonomes : banque, géométrie, score, persistance et confidentialité réseau          |
| `npm run smoke`        | HTTP + WebSocket avec backend/JSON temporaires isolés, sans toucher les visiteurs réels    |
| `npm run test:ui`      | Parcours Playwright ordinateur/mobile ; utilise le serveur local ou lance le développement |
| `npm run build:geo`    | Régénère les frontières françaises et `data/countries.json`                                |
| `npm run format:check` | Vérifie le format des sources, configurations et documents                                 |

Production :

```text
npm run build
npm start
```

Pour les tests navigateur, installer Chromium une première fois :

```text
npx playwright install chromium
npm run test:ui
```

### Ports sous Windows / PowerShell 5.1

Commandes séparées, **pas de `&&`** :

```powershell
$env:PORT = "3100"
$env:BACKEND_PORT = "4100"
npm run dev
```

`PORT` vaut 3000 et `BACKEND_PORT` 4000 par défaut. Les mêmes variables doivent être définies
**avant `npm run build` et avant `npm start`** en production, car les réécritures du frontend
sont compilées. `BACKEND_ORIGIN` remplace l’origine du proxy côté Next si nécessaire ;
`USERS_FILE` accepte un chemin absolu vers le JSON local des participants.
On peut aussi lancer chaque service séparément avec `npm run dev --workspace @voyage/backend`
et `npm run dev --workspace @voyage/frontend` dans deux terminaux.

## Données, références et VS Code

- [Schémas JSON, identifiants, cartographie et licences](docs/DONNEES.md).
- [VS Code : **Clone, Pull, Merge**, débogage et PowerShell](docs/VSCODE.md).
- Les liens des sources des questions sont conservés. Les tests vérifient leurs URL et leur
  présence, **pas une nouvelle relecture éditoriale en ligne de toutes les références**.
- Garder `data/users.json` privé. Avant un nouvel événement, arrêter le serveur, sauvegarder ce
  fichier si nécessaire, puis le supprimer pour repartir avec un classement vide.
