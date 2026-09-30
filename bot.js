// ⚠️ token hardcodé — ne partage pas ce fichier
const TOKEN = 'MTU1NDczMzA2NTAwMjE2MDEzMA.GvejoO.4lCPGaa4RXPUVpm1Zb_NsiPC5Imq73AtkmQlJs';

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, PermissionFlagsBits, SlashCommandBuilder, REST, Routes,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const Database = require('better-sqlite3');

const db = new Database('gtarp.db');
db.pragma('journal_mode = WAL');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ========== DATABASE ==========
db.exec(`
CREATE TABLE IF NOT EXISTS players (
  user_id TEXT PRIMARY KEY,
  character_name TEXT,
  cash INTEGER DEFAULT 8500,
  bank INTEGER DEFAULT 2500,
  dirty INTEGER DEFAULT 0,
  job TEXT DEFAULT 'Unemployed',
  job_grade INTEGER DEFAULT 0,
  inventory TEXT DEFAULT '[]',
  vehicles TEXT DEFAULT '[]',
  properties TEXT DEFAULT '[]',
  phone TEXT UNIQUE,
  iban TEXT UNIQUE,
  cards TEXT DEFAULT '[]',
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  channel_id TEXT,
  status TEXT DEFAULT 'open'
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id TEXT,
  to_id TEXT,
  amount INTEGER,
  type TEXT,
  label TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT,
  action TEXT,
  target_id TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tx_from ON transactions(from_id);
CREATE INDEX IF NOT EXISTS idx_tx_to ON transactions(to_id);
CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);
`);

const getP          = db.prepare('SELECT * FROM players WHERE user_id = ?');
const getPByPhone   = db.prepare('SELECT * FROM players WHERE phone = ?');
const insertP       = db.prepare('INSERT OR IGNORE INTO players (user_id, character_name, phone, iban) VALUES (?, ?, ?, ?)');
const saveP         = db.prepare(`UPDATE players SET cash=?, bank=?, dirty=?, job=?, job_grade=?, inventory=?, vehicles=?, properties=?, cards=?, xp=?, level=?, character_name=? WHERE user_id=?`);
const insertTx      = db.prepare('INSERT INTO transactions (from_id, to_id, amount, type, label) VALUES (?,?,?,?,?)');
const insertLog     = db.prepare('INSERT INTO logs (actor_id, action, target_id, details) VALUES (?,?,?,?)');
const insertTicket  = db.prepare('INSERT INTO tickets (user_id, channel_id) VALUES (?, ?)');
const getOpenTicket = db.prepare('SELECT * FROM tickets WHERE user_id = ? AND status = ?');
const closeTicket   = db.prepare('UPDATE tickets SET status = ? WHERE channel_id = ?');

// ========== HELPERS ==========
function parse(s) { try { return JSON.parse(s || '[]'); } catch { return []; } }

function genPhone() {
  for (let i = 0; i < 20; i++) {
    const p = '555-' + Math.floor(1000 + Math.random() * 9000);
    if (!getPByPhone.get(p)) return p;
  }
  return '555-' + Date.now().toString().slice(-4);
}
function genIban() {
  return 'LS' + Math.floor(1000000000000000 + Math.random() * 9000000000000000);
}
function save(p) {
  saveP.run(p.cash, p.bank, p.dirty, p.job, p.job_grade,
    JSON.stringify(p.inventory), JSON.stringify(p.vehicles), JSON.stringify(p.properties),
    JSON.stringify(p.cards), p.xp, p.level, p.character_name, p.user_id);
}
function addTx(from, to, amount, type, label) { insertTx.run(from, to, amount, type, label); }
function logAction(actor, action, target, details) { insertLog.run(actor, action, target, details); }
function hydrate(p) {
  if (!p) return null;
  p.inventory  = parse(p.inventory);
  p.vehicles   = parse(p.vehicles);
  p.properties = parse(p.properties);
  p.cards      = parse(p.cards);
  return p;
}
function levelUp(p) {
  let leveled = 0;
  while (p.xp >= p.level * 100) { p.xp -= p.level * 100; p.level++; leveled++; }
  return leveled;
}

// ========== COOLDOWNS ==========
const cooldowns = new Map();
function checkCd(uid, key, ms) {
  const k = `${uid}:${key}`;
  const now = Date.now();
  const until = cooldowns.get(k) || 0;
  if (until > now) return Math.ceil((until - now) / 1000);
  cooldowns.set(k, now + ms);
  return 0;
}

// ========== JOBS ==========
const JOBS = [
  { name: 'Unemployed',   pay: 0   },
  { name: 'Taxi',         pay: 180 },
  { name: 'Mechanic',     pay: 220 },
  { name: 'Police',       pay: 420 },
  { name: 'EMS',          pay: 380 },
  { name: 'Real Estate',  pay: 300 },
  { name: 'Lawyer',       pay: 350 },
  { name: 'Dealer',       pay: 0   },
  { name: 'Gunsmith',     pay: 0   }
];
const JOB_MAP = Object.fromEntries(JOBS.map(j => [j.name.toLowerCase(), j]));

// ========== COMMANDES ==========
const cmds = [
  new SlashCommandBuilder().setName('creerperso').setDescription('Créer ton personnage')
    .addStringOption(o => o.setName('prenom').setRequired(true).setDescription('Prénom'))
    .addStringOption(o => o.setName('nom').setRequired(true).setDescription('Nom')),

  new SlashCommandBuilder().setName('profil').setDescription('Fiche RP')
    .addUserOption(o => o.setName('joueur')),

  new SlashCommandBuilder().setName('wallet').setDescription('Portefeuille + cartes'),

  new SlashCommandBuilder().setName('banque').setDescription('Banque (dépôt/retrait)'),

  new SlashCommandBuilder().setName('donner').setDescription('Donner du cash')
    .addUserOption(o => o.setName('joueur').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder().setName('job').setDescription('Jobs')
    .addStringOption(o => o.setName('action').setRequired(true).addChoices(
      { name: 'Liste',      value: 'liste'    },
      { name: 'Postuler',   value: 'postuler' },
      { name: 'Démissionner', value: 'quit'  }
    ))
    .addStringOption(o => o.setName('metier')),

  new SlashCommandBuilder().setName('inventaire').setDescription('Inventaire'),

  new SlashCommandBuilder().setName('utiliser').setDescription('Utiliser un item')
    .addStringOption(o => o.setName('item').setRequired(true)),

  new SlashCommandBuilder().setName('vehicules').setDescription('Tes véhicules'),

  new SlashCommandBuilder().setName('proprietes').setDescription('Tes propriétés'),

  new SlashCommandBuilder().setName('telephone').setDescription('Téléphone')
    .addStringOption(o => o.setName('action').setRequired(true).addChoices(
      { name: 'Mon numéro', value: 'numero'  },
      { name: 'Appeler',    value: 'appeler' },
      { name: 'SMS',        value: 'sms'     }
    ))
    .addUserOption(o => o.setName('joueur'))
    .addStringOption(o => o.setName('message')),

  new SlashCommandBuilder().setName('crime').setDescription('Actions illégales')
    .addStringOption(o => o.setName('action').setRequired(true).addChoices(
      { name: 'Braquage ATM', value: 'atm'         },
      { name: 'Blanchiment',  value: 'blanchiment'  },
      { name: 'Voir dirty',   value: 'dirty'        }
    )),

  new SlashCommandBuilder().setName('payday').setDescription('Récupérer la paye'),

  new SlashCommandBuilder().setName('idcard').setDescription('Carte d\'identité'),

  new SlashCommandBuilder().setName('facture').setDescription('Envoyer une facture')
    .addUserOption(o => o.setName('joueur').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName('motif').setRequired(true)),

  new SlashCommandBuilder().setName('ticket').setDescription('Ticket staff'),

  new SlashCommandBuilder().setName('admin').setDescription('Admin')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName('setmoney')
      .setDescription('Modifier l\'argent')
      .addUserOption(o => o.setName('j').setRequired(true).setDescription('Joueur'))
      .addIntegerOption(o => o.setName('cash').setRequired(true).setDescription('Cash'))
      .addIntegerOption(o => o.setName('bank').setRequired(true).setDescription('Banque')))
    .addSubcommand(s => s.setName('setjob')
      .setDescription('Changer le job')
      .addUserOption(o => o.setName('j').setRequired(true).setDescription('Joueur'))
      .addStringOption(o => o.setName('job').setRequired(true).setDescription('Job'))
      .addIntegerOption(o => o.setName('grade').setRequired(true).setDescription('Grade')))
    .addSubcommand(s => s.setName('giveitem')
      .setDescription('Donner un item')
      .addUserOption(o => o.setName('j').setRequired(true).setDescription('Joueur'))
      .addStringOption(o => o.setName('item').setRequired(true).setDescription('Nom item'))
      .addIntegerOption(o => o.setName('qty').setRequired(true).setMinValue(1).setDescription('Quantité')))
    .addSubcommand(s => s.setName('addcard')
      .setDescription('Ajouter une carte')
      .addUserOption(o => o.setName('j').setRequired(true).setDescription('Joueur'))
      .addStringOption(o => o.setName('type').setRequired(true).addChoices(
        { name: 'Perso', value: 'personal' },
        { name: 'Pro',   value: 'pro'      }
      ).setDescription('Type'))
      .addStringOption(o => o.setName('nom').setRequired(true).setDescription('Nom carte')))
];

// ========== READY ==========
client.once('ready', async () => {
  console.log(`Connecté : ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: cmds.map(c => c.toJSON()) });
  console.log('Commandes enregistrées');
});

// ========== INTERACTIONS ==========
client.on('interactionCreate', async (i) => {
  try {

    // ---- BOUTONS ----
    if (i.isButton()) {

      // Fermer ticket
      if (i.customId === 'close_ticket') {
        if (!i.member?.permissions.has(PermissionFlagsBits.ManageChannels))
          return i.reply({ content: 'Staff only.', ephemeral: true });
        closeTicket.run('closed', i.channel.id);
        await i.reply('Ticket fermé dans 3s...');
        return setTimeout(() => i.channel.delete().catch(() => {}), 3000);
      }

      // Payer une facture
      if (i.customId.startsWith('inv_ok_')) {
        const parts   = i.customId.split('_');
        const fromUid = parts[2];
        const amount  = parseInt(parts[3], 10);
        const payer   = hydrate(getP.get(i.user.id));
        if (!payer?.character_name) return i.update({ content: 'Pas de personnage.', components: [] });
        if (payer.bank < amount) return i.update({ content: `❌ Solde insuffisant — banque : **${payer.bank}$**.`, components: [] });
        const from = hydrate(getP.get(fromUid));
        if (!from) return i.update({ content: 'Émetteur introuvable.', components: [] });
        payer.bank -= amount;
        from.bank  += amount;
        save(payer); save(from);
        addTx(i.user.id, fromUid, amount, 'INVOICE', 'Paiement facture');
        return i.update({ content: `✅ Facture de **${amount}$** payée à **${from.character_name}**.`, embeds: [], components: [] });
      }

      // Refuser une facture
      if (i.customId.startsWith('inv_no_')) {
        return i.update({ content: '❌ Facture refusée.', embeds: [], components: [] });
      }

      const uid = i.user.id;
      let p = hydrate(getP.get(uid));
      if (!p) return i.reply({ content: 'Pas de personnage.', ephemeral: true });

      if (i.customId === 'wallet_cards') {
        if (!p.cards.length) return i.update({ content: 'Aucune carte.', embeds: [], components: [] });
        const options = p.cards.map((c, idx) => ({
          label: `${c.type === 'pro' ? '💼' : '👤'} ${c.name}`.slice(0, 100),
          description: c.type === 'pro' ? 'Carte professionnelle' : 'Carte personnelle',
          value: String(idx)
        }));
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('select_card').setPlaceholder('Choisir une carte').addOptions(options)
        );
        return i.update({ content: 'Choisis une carte :', embeds: [], components: [row] });
      }

      if (i.customId === 'wallet_iban') {
        return i.update({ content: `🏦 IBAN : \`${p.iban}\``, embeds: [], components: [] });
      }

      if (i.customId === 'wallet_tx') {
        const txs = db.prepare('SELECT * FROM transactions WHERE from_id = ? OR to_id = ? ORDER BY id DESC LIMIT 8').all(uid, uid);
        const desc = txs.length
          ? txs.map(t => {
              const dir = t.from_id === uid ? '➡️' : '⬅️';
              return `${dir} ${t.type} **${t.amount}$** — ${t.label}`;
            }).join('\n')
          : 'Aucune transaction.';
        return i.update({ embeds: [new EmbedBuilder().setTitle('📜 Historique').setDescription(desc).setColor(0x95A5A6)], components: [] });
      }

      if (i.customId === 'bank_deposit') {
        const modal = new ModalBuilder().setCustomId('modal_deposit').setTitle('Dépôt');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('amount').setLabel('Montant').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return i.showModal(modal);
      }

      if (i.customId === 'bank_withdraw') {
        const modal = new ModalBuilder().setCustomId('modal_withdraw').setTitle('Retrait');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('amount').setLabel('Montant').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return i.showModal(modal);
      }
    }

    // ---- SELECT MENU ----
    if (i.isStringSelectMenu()) {
      const uid = i.user.id;
      const p   = hydrate(getP.get(uid));
      if (!p) return i.reply({ content: 'Pas de personnage.', ephemeral: true });

      if (i.customId === 'select_card') {
        const idx  = parseInt(i.values[0], 10);
        const card = p.cards[idx];
        if (!card) return i.update({ content: 'Carte introuvable.', embeds: [], components: [] });
        const embed = new EmbedBuilder()
          .setTitle(`${card.type === 'pro' ? '💼 Carte Pro' : '👤 Carte Perso'} — ${card.name}`)
          .addFields(
            { name: 'Titulaire',    value: p.character_name,    inline: true },
            { name: 'IBAN',         value: `\`${p.iban}\``,     inline: true },
            { name: 'Solde banque', value: `**${p.bank}$**`,    inline: true }
          )
          .setColor(card.type === 'pro' ? 0xE67E22 : 0x3498DB);
        return i.update({ embeds: [embed], components: [] });
      }
    }

    // ---- MODALS ----
    if (i.isModalSubmit()) {
      const uid = i.user.id;
      const p   = hydrate(getP.get(uid));
      if (!p) return i.reply({ content: 'Pas de personnage.', ephemeral: true });

      const amount = parseInt(i.fields.getTextInputValue('amount'), 10);
      if (isNaN(amount) || amount <= 0) return i.reply({ content: 'Montant invalide.', ephemeral: true });

      if (i.customId === 'modal_deposit') {
        if (p.cash < amount) return i.reply({ content: 'Pas assez de cash.', ephemeral: true });
        p.cash -= amount; p.bank += amount; save(p);
        addTx(uid, 'BANK', amount, 'DEPOSIT', 'Dépôt');
        return i.reply({ content: `✅ ${amount}$ déposés. Banque : **${p.bank}$**`, ephemeral: true });
      }
      if (i.customId === 'modal_withdraw') {
        if (p.bank < amount) return i.reply({ content: 'Solde insuffisant.', ephemeral: true });
        p.bank -= amount; p.cash += amount; save(p);
        addTx('BANK', uid, amount, 'WITHDRAW', 'Retrait');
        return i.reply({ content: `✅ ${amount}$ retirés. Cash : **${p.cash}$**`, ephemeral: true });
      }
    }

    // ---- SLASH ----
    if (!i.isChatInputCommand()) return;
    const uid = i.user.id;

    // CREER PERSO
    if (i.commandName === 'creerperso') {
      const existing = getP.get(uid);
      if (existing?.character_name) return i.reply({ content: 'Déjà créé.', ephemeral: true });
      const name = `${i.options.getString('prenom')} ${i.options.getString('nom')}`.slice(0, 50);
      insertP.run(uid, name, genPhone(), genIban());
      const np = hydrate(getP.get(uid));
      np.cards = [{ type: 'personal', name: 'Los Santos Classic' }];
      save(np);
      return i.reply({ embeds: [new EmbedBuilder().setTitle('✅ Personnage créé')
        .setDescription(`**${name}**\n📞 ${np.phone}\n🏦 \`${np.iban}\`\n💳 Carte perso délivrée`)
        .setColor(0x00FF00)] });
    }

    let p = hydrate(getP.get(uid));
    if (!p?.character_name) return i.reply({ content: 'Fais `/creerperso` d\'abord.', ephemeral: true });

    // PROFIL
    if (i.commandName === 'profil') {
      const t  = i.options.getUser('joueur') || i.user;
      const tp = hydrate(getP.get(t.id));
      if (!tp?.character_name) return i.reply({ content: 'Pas de personnage.', ephemeral: true });
      return i.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${tp.character_name}`)
        .addFields(
          { name: 'Niveau',     value: `${tp.level}`,                                                         inline: true },
          { name: 'Job',        value: `${tp.job} (${tp.job_grade})`,                                         inline: true },
          { name: 'Téléphone',  value: tp.phone,                                                               inline: true },
          { name: 'Cash',       value: `${tp.cash}$`,                                                          inline: true },
          { name: 'Banque',     value: `${tp.bank}$`,                                                          inline: true },
          { name: 'Dirty',      value: `${tp.dirty}$`,                                                         inline: true },
          { name: 'Inventaire', value: tp.inventory.length ? tp.inventory.map(x => `${x.name} x${x.qty}`).join(', ') : 'Vide' }
        ).setColor(0x3498DB)] });
    }

    // WALLET
    if (i.commandName === 'wallet') {
      const embed = new EmbedBuilder().setTitle(`💳 Wallet — ${p.character_name}`)
        .setDescription(`Cash : **${p.cash}$**\nBanque : **${p.bank}$**\nDirty : **${p.dirty}$**`)
        .setColor(0x2ECC71);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('wallet_cards').setLabel('Mes Cartes').setStyle(ButtonStyle.Primary).setEmoji('💳'),
        new ButtonBuilder().setCustomId('wallet_tx').setLabel('Historique').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('wallet_iban').setLabel('Mon IBAN').setStyle(ButtonStyle.Secondary)
      );
      return i.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // BANQUE
    if (i.commandName === 'banque') {
      const embed = new EmbedBuilder().setTitle('🏦 Los Santos National Bank')
        .setDescription(`Bonjour **${p.character_name}**\nSolde : **${p.bank}$**\nCash : **${p.cash}$**`)
        .setColor(0x1ABC9C);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bank_deposit').setLabel('Déposer').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('bank_withdraw').setLabel('Retirer').setStyle(ButtonStyle.Danger)
      );
      return i.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // DONNER
    if (i.commandName === 'donner') {
      const targetU = i.options.getUser('joueur');
      const amount  = i.options.getInteger('montant');
      if (targetU.id === uid)  return i.reply({ content: 'Tu ne peux pas te donner à toi-même.', ephemeral: true });
      if (targetU.bot)         return i.reply({ content: 'Cible invalide.', ephemeral: true });
      if (p.cash < amount)     return i.reply({ content: 'Pas assez de cash.', ephemeral: true });
      const t = hydrate(getP.get(targetU.id));
      if (!t?.character_name)  return i.reply({ content: 'Joueur invalide.', ephemeral: true });
      p.cash -= amount; t.cash += amount; save(p); save(t);
      addTx(uid, targetU.id, amount, 'CASH', 'Don');
      return i.reply({ content: `✅ ${amount}$ donnés à **${t.character_name}**.`, ephemeral: true });
    }

    // JOB
    if (i.commandName === 'job') {
      const act = i.options.getString('action');
      if (act === 'liste') {
        return i.reply({ embeds: [new EmbedBuilder().setTitle('💼 Jobs')
          .setDescription(JOBS.map(j => `• **${j.name}** — ${j.pay}$`).join('\n')).setColor(0x9B59B6)] });
      }
      if (act === 'quit') {
        p.job = 'Unemployed'; p.job_grade = 0; save(p);
        return i.reply({ content: 'Démission enregistrée.', ephemeral: true });
      }
      if (act === 'postuler') {
        const m = (i.options.getString('metier') || '').toLowerCase();
        if (!m) return i.reply({ content: 'Précise un métier.', ephemeral: true });
        const f = JOB_MAP[m];
        if (!f) return i.reply({ content: 'Métier inconnu.', ephemeral: true });
        p.job = f.name; p.job_grade = 0; save(p);
        return i.reply({ content: `✅ Embauché comme **${f.name}**.`, ephemeral: true });
      }
    }

    // INVENTAIRE
    if (i.commandName === 'inventaire') {
      const desc = p.inventory.length ? p.inventory.map(x => `• ${x.name} x${x.qty}`).join('\n') : 'Vide';
      return i.reply({ embeds: [new EmbedBuilder().setTitle('🎒 Inventaire').setDescription(desc).setColor(0x1ABC9C)], ephemeral: true });
    }

    // UTILISER
    if (i.commandName === 'utiliser') {
      const item = i.options.getString('item').toLowerCase();
      const idx  = p.inventory.findIndex(x => x.name.toLowerCase() === item);
      if (idx === -1) return i.reply({ content: 'Item introuvable.', ephemeral: true });
      const it = p.inventory[idx];
      let effect = '';
      const n = it.name.toLowerCase();
      if (n.includes('medkit') || n.includes('bandage'))            effect = '❤️ Tu te soignes.';
      else if (n.includes('food') || n.includes('burger'))          effect = '🍔 Tu manges, tu te sens mieux.';
      else if (n.includes('water') || n.includes('drink'))          effect = '💧 Tu bois de l\'eau.';
      else                                                            effect = `Tu as utilisé **${it.name}**.`;
      it.qty--;
      if (it.qty <= 0) p.inventory.splice(idx, 1);
      save(p);
      return i.reply({ content: effect, ephemeral: true });
    }

    // VEHICULES
    if (i.commandName === 'vehicules') {
      const desc = p.vehicles.length ? p.vehicles.map(v => `• ${v.name} (${v.plate})`).join('\n') : 'Aucun véhicule';
      return i.reply({ embeds: [new EmbedBuilder().setTitle('🚗 Véhicules').setDescription(desc).setColor(0xE67E22)] });
    }

    // PROPRIETES
    if (i.commandName === 'proprietes') {
      const desc = p.properties.length ? p.properties.map(pr => `• ${pr.name}`).join('\n') : 'Aucune propriété';
      return i.reply({ embeds: [new EmbedBuilder().setTitle('🏠 Propriétés').setDescription(desc).setColor(0x9B59B6)] });
    }

    // TELEPHONE
    if (i.commandName === 'telephone') {
      const act = i.options.getString('action');
      if (act === 'numero') return i.reply({ content: `📞 Ton numéro : **${p.phone}**`, ephemeral: true });
      const target = i.options.getUser('joueur');
      if (!target) return i.reply({ content: 'Mentionne un joueur.', ephemeral: true });
      const tp = getP.get(target.id);
      if (!tp?.character_name) return i.reply({ content: 'Pas de personnage.', ephemeral: true });
      if (act === 'appeler') return i.reply({ content: `📞 Tu appelles **${tp.character_name}** (${tp.phone})...`, ephemeral: true });
      if (act === 'sms') {
        const msg = (i.options.getString('message') || '...').slice(0, 200);
        return i.reply({ content: `📱 SMS envoyé à **${tp.character_name}** : ${msg}`, ephemeral: true });
      }
    }

    // CRIME
    if (i.commandName === 'crime') {
      const act = i.options.getString('action');
      if (act === 'dirty') return i.reply({ content: `💵 Dirty money : **${p.dirty}$**`, ephemeral: true });
      if (act === 'atm') {
        const cd = checkCd(uid, 'atm', 60_000);
        if (cd) return i.reply({ content: `⏳ Attends ${cd}s avant un nouveau braquage.`, ephemeral: true });
        if (Math.random() < 0.25) {
          const fine = Math.min(500, p.cash);
          p.cash -= fine; save(p);
          return i.reply({ content: `🚨 Braquage raté ! Amende de **${fine}$**.`, ephemeral: true });
        }
        const gain = Math.floor(Math.random() * 800) + 200;
        p.dirty += gain; save(p);
        addTx('ATM', uid, gain, 'ROBBERY', 'Braquage ATM');
        return i.reply({ content: `🔫 Braquage ATM réussi. +**${gain}$** dirty.`, ephemeral: true });
      }
      if (act === 'blanchiment') {
        const cd = checkCd(uid, 'blanchiment', 5 * 60_000);
        if (cd) return i.reply({ content: `⏳ Attends ${cd}s avant un nouveau blanchiment.`, ephemeral: true });
        if (p.dirty < 500) return i.reply({ content: 'Minimum 500$ dirty.', ephemeral: true });
        const rate  = 0.6 + Math.random() * 0.2;
        const clean = Math.floor(p.dirty * rate);
        p.cash += clean; p.dirty = 0; save(p);
        addTx('LAUNDRY', uid, clean, 'LAUNDER', 'Blanchiment');
        return i.reply({ content: `🧼 Blanchiment effectué. Tu récupères **${clean}$** clean (taux ${Math.round(rate * 100)}%).`, ephemeral: true });
      }
    }

    // PAYDAY
    if (i.commandName === 'payday') {
      const cd = checkCd(uid, 'payday', 60 * 60_000);
      if (cd) return i.reply({ content: `⏳ Paye déjà récupérée. Prochaine dans ${Math.ceil(cd / 60)} min.`, ephemeral: true });
      const pay = JOB_MAP[p.job.toLowerCase()]?.pay ?? 50;
      p.bank += pay; p.xp += 15;
      const lv = levelUp(p);
      save(p);
      addTx('PAYDAY', uid, pay, 'PAYDAY', `Paye ${p.job}`);
      return i.reply({ content: `💰 Paye reçue : **+${pay}$** (banque).${lv ? ` 🎉 Niveau ${p.level} !` : ''}`, ephemeral: true });
    }

    // ID CARD
    if (i.commandName === 'idcard') {
      return i.reply({ embeds: [new EmbedBuilder().setTitle('🪪 Carte d\'identité')
        .addFields(
          { name: 'Nom',       value: p.character_name, inline: true },
          { name: 'Téléphone', value: p.phone,           inline: true },
          { name: 'Job',       value: p.job,             inline: true }
        ).setColor(0x34495E)], ephemeral: true });
    }

    // FACTURE
    if (i.commandName === 'facture') {
      const targetU = i.options.getUser('joueur');
      const amount  = i.options.getInteger('montant');
      const motif   = i.options.getString('motif').slice(0, 100);
      if (targetU.id === uid) return i.reply({ content: 'Impossible de te facturer toi-même.', ephemeral: true });
      if (targetU.bot)        return i.reply({ content: 'Cible invalide.', ephemeral: true });
      const t = getP.get(targetU.id);
      if (!t?.character_name) return i.reply({ content: 'Joueur invalide.', ephemeral: true });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`inv_ok_${uid}_${amount}`).setLabel('Payer').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`inv_no_${uid}_${amount}`).setLabel('Refuser').setStyle(ButtonStyle.Danger)
      );
      try {
        const dm = await targetU.createDM();
        await dm.send({
          embeds: [new EmbedBuilder().setTitle('🧾 Nouvelle facture')
            .setDescription(`De **${p.character_name}**\nMontant : **${amount}$**\nMotif : ${motif}`)
            .setColor(0xE67E22)],
          components: [row]
        });
      } catch {
        return i.reply({ content: 'Impossible d\'envoyer un DM au joueur.', ephemeral: true });
      }
      return i.reply({ content: `🧾 Facture envoyée à **${t.character_name}** en DM.`, ephemeral: true });
    }

    // TICKET
    if (i.commandName === 'ticket') {
      const existing = getOpenTicket.get(uid, 'open');
      if (existing) {
        const ch = i.guild.channels.cache.get(existing.channel_id);
        return i.reply({ content: `Tu as déjà un ticket ouvert${ch ? ` : ${ch}` : ''}.`, ephemeral: true });
      }
      let channel;
      try {
        channel = await i.guild.channels.create({
          name: `ticket-${i.user.username}`.slice(0, 100),
          type: 0,
          permissionOverwrites: [
            { id: i.guild.id,        deny:  [PermissionFlagsBits.ViewChannel] },
            { id: uid,               allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: client.user.id,    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
          ]
        });
      } catch (e) {
        console.error(e);
        return i.reply({ content: '❌ Impossible de créer le ticket (permissions ?).', ephemeral: true });
      }
      insertTicket.run(uid, channel.id);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer').setStyle(ButtonStyle.Danger)
      );
      await channel.send({
        content: `<@${uid}>`,
        embeds: [new EmbedBuilder().setTitle('🎫 Ticket').setDescription('Explique ton problème.').setColor(0xE74C3C)],
        components: [row]
      });
      return i.reply({ content: `Ticket créé : ${channel}`, ephemeral: true });
    }

    // ADMIN
    if (i.commandName === 'admin') {
      const sub     = i.options.getSubcommand();
      const targetU = i.options.getUser('j');
      const t       = hydrate(getP.get(targetU.id));
      if (!t) return i.reply({ content: 'Joueur introuvable.', ephemeral: true });

      if (sub === 'setmoney') {
        t.cash = i.options.getInteger('cash');
        t.bank = i.options.getInteger('bank');
        save(t);
        logAction(uid, 'setmoney', targetU.id, `cash=${t.cash} bank=${t.bank}`);
        return i.reply({ content: '✅ Argent mis à jour.', ephemeral: true });
      }

      if (sub === 'setjob') {
        t.job       = i.options.getString('job');
        t.job_grade = i.options.getInteger('grade');
        save(t);
        logAction(uid, 'setjob', targetU.id, `job=${t.job} grade=${t.job_grade}`);
        return i.reply({ content: `✅ Job mis à jour : **${t.job}** grade ${t.job_grade}.`, ephemeral: true });
      }

      if (sub === 'giveitem') {
        const itemName = i.options.getString('item');
        const qty      = i.options.getInteger('qty');
        const existing = t.inventory.find(x => x.name.toLowerCase() === itemName.toLowerCase());
        if (existing) {
          existing.qty += qty;
        } else {
          t.inventory.push({ name: itemName, qty });
        }
        save(t);
        logAction(uid, 'giveitem', targetU.id, `item=${itemName} qty=${qty}`);
        return i.reply({ content: `✅ **${qty}x ${itemName}** ajouté à l'inventaire de **${t.character_name}**.`, ephemeral: true });
      }

      if (sub === 'addcard') {
        const type     = i.options.getString('type');
        const cardName = i.options.getString('nom');
        t.cards.push({ type, name: cardName });
        save(t);
        logAction(uid, 'addcard', targetU.id, `type=${type} name=${cardName}`);
        return i.reply({ content: `✅ Carte **${cardName}** (${type}) ajoutée à **${t.character_name}**.`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);
    try {
      if (i.replied || i.deferred) await i.followUp({ content: '❌ Erreur interne.', ephemeral: true });
      else await i.reply({ content: '❌ Erreur interne.', ephemeral: true });
    } catch {}
  }
});

client.login(TOKEN);
