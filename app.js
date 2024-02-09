import { REST, Routes, Client, GatewayIntentBits } from 'discord.js';
import config from './config.json' assert { type: 'json' };

// コマンドの定義
const commands = [
  {
    name: 'server_list',
    description: 'サーバーのリストを表示',
  },
  {
    name: 'start_server',
    description: 'サーバーを起動',
  },
  {
    name: 'end_server',
    description: 'サーバーを停止',
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

  switch (interaction.commandName){
    case 'server_list':
      await interaction.reply("list!");
      // server.show(message);
      break;
    case 'start_server':
      await interaction.reply("start!");
      // server.start(cmd[1], message);
      break;
    case 'end_server':
      await interaction.reply("end!");
      // server.end(cmd[1], message);
      break;
  }
});

// クライアントのログイン
client.login(config.discord_token);