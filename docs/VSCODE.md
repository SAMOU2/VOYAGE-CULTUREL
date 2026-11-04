# VS Code : Clone, Pull, Merge et démarrage du stand

Prérequis : **Node.js 22+**, npm, Git et VS Code. Aucune extension n’est obligatoire pour jouer.
Le dépôt est `https://github.com/SAMOU2/VOYAGE-CULTUREL.git`.

## 1. Clone — récupérer le projet

1. VS Code → `Ctrl+Shift+P` → **Git: Clone**.
2. Coller l’URL du dépôt, choisir un dossier parent, puis **Ouvrir**.
3. Si nécessaire, utiliser la connexion GitHub proposée par VS Code dans le navigateur.
   Ne pas copier de mot de passe ou de jeton dans le code ou dans une conversation.
4. Ouvrir un terminal intégré dans la racine du dépôt :

```powershell
npm ci --include=dev
npm run dev
```

Lancer chaque ligne séparément sous **Windows PowerShell 5.1** : ce shell n’accepte pas `&&`.
Le même principe s’applique à :

```powershell
git clone https://github.com/SAMOU2/VOYAGE-CULTUREL.git
cd VOYAGE-CULTUREL
code .
```

Le dossier contient désormais `backend/`, `frontend/`, `shared/`, `data/`, `scripts/`, `tests/`.
Les dépendances sont installées une seule fois depuis la racine grâce aux npm workspaces.

## 2. Jouer directement — pas d’accueil ni de création de salle

- Présentateur : **`http://localhost:3000/presentateur`**.
- Écran du visiteur : **`http://localhost:3000/jouer`**.
- `/` redirige vers l’écran visiteur.
- **Ctrl+F** ou bouton de plein écran, **Échap** pour la sortie native du navigateur.
- Le présentateur accompagne les questions puis **Terminer le passage** enregistre le score.
- Sur téléphone : `http://IP-DE-L-ORDINATEUR:3000/jouer`, jamais `localhost`.
  Trouver cette IP avec `ipconfig` sous Windows ; vérifier le Wi-Fi et le pare-feu.

`npm run dev` orchestre **deux processus distincts** : Express 4000 et Next.js 3000.
`Ctrl+C` les arrête. Ne pas lancer une deuxième copie sur les mêmes ports.
Le proxy Next évite toute URL backend locale dans le code du navigateur.

## 3. Déboguer le TypeScript

`.vscode/launch.json` propose :

- **Stand : Express + Next.js** : configuration composée, lance les deux débogueurs.
- **Backend Express (TypeScript)** : Node avec `tsx`, points d’arrêt dans `backend/src`/`shared`.
- **Frontend Next.js** : serveur Next séparé, répertoire `frontend`.
- **Navigateur : écran joueur** : navigateur sur le serveur déjà démarré.

`F5` lance la configuration choisie. **Utiliser F5 ou `npm run dev`, pas les deux à la fois**.
`Ctrl+Shift+B` lance la tâche de développement ; _Terminal → Exécuter la tâche_ propose aussi
vérifications de types, tests, smoke et compilation.

Les types sont stricts, sans fichiers JavaScript sources. L’émission JavaScript du backend est
un résultat de compilation dans `backend/dist/`, ignoré par Git. Next génère `frontend/.next/`.

## 4. Pull — récupérer les changements

1. Enregistrer les fichiers et regarder **Contrôle de source** (`Ctrl+Shift+G`).
2. Committer ou mettre de côté ses modifications avant de récupérer des changements conflictuels.
3. Menu **… → Pull** (ou palette **Git: Pull**).
4. Après une modification de `package-lock.json`, relancer `npm ci --include=dev`.
5. Lancer `npm run typecheck` et `npm test`.

Dans une session Arena, **conserver la branche fournie** : ne pas la renommer, en créer une autre
ou changer de branche. `Pull` met à jour la branche courante depuis sa branche distante suivie ;
il ne fusionne pas automatiquement `main` dans votre travail.

## 5. Merge — deux usages différents dans VS Code

### Intégrer `origin/main` dans la branche de travail

1. Palette → **Git: Fetch** pour actualiser les références distantes.
2. Palette → **Git: Merge Branch…**, sélectionner **`origin/main`**.
3. En cas de conflits, ouvrir l’éditeur de fusion, comparer les deux versions et enregistrer
   le résultat voulu (ne pas cliquer aveuglément sur « tout accepter »).
4. Indexer les fichiers résolus, terminer le commit de fusion si demandé, lancer les tests.
5. Envoyer uniquement la branche de travail courante via **… → Push**.

Cette opération conserve la branche courante. Ne pas fusionner votre travail directement sur
`main` simplement pour le tester.

### Fusionner une Pull Request GitHub

1. Installer l’extension recommandée **GitHub Pull Requests** et s’y connecter via le navigateur.
2. Publier la branche courante, puis **Create Pull Request** vers `main`.
3. Ouvrir la PR dans le panneau GitHub Pull Requests, vérifier le diff et les contrôles.
4. Après revue et **autorisation de fusion**, utiliser son action **Merge Pull Request**
   (ou **Open on GitHub** si l’action n’est pas proposée).
5. Une PR ouverte n’est pas une PR fusionnée : vérifier son état avant de considérer `main` à jour.

## 6. Tests et production

```powershell
npm run typecheck
npm test
npm run smoke
npx playwright install chromium
npm run test:ui
```

Le smoke lance son propre backend et son propre JSON temporaire : **aucun serveur préalable
requis, aucun participant réel modifié**. Les tests UI utilisent le stand local et modifient
son visiteur courant : les lancer hors événement, pas pendant un passage réel.

Pour la production, **arrêter le développement** avant de compiler :

```powershell
npm run build
npm start
```

Ports personnalisés : définir ces valeurs avant la compilation **et** au démarrage, car les
réécritures Next sont compilées :

```powershell
$env:PORT = "3100"
$env:BACKEND_PORT = "4100"
npm run build
npm start
```

## 7. Dépannage

| Problème                                 | Solution                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `tsx` n’est pas reconnu                  | À la racine du dépôt : `npm ci --include=dev`, puis `npm run dev`. Pas d’installation globale de `tsx`.                            |
| Watchpack : `EINVAL`, `lstat C:\…sys`    | Voir le dépannage Windows ci-dessous. Ne pas toucher aux fichiers système.                                                         |
| `EADDRINUSE`                             | Arrêter la copie déjà lancée avec son terminal/F5, ou changer les deux ports. Ne pas tuer tous les processus Node de l’ordinateur. |
| CSS absent, modules Next introuvables    | Arrêter les serveurs, supprimer seulement `frontend/.next/`, puis relancer. Ne pas compiler pendant le développement.              |
| Types erronés dans l’éditeur seulement   | Palette → **TypeScript: Select TypeScript Version → Use Workspace Version**, puis **Restart TS Server**.                           |
| Connexion au stand impossible            | Vérifier qu’Express 4000 et Next 3000 sont tous deux actifs et que les variables de proxy correspondent.                           |
| « Un présentateur pilote déjà ce stand » | Fermer son onglet pour libérer le pupitre ; recharger le vôtre. Pas de code à saisir.                                              |
| WebGL indisponible/perdu                 | La carte de secours reste cliquable. Activer l’accélération graphique du navigateur et essayer **Réessayer la 3D**.                |
| Plein écran refusé                       | Utiliser le bouton dans une fenêtre normale, vérifier les autorisations d’intégration ou le menu du navigateur.                    |
| `users.json` illisible                   | Arrêter le serveur et conserver une copie avant de réparer le JSON. Le serveur ne l’écrase pas silencieusement.                    |
| Classement à réinitialiser               | Arrêter le serveur, sauvegarder puis supprimer `data/users.json`. Un fichier vide est recréé au démarrage.                         |
| PowerShell refuse `&&`                   | Lancer les commandes sur des lignes séparées, comme dans ce guide.                                                                 |

### Watchpack sous Windows : scan de fichiers hors projet

Si le terminal affiche `Watchpack Error (initial scan): EINVAL, lstat` pour
`C:\DumpStack.log.tmp`, `C:\hiberfil.sys`, `C:\pagefile.sys` ou `C:\swapfile.sys`,
le watcher a tenté d’inspecter la racine du disque au lieu de rester dans le dépôt.
Ce n’est pas une erreur du jeu : un `GET /jouer 200` confirme que la page est servie,
et le `307` de `/` vers `/jouer` est normal.

La configuration corrigée de `frontend/next.config.ts` fixe la racine du monorepo
et exclut de la surveillance Webpack les chemins extérieurs au dépôt, sans perdre
le rechargement de `frontend/` et `shared/` ni les exclusions `.next`, `.git`, `node_modules`.
Un simple filtre sur les noms `.sys` ne suffit pas : Watchpack peut lire leurs métadonnées
avant d’appliquer ce filtre quand le dossier parent est déjà surveillé.

Après fusion et récupération du correctif, arrêter les serveurs avec **Ctrl+C**, puis
exécuter ces lignes séparément depuis la racine du dépôt :

```powershell
git pull
npm ci --include=dev
Remove-Item -Recurse -Force .\frontend\.next -ErrorAction SilentlyContinue
npm run dev
```

Seul le cache généré `frontend/.next/` est supprimé, pas les questions ni le classement.
Il ne faut **ni supprimer les fichiers Windows, ni désactiver la pagination ou
l’hibernation, ni lancer VS Code en administrateur** pour contourner cet avertissement.
Si le problème persiste avec cette configuration, relever `node -v`, le chemin du dépôt
et les nouvelles lignes `Watchpack` du terminal pour poursuivre le diagnostic.

Le stand est prévu pour un **LAN de confiance sans authentification**, pas pour une exposition
publique sécurisée. Ne jamais publier `data/users.json` contenant les visiteurs réels.
