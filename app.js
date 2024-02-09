import { REST, Routes, Client, GatewayIntentBits, Message } from 'discord.js';
import { DropletController } from './droplet-controller.js';

import config from './config.json' assert { type: 'json' };

// コマンドの定義
const commands = [
  {
    name: 'list',
    description: 'サーバーのリストを表示',
  },
  {
    name: 'start',
    description: 'サーバーを起動',
    options: [
      {
        name: 'server_name',
        description: '起動するサーバーの名前',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'end',
    description: 'サーバーを停止',
    options: [
      {
        name: 'server_name',
        description: '停止するサーバーの名前',
        type: 3,
        required: true
      }
    ]
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

  // ユーザーにメッセージを送信する関数を定義
  // 1回目は reply() , 2回目以降は followUp() と使い分ける必要がある
  const sendMessage = async (message) => {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(message);
    } else {
      await interaction.followUp(message);
    }
  }

  // コマンドによってドロップレットを操作する
  const dropletController = new DropletController(config, sendMessage);
  switch (interaction.commandName){
    case 'list':
      await dropletController.list();
      break;
    case 'start':
      await dropletController.start(interaction.options.getString('server_name'));
      break;
    case 'end':
      await dropletController.end(interaction.options.getString('server_name'));
      break;
  }
});

// クライアントのログイン
client.login(config.discord_token);
