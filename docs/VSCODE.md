# Travailler sur le projet dans VS Code

Guide pas à pas : récupérer le dépôt, lancer le jeu, puis utiliser Git sans quitter VS Code.

Dépôt : `https://github.com/SAMOU2/VOYAGE-CULTUREL`

---

## 1. Prérequis

| Outil | Version | Vérifier |
| --- | --- | --- |
| Node.js | 20 ou plus (22 conseillé) | `node -v` |
| npm | fourni avec Node | `npm -v` |
| Git | 2.30 ou plus | `git --version` |
| VS Code | à jour | menu *Aide → À propos* |

Sous Windows, Git s'installe via [git-scm.com](https://git-scm.com/downloads) (garder l'option
« Git from the command line and also from 3rd-party software »).

---

## 2. Récupérer (cloner) le projet

### Méthode A — depuis VS Code (la plus simple)

1. Ouvrir VS Code **sans dossier** (*Fichier → Nouvelle fenêtre*).
2. `Ctrl+Shift+P` (macOS `Cmd+Shift+P`) → taper **`Git: Clone`**.
3. Coller l'adresse :

   ```
   https://github.com/SAMOU2/VOYAGE-CULTUREL.git
   ```

4. Choisir un dossier parent, puis **« Ouvrir »** dans la notification qui apparaît.

### Méthode B — depuis le terminal

```bash
cd ~/Documents
git clone https://github.com/SAMOU2/VOYAGE-CULTUREL.git
cd VOYAGE-CULTUREL
code .
```

### Méthode C — GitHub CLI

```bash
gh repo clone SAMOU2/VOYAGE-CULTUREL
code VOYAGE-CULTUREL
```

> **Dépôt privé ?** VS Code demandera une connexion GitHub (*Comptes* en bas à gauche →
> « Se connecter avec GitHub »). En terminal, utilisez un **jeton personnel** comme mot de passe
> (GitHub n'accepte plus le mot de passe du compte) ou passez en SSH :
> `git clone git@github.com:SAMOU2/VOYAGE-CULTUREL.git`.

Le dossier obtenu contient `README.md`, `package.json`, `server/`, `src/`, `data/` — mais **pas**
`node_modules` ni `.next` : ce sont des dossiers générés.

---

## 3. Première ouverture

1. VS Code propose les extensions recommandées (`.vscode/extensions.json`) → **Install All**.
   - ESLint, Prettier, GitLens (historique Git), GitHub Pull Requests, npm Intellisense.
2. Ouvrir le terminal intégré : `Ctrl+ù` (ou *Terminal → Nouveau terminal*).
3. Installer les dépendances :

   ```bash
   npm install
   ```

   (une seule fois ; ~20 s, environ 180 paquets)

---

## 4. Lancer le jeu

```bash
npm run dev
```

Le terminal affiche :

```
  VOYAGE CULTUREL — serveur local
  → http://localhost:3000
  → http://192.168.x.x:3000  (même Wi-Fi, à scanner)
  72 questions chargées (vérifiées le 2026-11-04)
```

- `Ctrl+Clic` sur `http://localhost:3000` → page d'accueil.
- **Présentateur** : `http://localhost:3000/presentateur`
- **Joueur** : `http://localhost:3000/jouer` (sur un second onglet, ou sur un téléphone via l'adresse `192.168.x.x`)

> Sur téléphone, n'utilisez **jamais** `localhost` : cela désigne le téléphone lui-même.
> Le QR code de la salle encode automatiquement la bonne adresse.

Autres commandes : `npm run typecheck`, `npm run build`, `npm start`, `npm run smoke`
(voir §8). Utilisez `Ctrl+C` pour arrêter le serveur.

### Lancer sans le terminal : `Ctrl+Shift+B`

`.vscode/tasks.json` déclare `npm: dev` comme tâche de build par défaut :
`Ctrl+Shift+B` démarre le serveur dans un panneau dédié.

---

## 5. Déboguer (points d'arrêt)

`.vscode/launch.json` fournit deux configurations :

| Configuration | Usage |
| --- | --- |
| **Serveur local (Next.js + Socket.IO)** | Lance `server/index.mjs` avec `NODE_ENV=development`, ouvre Chrome et attache le débogueur. Les points d'arrêt fonctionnent dans `server/*.mjs`. |
| **Navigateur sur le serveur local** | Attache seulement le navigateur à un serveur déjà lancé (débogage du code client). |

`F5` → choisir la configuration. `Shift+F5` pour arrêter.

---

## 6. Git dans VS Code

Tout se fait dans le panneau **Contrôle de source** (`Ctrl+Shift+G`).

### Voir et enregistrer ses modifications

1. Le panneau liste les fichiers modifiés (`M`), ajoutés (`U`) et supprimés (`D`).
2. Cliquer sur un fichier → diff côte à côte.
3. **Stage** : bouton `+` sur la ligne du fichier (ou `+` à côté de « Modifications » pour tout).
4. Écrire le message dans la zone du haut, puis **✓ Commit** (`Ctrl+Entrée`).
5. **Push** : bouton `Sync Changes` / `Publier la branche` dans la barre d'état (ou `...` → *Push*).

### Créer et changer de branche

- Barre d'état en bas à gauche (nom de la branche) → liste des branches, ou
  `Ctrl+Shift+P` → **`Git: Create Branch`**.
- `Git: Checkout to…` pour basculer.

### Historique et comparaison (GitLens)

- *GitLens* ajoute l'auteur et la date de chaque ligne, et un panneau **Graph** pour voir
  l'historique, comparer deux commits, restaurer un fichier.

### Ouvrir une Pull Request

Avec l'extension **GitHub Pull Requests** : après un `push`, une notification propose
**« Create Pull Request »**. Sinon, `Ctrl+Shift+P` → `GitHub Pull Requests: Create Pull Request`,
base `main`, branche courante.

### Application GitHub intégrée

Panneau **Source Control** → onglet *GitHub* : issues, PR et actions du dépôt.
(En ligne de commande : `gh pr list`, `gh pr view 1`, `gh pr merge 1`.)

---

## 7. Cycle de travail conseillé

```bash
git switch main          # partir de la version à jour
git pull
git switch -c ma-fonctionnalite

# ... modifications, puis dans VS Code : stage + commit ...

git push -u origin ma-fonctionnalite
```

Puis une Pull Request vers `main`. Une branche = une intention ; un commit = une étape qui compile
(`npm run typecheck` avant de committer).

### Mémo des commandes Git

| Besoin | Commande | Dans VS Code |
| --- | --- | --- |
| État des fichiers | `git status` | panneau Contrôle de source |
| Voir un diff | `git diff` | clic sur le fichier |
| Tout indexer | `git add -A` | `+` à côté de « Modifications » |
| Committer | `git commit -m "…"` | `Ctrl+Entrée` |
| Récupérer | `git pull` | `...` → *Pull* |
| Envoyer | `git push` | *Sync Changes* / `...` → *Push* |
| Annuler une modif | `git restore fichier` | clic droit → *Discard Changes* |
| Historique | `git log --oneline --graph` | panneau GitLens / *Graph* |
| Changer de branche | `git switch nom` | barre d'état en bas |

---

## 8. Tests

```bash
npm run typecheck    # TypeScript strict, aucun fichier émis
npm run smoke        # 30 contrôles du moteur — le serveur doit tourner
```

`npm run smoke` dialogue avec le serveur comme un vrai client : création de salle, arrivée du joueur,
vérification que la réponse n'est pas exposée, indices, seconde chance, fin de partie, reconnexion.
Il accepte une autre adresse : `npm run smoke -- http://localhost:3100`.

---

## 9. Dépannage

| Symptôme | Cause / solution |
| --- | --- |
| `EADDRINUSE :3000` | Un serveur tourne déjà. `PORT=4000 npm run dev`, ou arrêter l'autre processus. |
| Page blanche, CSS absent, `Cannot find module './768.js'` | `.next` a été écrasé par un `npm run build` pendant que le serveur de dev tournait. **Arrêter le serveur**, puis `rm -rf .next && npm run dev`. |
| `Cannot find module 'next'` | `npm install` n'a pas été lancé dans le bon dossier. |
| Le téléphone n'ouvre pas la page | Même Wi-Fi ? pare-feu Windows autorisant Node ? adresse `192.168.x.x` et non `localhost` ? |
| Page qui ne se met pas à jour | Recharger (`Ctrl+R`) ; le HMR peut être bloqué par un proxy. |
| La réponse apparaît côté joueur | Impossible par conception : vérifier que vous regardez le bon onglet (les deux écrans diffusent des états différents). |
| Erreurs TypeScript dans l'éditeur mais `npm run typecheck` passe | `Ctrl+Shift+P` → *TypeScript: Restart TS Server*. |

---

## 10. Fichiers de configuration fournis

| Fichier | Rôle |
| --- | --- |
| `.vscode/extensions.json` | extensions recommandées (proposées à l'ouverture) |
| `.vscode/settings.json` | SDK TypeScript local, exclusions de recherche, Git autofetch |
| `.vscode/launch.json` | débogage du serveur et du navigateur (`F5`) |
| `.vscode/tasks.json` | `npm run dev` (`Ctrl+Shift+B`), typecheck, smoke, build |

Ces fichiers sont volontairement versionnés : l'environnement de développement est identique pour
toute l'équipe.
