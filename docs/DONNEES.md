# Données du stand

## 1. Pays : `data/countries.json`

Catalogue canonique de **240 pays et territoires cartographiques** : `id`, `name` en français,
`iso2` si disponible et `center` `[longitude, latitude]`. Ce nombre comprend des territoires et
régions de Natural Earth, pas seulement des États souverains ; les frontières ne constituent pas
une prise de position politique.

Les IDs ISO numériques sont des **chaînes à trois chiffres** : `"012"` (Algérie), `"250"`
(France), `"392"` (Japon). Ne jamais les convertir en nombres, sinon les zéros disparaissent.
Les cinq régions sans code fourni par world-atlas ont des IDs stables `ne-*` distincts :
Somaliland, Kosovo, Chypre du Nord, territoires de l’océan Indien et glacier de Siachen.
Les deux géométries Natural Earth partageant l’ISO de l’Australie sont réunies en un MultiPolygon :
un seul ID, un seul pays dans le catalogue, toutes ses îles surlignées.

Le centre est un repère géographique, **pas nécessairement un point terrestre cliquable** pour un
archipel. Le serveur valide toujours les véritables polygones et non ce centre.

## 2. Questions : `data/questions.json`

```json
{
  "version": "3.0.0",
  "checkedAt": "2026-11-04",
  "themes": [],
  "difficulties": [],
  "byCountry": {
    "250": [
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
    ]
  }
}
```

Exemple de structure uniquement ; le fichier réel contient les 6 thèmes, les 4 niveaux et les
120 questions, avec 5 questions par couple thème/niveau. `countryId` doit correspondre à la clé
`byCountry` et à un ID du catalogue. Les noms/ISO des pays ne sont plus recopiés dans chaque fiche.

`location` est le lieu culturel évoqué, parfois côtier ou maritime (par exemple un récif) :
**la réponse est son pays**, pas sa distance à ce point. Une côte simplifiée peut ne pas contenir
la position exacte d’une ville littorale ; il faut sélectionner l’intérieur du pays sur le globe.

Les champs `countryId`, `location`, `explanation` et `source` ne sont envoyés au joueur qu’après
résolution. Un indice ne publie que son propre texte. Un ack de seconde chance ne contient que
`ok`/`retry`, jamais la réponse, sa distance ou ses coordonnées. La banque n’est ni placée dans
`frontend/public`, ni importée par le frontend, ni exposée par une API.

`checkedAt` est une métadonnée héritée de la banque, **pas une preuve de nouvelle vérification
éditoriale de chaque page source**. Les tests contrôlent cohérence, références HTTPS, géométrie
et couverture des niveaux. Faire relire les questions et leurs sources avant l’événement.

## 3. Visiteurs et classement : `data/users.json`

Créé automatiquement, **ignoré par Git**. `data/users.example.json` décrit le fichier vide versionné :

```json
{ "version": 1, "users": [], "leaderboard": [] }
```

- `users` : ID technique aléatoire, pseudo facultatif et date de création.
- `leaderboard` : ID, `userId`, score, nombre de bonnes réponses/questions, date de fin et durée.
- Aucun compte, mot de passe, inscription, email ni profil personnel.
- Le JSON reste côté serveur ; `/api/leaderboard` ne diffuse que rang, pseudo, score,
  bonnes réponses, questions et date, pour les 20 meilleurs passages terminés.
- Sauvegarde par file sérialisée, fichier temporaire puis remplacement atomique ; un passage
  n’est pas enregistré deux fois. Un fichier illisible provoque une erreur explicite, il n’est
  jamais remplacé silencieusement par un classement vide.
- Arrêter le serveur avant de sauvegarder/remettre à zéro ce fichier. Ne pas démarrer deux
  backends écrivant dans le même fichier : l’atomicité protège un processus unique, pas plusieurs instances.

## 4. Cartographie locale

Tout est servi par le stand, sans tuiles, CDN ni service externe pendant le jeu.

| Fichier dans `frontend/public/geo/` | Taille approximative | Contenu                                                         |
| ----------------------------------- | -------------------- | --------------------------------------------------------------- |
| `countries-110m.json`               | 112 Ko               | Premier affichage, 177 pays/territoires, échelle 1:110 millions |
| `countries-50m.json`                | 748 Ko               | Détail de 240 pays/territoires, échelle 1:50 millions           |
| `roads-10m.json`                    | 968 Ko               | Axes routiers réels, échelle 1:10 millions, chargés au zoom     |

**110m/50m/10m sont des échelles cartographiques en millions, pas une précision en mètres.**
Les couches de fleuves et de lacs ont été retirées. Les routes ne sont pas des itinéraires GPS :
ce sont les grands axes Natural Earth, pas toutes les rues ou les routes en temps réel.

Sources et licences :

- [Natural Earth via world-atlas](https://github.com/topojson/world-atlas) : géométrie, domaine public.
- [Natural Earth Vector](https://github.com/nvkelso/natural-earth-vector) : routes, domaine public.
- `i18n-iso-countries` : traduction française et correspondance ISO, licence MIT.
- Three.js, d3-geo, topojson-client : bibliothèques sous licences libres, conservées dans les dépendances npm.

Les routes déjà versionnées ont été préparées depuis `ne_10m_roads.geojson` : types
`Major Highway`, `Beltway`, `Bypass`, séparation `major` (scalerank ≤ 4) / `minor`, regroupement
en MultiLineString, quantification 1e4 et simplification 2e-3 avec topojson-server/topojson-simplify.
Le générateur de frontières ne les retélécharge pas.

```text
npm run build:geo
```

Ce script **TypeScript** produit les deux topologies françaises et le catalogue des pays depuis
le paquet npm `world-atlas`, sans dépendre d’un téléchargement de données à l’exécution du jeu.
Il conserve les IDs, réunit les géométries doublonnées et garantit des clés `ne-*` distinctes.

## 5. Rendu et picking

`frontend/src/components/Globe.tsx` utilise Three.js : sphère maillée, matériaux éclairés,
atmosphère, texture atlas et marqueurs. Une géométrie légère apparaît d’abord ; le détail est
chargé et converti en texture une fois. Les routes sont ajoutées à cette texture au premier zoom
rapproché. Pas de nouveau dessin de tous les pays à chaque image.

Le raycast donne un point 3D, converti en `[lon, lat]` par `shared/geometry.ts`, puis testé dans
l’index des pays. **Le serveur refait ce test avec le 50m**, sans faire confiance au nom/ID envoyé
par un navigateur. Les pays traversant l’antiméridien et les petites îles sont testés explicitement.

Le rendu s’arrête au repos, hors écran et lorsque l’onglet est masqué. DPR, anisotropie et maillage
sont plafonnés ; textures, contrôles et géométries sont libérés au démontage. Le mode de secours
utilise un planisphère Canvas 2D avec la même géométrie, pas une fausse 3D.

Les captures `docs/apercus/interface-*.png` sont prises dans un vrai navigateur. Les tests UI
vérifient également le contexte WebGL, le chargement différé des routes, le secours GPU et le
plein écran ; ils ne sont pas un benchmark matériel d’une carte RTX.
