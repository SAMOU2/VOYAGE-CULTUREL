# Crédits et licences

## Marque ALGOMANIA

Logo **ALGOMANIA Scientific Club** fourni pour ce projet par l’utilisateur. Le WebP est un recadrage/redimensionnement du fichier transmis, pas une marque générée ou redessinée. L’icône est extraite du même visuel. Les droits de marque restent à leurs titulaires ; aucune licence générale de réutilisation du logo n’est créée ici.

## Image terrestre

- **Créateur : Solar System Scope / INOVE.**
- Œuvre : **Earth Day Map**, texture équirectangulaire 8192 × 4096.
- [Page officielle et conditions](https://www.solarsystemscope.com/textures/).
- [Fichier officiel 8K](https://www.solarsystemscope.com/textures/download/8k_earth_daymap.jpg).
- **[Creative Commons Attribution 4.0 International — CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**.
- Modifications : redimensionnement 2K/4K et recompression JPEG des trois résolutions. Frontières, routes et marqueurs sont composés séparément à l’exécution.

La page officielle, consultée le **5 novembre 2026**, autorise utilisation, adaptation et partage sous CC BY 4.0. La texture est basée sur des données et images NASA retravaillées par Solar System Scope : **elle n’est pas présentée comme une image NASA dans le domaine public**.

L’original a été récupéré via le miroir Enyss/Ersiss-System, puis identifié par son blob Git **`8948689d8aa2de78210e608469eabddbf0e0f267`**. Il est identique au fichier [explicitement crédité sous CC BY 4.0 dans MINELOG](https://github.com/ChrisDong-THU/MINELOG/blob/b414ffb87b3090735a504c866ec69847b543b035/public/earth/README.md), [image correspondante](https://github.com/ChrisDong-THU/MINELOG/blob/b414ffb87b3090735a504c866ec69847b543b035/public/earth/solar-system-scope-earth-8k.jpg).

La notice est également distribuée dans [`frontend/public/textures/ATTRIBUTION.txt`](../frontend/public/textures/ATTRIBUTION.txt) et accessible depuis l’interface. Ni NASA, ni INOVE, ni Solar System Scope ne sont présentés comme soutenant ou certifiant ce jeu.

## Bases géographiques

### Natural Earth / world-atlas

Frontières 110m/50m et routes 10m : **données Natural Earth dans le domaine public**.

- [Natural Earth via world-atlas](https://github.com/topojson/world-atlas).
- [Natural Earth Vector](https://github.com/nvkelso/natural-earth-vector).
- Traductions et codes via [i18n-iso-countries](https://github.com/michaelwittig/node-i18n-iso-countries), licence MIT pour le paquet.

La carte sert un jeu de repérage ; elle ne prétend ni offrir une précision cadastrale/GPS, ni régler la souveraineté de territoires disputés. Les noms/IDs `ne-*` explicitent les géométries sans code ISO fourni par l’atlas.

### mledoze/countries

Capitales, codes, régions et superficies utilisés dans les faits et les questions générées :

- [mledoze/countries](https://github.com/mledoze/countries).
- Référence figée : blob **`455b3fd85abcf8fa01e0fca63e84a853c9ff4422`** de `countries.json`.
- **[Open Database License 1.0 — ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)**.
- [Licence de la source](https://github.com/mledoze/countries/blob/master/LICENSE), dont une [copie est incluse](licences/ODbL-1.0.txt).

**La base dérivée distribuée dans `data/facts.json` et la compilation `data/questions.json` est mise à disposition sous ODbL 1.0 pour les droits sur la base de données.** Les modifications sont l’alignement sur les IDs Natural Earth, les traductions françaises indiquées dans le générateur, les repères intérieurs, les formulations de questions/faits et leur regroupement. Le générateur et les fichiers de la base dérivée sont inclus, pas seulement un résultat fermé.

Conserver cette attribution, la notice et les obligations de partage à l’identique applicables à une base dérivée lors d’une redistribution. L’ODbL porte sur les droits de base de données, pas automatiquement sur le code applicatif, le logo ou tous les contenus individuels. Les 120 questions éditoriales antérieures conservent leurs références ; aucune nouvelle licence sur les pages de ces références n’est revendiquée.

Les données du référentiel sont une photographie de source, pas une garantie d’actualité. Les tests ne remplacent pas une relecture éditoriale avant l’événement.

## Polices et bibliothèques

Les polices **Inter** et **Noto Sans Arabic** sont distribuées localement via Fontsource, sous **SIL Open Font License 1.1**, avec leurs notices [Inter](../frontend/public/licenses/Inter-OFL.txt) et [Noto Sans Arabic](../frontend/public/licenses/Noto-Sans-Arabic-OFL.txt), également servies sous `/licenses/`. Pas de requête vers Google Fonts au lancement du jeu.

Next.js, React, Express, Three.js, Socket.IO, TanStack Query, d3-geo et topojson-client restent soumis à leurs licences propres, présentes dans les dépendances npm. Consulter leurs fichiers `LICENSE` pour les redistributions de code ou de binaires. Les présentes notices ne choisissent pas implicitement une licence générale pour tout le code applicatif du dépôt.

## Données des visiteurs

Les noms réels, tentatives et sauvegardes privées de migration **ne sont pas des données libres à publier**. Ils sont locaux, ignorés par Git et exclus des exemples. Les personnes et scores des captures sont fictifs. Ne pas joindre `users.json` ou ses backups à une publication du dépôt.
