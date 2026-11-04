# Données cartographiques

Toutes les données de carte sont **locales** (dossier `public/geo/`) : aucune tuile, aucun service
externe, aucun appel réseau pendant le jeu. Le serveur et le navigateur lisent les mêmes fichiers.

| Fichier | Poids | Contenu | Source | Licence |
| --- | --- | --- | --- | --- |
| `countries-50m.json` | 748 Ko | 241 pays et territoires, frontières détaillées (1:50 millions) | Natural Earth via [`world-atlas`](https://github.com/topojson/world-atlas) | domaine public |
| `countries-110m.json` | 112 Ko | 177 pays et territoires, version allégée (1:110 millions) | idem | domaine public |
| `lakes-50m.json` | 527 Ko | grands lacs et mers intérieures | Natural Earth `ne_50m_lakes` | domaine public |
| `rivers-50m.json` | 725 Ko | fleuves et rivières principaux | Natural Earth `ne_50m_rivers_lake_centerlines` | domaine public |
| `roads-10m.json` | 965 Ko | grands axes routiers mondiaux | Natural Earth `ne_10m_roads` | domaine public |

Les noms de pays sont **traduits en français** à la génération (`i18n-iso-countries`, codes ISO
numériques), avec repli sur le nom anglais.

## Régénérer les fichiers

```bash
npm install                 # installe aussi les outils de génération
node scripts/build-geo.mjs  # → public/geo/countries-50m.json et countries-110m.json
```

## Comment les couches ont été préparées

Les trois couches Natural Earth ont été téléchargées depuis
[`nvkelso/natural-earth-vector`](https://github.com/nvkelso/natural-earth-vector) puis converties
avec `topojson-server` + `topojson-simplify` :

- **lacs** : `ne_50m_lakes.geojson` → un seul MultiPolygon, quantification 1e5, simplification 4e-4 ;
- **rivières** : `ne_50m_rivers_lake_centerlines.geojson` → deux MultiLineString
  (`major` = scalerank ≤ 4, `minor` = le reste), quantification 1e5, simplification 1,5e-3 ;
- **routes** : `ne_10m_roads.geojson`, filtré sur `Major Highway`, `Beltway` et `Bypass`, réparti en
  `major` (scalerank ≤ 4) et `minor` (5-10), quantification 1e4, simplification 2e-3.

Le regroupement en deux MultiLineString par couche est ce qui garde les fichiers sous 1 Mo : un
TopoJSON avec une feature par route pèserait plus de 6 Mo pour la même géométrie.

## Niveau de détail et performances

Le rendu utilise deux résolutions pour rester fluide :

- pendant un déplacement ou une rotation (et pour la rotation automatique de l'accueil) : **110m** (1:110 millions),
  sans rivières ni routes ;
- au repos : **50m** (1:50 millions), avec lacs, rivières et routes selon le zoom.

Seuils d'affichage des couches : lacs toujours, rivières à partir de ×1,35 (carte) / ×1,5 (globe),
routes à partir de ×2,2 / ×2,6.

La carte de fond est dessinée dans un canvas hors écran et recopiée à chaque image : survol,
sélection et repères se redessinent alors en quelques millisecondes.

## Contrôle visuel

```bash
npm run preview:map   # génère docs/apercus/*.png sans navigateur
```

Aperçus versionnés : `docs/apercus/globe.png`, `carte-monde.png`, `carte-europe.png`,
`carte-zoom.png`.

## Vérifier une question

Chaque fiche de `data/questions.json` porte un `isoN` (code ISO numérique) qui doit exister dans
`public/geo/countries-50m.json`, et des `coords` `[lon, lat]`. Le serveur utilise ce même fichier
pour savoir **dans quel pays le joueur a cliqué** (`server/geo.mjs`). L’index géométrique est
commun au navigateur et au serveur (`src/lib/map-geometry.mjs`), notamment pour traiter les pays
qui traversent l’antiméridien. `npm run test:map` vérifie leur détection et les clics hors carte.

```bash
node -e "
const { countryAt } = await import('./server/geo.mjs');
console.log(countryAt(31.23, 30.04)); // → { id: '818', name: 'Égypte' }
"
```
