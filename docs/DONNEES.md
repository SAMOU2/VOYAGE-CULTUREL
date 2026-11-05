# Données et fonctionnement d’ALGOMANIA

## 1. Catalogue des pays — `data/countries.json`

**240 pays et territoires cartographiques**, identifiés par `id`, avec un nom français, `iso2` si disponible et `center: [longitude, latitude]`. Ce nombre inclut les territoires de Natural Earth et n’est pas une liste de 240 États souverains. Les frontières ne constituent pas une prise de position politique.

Les IDs ISO numériques sont des **chaînes de trois chiffres** : `"012"` pour l’Algérie, `"250"` pour la France, `"392"` pour le Japon. Ne pas les convertir en nombres. Les IDs `ne-*` restent distincts pour les géométries sans code ISO fourni par l’atlas. Les géométries partageant l’ID de l’Australie ont été réunies en un MultiPolygon, pas en deux pays.

`center` n’est pas nécessairement terrestre, notamment pour un archipel. Le générateur des faits calcule un **point intérieur réellement contenu dans le 50m** ; c’est ce `pin` qui est utilisé par la liste de sélection accessible. Le serveur vérifie les vrais polygones, jamais seulement un centre ou l’ID déclaré par un client.

## 2. Banque — `data/questions.json`

Version **4.0.0**, **1080 questions**, sept thèmes, quatre niveaux :

- 120 questions éditoriales héritées, six thèmes, cinq questions par couple thème/niveau.
- 960 repères `atlas-*` : quatre questions par pays/territoire, une par difficulté.
- Toutes les questions sont rangées sous `byCountry[countryId]`.

Exemple de structure d’une fiche, pas une fiche supplémentaire :

```json
{
  "id": "exemple-france-001",
  "countryId": "250",
  "theme": "capitales",
  "difficulty": 1,
  "question": "Dans quel pays se trouve Paris ?",
  "hints": ["Ce pays est en Europe.", "Sa capitale est Paris."],
  "explanation": "Paris est la capitale de la France.",
  "location": [2.3522, 48.8566],
  "source": { "label": "Britannica — Paris", "url": "https://www.britannica.com/place/Paris" }
}
```

`countryId` doit correspondre à la clé du groupe et au catalogue. `id` est unique et stable. Deux indices sont requis. Les niveaux 1–4 valent respectivement 10/20/30/40 points, avant pénalités. Le thème et le niveau sont des métadonnées de question ; ils ne remplacent pas l’ID du pays.

Pour une question culturelle, `location` peut être le lieu évoqué, parfois côtier ou maritime. **La réponse est son pays**, pas la distance au lieu. Un clic dans une terre de ce pays est accepté ; un clic dans l’océan est refusé sans essai consommé.

### Tirage en deux étapes

`backend/src/random.ts` filtre par niveau et pays autorisés, écarte les questions déjà tirées, puis choisit **un pays uniformément**, et **une question de ce pays**. Un pays avec beaucoup de fiches n’obtient pas un poids supérieur au premier tirage. À épuisement du groupe disponible, le filtre des déjà-tirées peut être réouvert. Un remplacement exclut la fiche courante, garde le même niveau et n’ajoute pas de réponse.

### Extension et régénération

```powershell
npm run build:geo
npm run build:data
npm test
```

Arrêter le serveur pour régénérer les fichiers ensemble. `build:geo` utilise le paquet `world-atlas` déjà installé pour les frontières et le catalogue. `build:data` utilise le blob figé **`455b3fd85abcf8fa01e0fca63e84a853c9ff4422`** de `mledoze/countries`, mis en cache dans `.cache/country-reference.json`. Internet n’est nécessaire que si cette référence manque lors de la régénération, **jamais pour jouer**.

Le générateur remplace les seuls IDs `atlas-*` et préserve les autres fiches. Pour une nouvelle question éditoriale, choisir un ID sans préfixe `atlas-`, compléter ses indices/source/position et conserver les IDs déjà utilisés dans les historiques. Il ne faut pas annoncer les 960 repères comme 960 questions culturelles rédigées manuellement.

`checkedAt` est une métadonnée de banque, pas la preuve d’une nouvelle vérification de toutes les pages citées. Les tests vérifient structure, liens HTTPS, couverture et géométrie, pas l’actualité politique ou culturelle de toutes les références. La formulation « dans ce référentiel » signale notamment les données de capitales. Prévoir une relecture éditoriale avant l’événement.

## 3. Faits de veille — `data/facts.json`

**942 faits**, répartis entre les 240 pays/territoires :

```text
version
attribution
countries[]
  id, countryId, countryName, region, pin
  facts[]
    id, title, text, source { label, url }
```

Les informations portent sur la région, les capitales, la superficie et les codes internationaux lorsque les métadonnées existent. Les faits ne représentent pas un palmarès ou une description exhaustive d’un pays.

La veille tire un pays différent du précédent, puis un de ses faits, toutes les neuf secondes. Elle ne fonctionne qu’en dehors d’une partie active. La pause suspend les changements ; les mises à jour sont suspendues lorsque l’onglet est masqué. Les points intérieurs sont vérifiés contre la géométrie serveur.

`GET /api/facts` est public pour la veille et la sélection accessible ; il n’expose pas un lien avec la question courante. Les données éducatives du référentiel sont naturellement publiques ; le corrigé de la question sélectionnée reste un message privé distinct.

## 4. Réglages — `data/settings.json`

Créé localement et ignoré par Git. Son modèle versionné est `data/settings.example.json` :

```json
{
  "version": 1,
  "settings": {
    "mode": "club33",
    "clubCountryIds": ["33 IDs distincts du catalogue, voir le fichier exemple réel"],
    "questionsPerStage": 3,
    "allowRetry": false
  }
}
```

Le tableau ci-dessus décrit le format et n’est pas une configuration valide à copier : le vrai fichier contient **exactement 33 IDs connus**. Même en mode `world`, la sélection du club est conservée pour pouvoir y revenir.

Le pupitre peut changer le mode, les 33 pays, la longueur (2–10 par niveau) et la seconde chance. Une tentative capture ses propres règles dans `session.settings` ; la configuration courante n’est pas appliquée rétroactivement.

Sélection proposée :

| Région    | IDs                                         |
| --------- | ------------------------------------------- |
| Afrique   | 012, 504, 788, 818, 686, 566, 404, 231, 710 |
| Europe    | 250, 724, 380, 276, 826, 300, 620, 756      |
| Asie      | 792, 392, 156, 356, 410, 360, 682, 586      |
| Amériques | 840, 124, 484, 076, 604, 032                |
| Océanie   | 036, 554                                    |

## 5. Profils et tentatives — `data/users.json`

Modèle vide v2 :

```json
{ "version": 2, "nextTurn": 0, "users": [], "attempts": [], "session": null }
```

### Profils `users[]`

`id` aléatoire, `fullName`, `nameKey`, `createdAt`. Le nom complet est normalisé en NFC, les espaces/contrôles sont nettoyés. La clé de regroupement utilise NFKC et une casse française cohérente ; les accents ne sont pas supprimés. Deux noms différant seulement par casse/espaces réutilisent le même profil **après confirmation**. Aucun mot de passe, email ou compte.

### Tentatives `attempts[]`

- `id`, `userId`, nom complet à ce passage, dates de début/fin.
- État `playing`, `completed`, `stopped` ou `interrupted`.
- Score, réponses justes, réponses résolues, niveau maximum, mode et longueur.
- `answers[]`, chaque réponse : ID, `questionId` interne, `countryId`, difficulté, pays sélectionné, point cliqué, verdict, points, nombre d’indices, nombre d’essais, date.
- `migrated: true` seulement pour les anciens résultats dont les réponses individuelles ne sont pas disponibles.

Une mauvaise première réponse avec seconde chance maintient la question non résolue ; `tries` permet ensuite de savoir qu’une réponse résolue a nécessité deux essais. Les coordonnées de cette première réponse non résolue ne sont pas exposées comme une réponse correcte ni comme une distance. Une correction du pupitre ajuste la même réponse et les totaux, sans en créer une deuxième.

Chaque démarrage confirmé est conservé. Une tentative vide ne remplit pas le classement ; elle reste dans l’historique. Une tentative active ne remplace pas le meilleur score terminé. La meilleure tentative, une seule par profil, fournit score/réponses/niveau de la ligne publique. Le pupitre ajoute le nombre total de tentatives et l’ID de la meilleure. Les 50 derniers résumés sont consultables ; toutes les réponses restent dans le JSON.

### Session privée `session`

Référence de tentative, ID interne de question, **token public opaque distinct**, tour global monotone, indices révélés, nombre d’essais en attente, verdict éventuel, IDs déjà tirés et snapshot des règles.

Cette session est **uniquement côté serveur**. Elle permet de reprendre la question après redémarrage. Si elle ne correspond plus à la banque, le démarrage est refusé explicitement ; faire une sauvegarde et réparer la référence, ne pas effacer silencieusement les participants.

### Écritures et migration

Toutes les mutations passent par une file et un clone validé ; le fichier temporaire porte un UUID puis remplace l’original par rename. La mémoire ne change qu’après succès du disque. Les erreurs n’entraînent pas de remise à zéro. Un seul processus Express doit écrire dans le fichier.

Migration v1 : backup `users.json.v1.<timestamp>.bak`, fusion des profils selon leur nom normalisé, archivage de chaque ancien score comme tentative. Les statistiques historiques sont conservées, mais leurs réponses absentes ne sont pas inventées. Les backups sont privés et ignorés par Git.

## 6. Contrats publics et temps réel

HTTP publics, tous avec `Cache-Control: no-store` :

| Route                                   | Réponse                                                |
| --------------------------------------- | ------------------------------------------------------ |
| `/api/health`                           | Santé du backend                                       |
| `/api/current-question` et `/api/state` | Snapshot joueur expurgé                                |
| `/api/catalog`                          | Pays/régions, thèmes, niveaux et totaux, pas la banque |
| `/api/facts`                            | Faits éducatifs et repères de tous les pays            |
| `/api/leaderboard`                      | 20 meilleurs profils et leur meilleure tentative       |

Pas d’API publique `questions`, `users`, `attempts`, `settings` ou `answer`.

Socket.IO : abonnement joueur, identification/début, sélection/validation, suivant/retour ; capacité du présentateur, commandes privées, snapshots par rôle et historique réservé au pupitre. Un seul présentateur actif, plafond de 120 demandes/minute/socket et de 8 Ko/message entrant. Les demandes malformées, anciens tours ou anciens IDs de tentative sont refusés.

Les mutations sont persistées avant l’ack et la diffusion. Une **révision monotone** permet au QueryClient d’ignorer un snapshot plus ancien. Clé centrale : `['current-question', role]`. Les caches d’historiques et d’état privé sont retirés lors d’une révocation ou navigation hors du pupitre.

Le snapshot joueur ne contient pas `answer` ; sa question ne contient ni `countryId`, ni coordonnées, ni source/explication du corrigé avant résolution. L’ID public n’est pas un ID `atlas-<pays>-<niveau>`. L’ack de seconde chance est `{ "ok": true, "retry": true }`, sans corrigé. Les indices privés n’apparaissent que lorsqu’ils sont explicitement partagés.

## 7. Cartographie locale et rendu

| Fichier               | Contenu                                                      |
| --------------------- | ------------------------------------------------------------ |
| `countries-110m.json` | Premier affichage, 177 géométries                            |
| `countries-50m.json`  | Frontières détaillées des 240 pays/territoires               |
| `roads-10m.json`      | Routes Natural Earth 10m, chargement au zoom rapproché       |
| `earth-day-2048.jpg`  | Premier atlas léger, également adapté au mobile              |
| `earth-day-4096.jpg`  | Atlas naturel détaillé sur ordinateur                        |
| `earth-day-8192.jpg`  | Atlas naturel haute définition sur grand viewport compatible |

Les trois premiers fichiers sont dans `frontend/public/geo`, les trois images dans `frontend/public/textures`. **110m/50m/10m désignent des échelles en millions, pas des précisions métriques.** Il n’y a pas de couches vectorielles fleuves/lacs ; les étendues d’eau restent visibles dans l’image naturelle.

Les routes représentent les grands axes, pas toutes les rues ou le trafic. Elles ont été préparées depuis Natural Earth (`Major Highway`, `Beltway`, `Bypass`), regroupées en `major`/`minor`, quantifiées et simplifiées. Le générateur de frontières ne les retélécharge pas.

Three.js utilise une sphère, de l’éclairage, une atmosphère discrète et un atlas naturel avec frontières superposées. Pas de palette aléatoire par pays. L’atlas n’est pas reconstruit à chaque image. Les routes sont dessinées une fois au premier zoom proche. Le raycast donne `[lon, lat]`, puis l’index commun trouve un pays ; **Express refait ce test en 50m** sans faire confiance à un pays déclaré par le client.

Le rendu est à la demande hors veille, ralenti pour l’autorotation, arrêté hors écran/onglet caché. DPR, géométrie et anisotropie sont plafonnés ; ressources et contrôles sont libérés au démontage. Une vraie carte 2D de secours conserve sélection, pan, zoom et clavier si le contexte WebGL est absent ou perdu. Un bouton recrée le contexte 3D.

Les essais navigateur utilisent un vrai Chromium avec WebGL, éventuellement SwiftShader logiciel dans la sandbox. Ils ne mesurent pas les performances d’une RTX ou du grand écran physique. Voir [les crédits/licences](CREDITS.md).
