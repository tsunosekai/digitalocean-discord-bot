import { REST, Routes, Client, GatewayIntentBits } from 'discord.js';
import config from './config.json' assert { type: 'json' };

// コマンドの定義
const commands = [
  {
    name: 'ping',
    description: 'Replies with Pong!',
  },
];

const rest = new REST({ version: config.discord_api_version }).setToken(config.discord_token);

// コマンドの更新
try {
  console.log('Started refreshing application (/) commands.');
  await rest.put(Routes.applicationCommands(config.discord_client_id), { body: commands });
  console.log('Successfully reloaded application (/) commands.');
} catch (error) {
  console.error(error);
}

// クライアントの作成
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// クライアントの動作設定
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// 各コマンドに対してのインタラクションを定義
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong!');
  }
});

// クライアントのログイン
client.login(config.discord_token);





// var Discord = require("discord.js");

// var client = new Discord.Client();

// var server = require('./server.js');

// client.on('message', message => {
//   cmd = message.content.split(/\s+/);
//   switch (cmd[0]){
//     case 'help':
//       message.reply('\nshow : サーバーの一覧を表示\nstart [server name] : 最新のスナップショットからサーバーを起動\nend [server name] : 稼働中のサーバーを停止');
//       break;
//     case 'show':
//       server.show(message);
//       break;
//     case 'start':
//       server.start(cmd[1], message);
//       break;
//     case 'end':
//       server.end(cmd[1], message);
//       break;
//   }
// });

// client.login(discord_token);