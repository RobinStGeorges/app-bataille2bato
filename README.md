# app-bataille2bato

Mini-application **Bataille 2 🚢** (bataille navale) du portail familial « Le Petit Perchoir ».
Projet totalement indépendant : code, données et déploiement distincts des autres apps.

- URL publique : `https://lepetitperchoir.fr/bataille2bato/` (servie par le routeur)
- Déploiement : Worker Cloudflare nommé **`famille-bataille2bato`** (fichiers statiques)
- Dépendances communes : `famille-core` **v0.2.0** (connexion, famille, thème), version figée par tag Git
- Port de développement : **5178**

## Principe du jeu

Deux membres de la famille, chacun sur son téléphone.

1. **Créer** une partie : elle apparaît dans « Rejoindre une partie » pour toute la famille.
2. **Rejoindre** : choisir une partie en attente (une partie qui a déjà 2 joueurs n'est plus proposée).
3. Chacun **place** ses 4 bateaux (5, 4, 3 et 2 cases) puis appuie sur **Prêt**.
   Le créateur peut placer sa flotte pendant qu'il attend un adversaire.
4. Quand les deux sont prêts, un **tirage au sort** désigne qui commence.
5. On **tire chacun son tour** : toucher une case de la grille adverse (en haut), puis « Feu ».
   La grille du bas montre ma flotte et les tirs de l'adversaire.
6. Le premier qui coule toute la flotte adverse gagne : écran **Victoire / Défaite**,
   avec **Rejouer** (revanche contre le même adversaire) ou **Retour au menu**.

### Règles retenues (modifiables)

| Situation | Choix |
|---|---|
| Bateaux qui se touchent | Autorisé (seul le chevauchement est interdit) |
| Tir qui touche | Le tour passe quand même (un tir par tour) |
| Viser | Toucher une case, puis bouton « Feu en C5 ! » (évite les tirs par erreur au doigt) |
| Bateau posé trop près du bord | Décalé automatiquement pour tenir dans la grille |
| Abandon | En deux appuis ; l'adversaire gagne |
| Revanche | Le premier qui appuie sur « Rejouer » crée la partie, **réservée** à son adversaire ; l'autre voit « X te propose une revanche » |
| Partie en attente depuis plus de 3 jours | N'est plus proposée aux autres (son créateur la voit encore et peut l'annuler) |

## Architecture

```
src/lib/engine.ts    moteur de règles PUR : placement, tirs, coulés, tour, victoire, tirage au sort
src/lib/model.ts     lecture tolérante des documents Firestore, filtres du menu
src/lib/data.ts      accès Firestore (écoutes, écritures sans attente, transactions)
src/lib/*.svelte     écrans : Home (menu), Join, Game (orchestration), Placement, Battle, End, Grid
```

**Rien de calculé n'est stocké.** L'état de la partie (à qui le tour, touché/coulé, gagnant)
est rejoué à partir des flottes et de la liste des tirs, de façon identique sur les deux téléphones.
Le premier joueur est déduit d'une graine aléatoire fixée à la création : les deux téléphones
obtiennent le même résultat sans échanger de message.

### Données en ligne (`families/{familyId}/apps/bataille2bato/…`)

```
games/{gameId}               joueurs (2 max), statut (waiting / playing / finished), graine,
                             revanche (rematchId, reservedFor), abandon (forfeitBy), gagnant
games/{gameId}/boards/{uid}  la flotte d'un joueur et « prêt » (un document par joueur)
games/{gameId}/shots/{nnn}   un document par tir (000, 001…) : tireur, case
```

- Un document par joueur et par tir : les deux téléphones n'écrivent jamais le même document
  (sauf « partie terminée », écriture identique des deux côtés).
- Un tir porte son numéro : un tir en double ou hors de son tour est ignoré par le moteur.
- **Rejoindre** et **Rejouer** utilisent une **transaction** (deux personnes qui rejoignent en même
  temps : une seule est acceptée ; les deux joueurs qui appuient sur « Rejouer » en même temps
  se retrouvent dans la même revanche). Ce sont les deux seules actions qui nécessitent le
  réseau et qui sont attendues ; toutes les autres écritures partent sans attente et
  fonctionnent hors connexion (synchronisées au retour du réseau).
- Aucune règle de sécurité à modifier (la règle générique `apps/{id}` suffit), aucun service
  supplémentaire, pas de Cloud Functions.

### Limite assumée : la triche est possible

Sans serveur (pas de Cloud Functions sur le forfait Spark), les flottes sont des documents
lisibles par tous les membres de la famille. L'interface ne montre jamais la flotte adverse
avant la fin, mais quelqu'un qui fouille la base (console du navigateur) pourrait la voir.
Pour un jeu en famille, c'est jugé acceptable. Empêcher cela demanderait un service en ligne
supplémentaire ou une modification des règles de sécurité : décision à prendre ensemble.

## Fiche catalogue (Firestore, collection `catalog`, document `bataille2bato`)

| Champ | Valeur |
|---|---|
| `name` | `Bataille 2` |
| `description` | `Bataille navale` |
| `icon` | `🚢` |
| `color` | `#0a6f8f` |
| `path` | `/bataille2bato/` |
| `status` | `active` |
| `order` (nombre) | `50` |

À créer dans **chaque** projet Firebase (dev et prod).

## Commandes

```
npm install
npm run dev      # http://localhost:5178/bataille2bato/  (projet famille-dev, connexion de dev intégrée)
npm test         # moteur, lecture des données, couche Firestore (faux Firestore en mémoire),
                 # parcours complet à deux téléphones dans l'interface
npm run check    # types
npm run build    # génère dist/ (projet famille-prod)
```

## Déploiement

Cloudflare Workers Builds, dépôt GitHub `app-bataille2bato`, nom du Worker **`famille-bataille2bato`**,
build `npm run build`, deploy `npx wrangler deploy` (config : `wrangler.jsonc`).

## Offres gratuites

Une partie complète coûte environ 30 à 200 écritures (un document par tir) et, en lectures,
à peu près autant multiplié par deux (chaque tir est reçu par les deux téléphones).
Le forfait Spark autorise 20 000 écritures et 50 000 lectures par jour : plusieurs dizaines de
parties par jour restent très loin des limites. Les parties terminées restent en base
(quelques Ko chacune, sans impact sur le 1 Go gratuit) ; le menu ne lit que les parties non terminées.

## Limites connues (première version)

- Pas de notification quand c'est à votre tour (il faut avoir l'app ouverte ; nécessiterait un
  service d'envoi de notifications, donc une décision à prendre ensemble).
- Pas d'historique ni de classement des parties terminées.
- Le placement en cours n'est pas sauvegardé si la page est rechargée avant « Prêt ».
- Bandeaux hors-ligne / mise à jour et écran de connexion copiés de Mr White (identiques aux autres apps).
