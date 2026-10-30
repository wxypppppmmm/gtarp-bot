# Map Build Fight 1v1 (UEFN), guide pour débutant

Ce que fait la map : deux joueurs s'affrontent en build fight sur une arène, au milieu d'un beau paysage, avec de la musique. Chaque manche remet la map à zéro, et le premier à X manches gagne.

---

## 0. Ce qu'il te faut

- Un **PC Windows** avec une carte graphique correcte. UEFN ne marche ni sur console, ni sur Mac, ni sur téléphone.
- **Epic Games Launcher**, avec **Fortnite** et **Unreal Editor for Fortnite** installés (onglet Bibliothèque).
- Un **compte créateur** : https://create.fortnite.com. Il sert seulement à publier ; pour créer et tester, pas besoin.

## 1. Créer le projet

1. Lance UEFN, puis choisis **Island Templates → Blank**.
2. Donne-lui un nom, par exemple `BuildFight1v1`, puis **Create**.

Les contrôles de base dans l'éditeur :
- Clic droit maintenu + **ZQSD** pour te déplacer, molette pour changer la vitesse.
- **W / E / R** pour déplacer, tourner ou redimensionner un objet sélectionné.
- **F** pour te centrer sur l'objet sélectionné.
- **Content Browser** (en bas) : tous les objets et devices.
- **Details** (à droite) : les réglages de l'objet sélectionné.

## 2. Réglages de l'île (le cœur du 1v1)

Dans **Outliner**, sélectionne **IslandSettings** et règle dans **Details** :

| Réglage | Valeur |
|---|---|
| Max Players | 2 |
| Teams | 2 (Team Size 1) |
| Total Rounds | 5, 7 ou 9 (au choix) |
| Round Win Condition / Eliminations to End | 1 |
| Spawn Location | Player Spawn Pads |
| Allow Building | All |
| Infinite Building Materials | On |
| Infinite Ammo | On |
| Fall Damage | Off |
| Respawn | Off (la manche se termine au kill) |
| Spawn Immunity Time | 0 |

Chaque nouvelle manche remet automatiquement la map à zéro, donc les constructions disparaissent toutes seules.

## 3. L'arène

1. Pose le sol : dans Content Browser → **Fortnite → Galleries**, prends une *Floor Gallery* (ou un simple cube aplati).
   - Une taille d'environ **12 x 12 cases** (1 case = 512 unités) convient bien pour un 1v1.
2. Pose 2 **Player Spawner** (Content Browser → Fortnite → Devices) aux deux bouts de l'arène :
   - le premier en **Player Team : 1**,
   - le second en **Player Team : 2**.
3. Pose 4 **Barrier** autour de l'arène pour que personne ne sorte. Mets-les assez hautes pour laisser de la place aux builds.

## 4. Les beaux paysages

C'est la partie où tu peux t'amuser :

- **Terrain** : passe en mode **Landscape** (en haut à gauche, *Selection Mode → Landscape*) → **New** → **Create**.
  - Onglet **Sculpt** pour faire des montagnes autour de l'arène (outil *Sculpt*, *Smooth*, *Noise*).
  - Onglet **Paint** pour peindre herbe, roche ou neige.
- **Eau** : Content Browser → *Water* → *Water Body Lake* ou *Ocean*.
- **Ciel et lumière** : pose un **Day Sequence Device** et règle l'heure (le coucher de soleil vers 18h-19h rend très bien).
- **Effet "beau rendu"** : pose un **Post Process Volume**, coche *Infinite Extent (Unbound)*, puis monte un peu *Saturation*, *Contrast* et *Bloom*.
- **Décor** : dans Content Browser → *Fortnite → Galleries / Prefabs*, ajoute des arbres, des rochers et des ruines **autour** de l'arène, pas dedans.

> Ne surcharge pas ton île : en haut, le **Memory Calculator** te montre la mémoire utilisée. Reste sous 100 %.

## 5. La musique

Deux options :

- **Simple** : pose un **Radio** device et choisis une musique Fortnite dans *Audio*.
- **Avec le script Verse** (section 7) : pose 1 à 3 **Audio Player** devices.
  - Pour chacun, choisis un son dans *Audio*, coche *Loop*, et règle *Play on Hit / Auto Play* sur **Off** (c'est le script qui les lance).
  - Le script en choisit un au hasard à chaque partie.

⚠️ N'importe **pas** de musique protégée (rap, musique commerciale…) : ton île serait refusée ou supprimée. Utilise les musiques d'Epic ou de la musique libre de droits.

## 6. Le "changement de résolution"

Sois prévenu : **aucune map ne peut changer la résolution du joueur**, et c'est pareil pour l'écran étiré (stretched). C'est un réglage du jeu, pas de l'île, et Epic ne laisse pas les créateurs y toucher.

Ce que tu peux faire :
- Mettre dans la description de ton île : « Joue en res étirée pour la meilleure expérience ».
- Toi-même, en jeu : **Paramètres → Vidéo → Mode fenêtre = Plein écran**, puis choisir la résolution. Pour la vraie res étirée, il faut modifier le fichier `GameUserSettings.ini` de Fortnite. Dis-moi si tu veux le tuto.

## 7. Le script Verse (kill = vie + bouclier + armes rechargés)

Le fichier se trouve ici : [`Verse/buildfight_manager.verse`](Verse/buildfight_manager.verse).

1. Pose un **Item Granter** et mets-y ton loadout (par exemple pompe, AR, SMG). Réglages :
   - *On Grant Action* : **Clear All Items**,
   - *Grant on Game Start* : **Off**.
2. Pose un **HUD Message** device, avec *Display Time* : 2 secondes.
3. Ouvre **Verse → Verse Explorer**, fais un clic droit sur ton projet → **Create new Verse file** → *Verse Device*, et nomme-le `buildfight_manager`.
4. Remplace tout le contenu par celui du fichier `buildfight_manager.verse`, puis enregistre (Ctrl+S).
5. Clique sur **Verse → Build Verse Code** (Ctrl+Shift+B). Il ne doit y avoir aucune erreur.
6. Dans Content Browser → dossier *CreativeDevices*, glisse **buildfight_manager** dans la map.
7. Sélectionne-le et relie-le à tes devices dans **Details** :
   - *GranterLoadout* → ton Item Granter,
   - *MessageKill* → ton HUD Message,
   - *Musiques* → clique sur **+** pour chaque Audio Player,
   - *Spawners* → clique sur **+** pour chacun des 2 Player Spawners.

Si une erreur s'affiche au build, copie-la-moi et je la corrige.

## 8. Tester et publier

1. Clique sur **Launch Session** (en haut). Fortnite s'ouvre sur ton île. Invite un ami pour tester le 1v1.
2. Après chaque modification dans l'éditeur, clique sur **Push Changes**.
3. Pour publier : **Project → Upload** puis, sur create.fortnite.com, ajoute image, description et tags (*1v1*, *Build Fight*, *PvP*), et soumets.

---

### Idées pour la suite
- Un tableau des scores avec le nombre de victoires.
- Un lobby d'attente avec un sélecteur de loadout.
- Des arènes différentes selon la manche (neige, désert, ville).
