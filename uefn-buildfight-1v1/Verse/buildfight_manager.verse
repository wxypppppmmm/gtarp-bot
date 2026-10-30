# Gestionnaire de Build Fight 1v1
# - Lance une musique au hasard au début de la partie
# - Donne le loadout (armes) à chaque apparition
# - Recharge vie + bouclier + loadout du joueur qui fait une élimination
#   et lui affiche un message

using { /Fortnite.com/Devices }
using { /Fortnite.com/Characters }
using { /Fortnite.com/Game }
using { /Verse.org/Simulation }
using { /Verse.org/Random }

MessageElimination<localizes> : message = "ÉLIMINATION ! Vie, bouclier et armes rechargés"

buildfight_manager := class(creative_device):

    # Item Granter qui contient les armes du loadout
    @editable
    GranterLoadout : item_granter_device = item_granter_device{}

    # HUD Message affiché au joueur qui fait une élimination
    @editable
    MessageKill : hud_message_device = hud_message_device{}

    # Audio Players (une musique est choisie au hasard)
    @editable
    Musiques : []audio_player_device = array{}

    # Les Player Spawners des deux joueurs
    @editable
    Spawners : []player_spawner_device = array{}

    var Abonnements : [player]cancelable = map{}

    OnBegin<override>()<suspends> : void =
        MessageKill.SetText(MessageElimination)
        LancerMusique()
        for (Spawner : Spawners):
            Spawner.SpawnedEvent.Subscribe(OnJoueurSpawn)

    LancerMusique() : void =
        if (Musiques.Length > 0):
            Index := GetRandomInt(0, Musiques.Length - 1)
            if (Musique := Musiques[Index]):
                Musique.Play()

    OnJoueurSpawn(Agent : agent) : void =
        GranterLoadout.GrantItem(Agent)
        if:
            Joueur := player[Agent]
            Personnage := Agent.GetFortCharacter[]
        then:
            # On remplace l'ancien abonnement pour ne pas compter deux fois
            if (Ancien := Abonnements[Joueur]):
                Ancien.Cancel()
            Nouveau := Personnage.EliminatedEvent().Subscribe(OnElimination)
            if (set Abonnements[Joueur] = Nouveau) {}

    OnElimination(Resultat : elimination_result) : void =
        if:
            Tueur := Resultat.EliminatingCharacter?
            Tueur.IsActive[]
            Agent := Tueur.GetAgent[]
        then:
            Tueur.SetHealth(Tueur.GetMaxHealth())
            Tueur.SetShield(Tueur.GetMaxShield())
            GranterLoadout.GrantItem(Agent)
            MessageKill.Show(Agent)
