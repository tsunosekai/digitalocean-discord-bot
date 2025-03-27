import { REST, Routes, Client, GatewayIntentBits, SlashCommandBuilder } from 'discord.js';
import { DropletController } from './droplet-controller.js';

import config from './config.json' assert { type: 'json' };

// サーバー名のリストを取得する関数
async function getServerNames() {
  const tempLogger = () => {}; // 一時的なロガー（出力しない）
  const dropletController = new DropletController(config, tempLogger);
  return await dropletController.getServerNames();
}

// コマンドを登録する関数
async function registerCommands() {
  // サーバー名のリストを取得
  const serverNames = await getServerNames();
  console.log('サーバー名のリスト:', serverNames);
  
  // サーバー名の選択肢を作成（最大25個まで）
  const serverChoices = serverNames.slice(0, 25).map(name => ({
    name: name,
    value: name
  }));
  
  // コマンドの定義をSlashCommandBuilderで書き直す
  const commands = [
    new SlashCommandBuilder()
      .setName('list')
      .setDescription('サーバーのリストを表示'),

    new SlashCommandBuilder()
      .setName('start')
      .setDescription('サーバーを起動')
      .addStringOption(option => 
        option
          .setName('server_name')
          .setDescription('起動するサーバーの名前')
          .setRequired(true)
          .addChoices(...serverChoices)
      ),

    new SlashCommandBuilder()
      .setName('end')
      .setDescription('サーバーを停止')
      .addStringOption(option => 
        option
          .setName('server_name')
          .setDescription('停止するサーバーの名前')
          .setRequired(true)
          .addChoices(...serverChoices)
      ),

    new SlashCommandBuilder()
      .setName('snapshot-list')
      .setDescription('サーバーのスナップショット一覧を表示')
      .addStringOption(option => 
        option
          .setName('server_name')
          .setDescription('対象のサーバー名')
          .setRequired(true)
          .addChoices(...serverChoices)
      ),
      
    new SlashCommandBuilder()
      .setName('cleanup')
      .setDescription('古いスナップショットを削除')
      .addStringOption(option => 
        option
          .setName('server_name')
          .setDescription('対象のサーバー名')
          .setRequired(true)
          .addChoices(...serverChoices)
      )
      .addIntegerOption(option =>
        option.setName('keep_count')
          .setDescription('残す最新スナップショットの数（デフォルト: 3）')
          .setRequired(false)
      ),
  ].map(command => command.toJSON());  // ここで必ず.toJSON()を実行する

  const rest = new REST({ version: config.discord_api_version }).setToken(config.discord_token);

  // 既存のコマンドを削除してから新しいコマンドを登録
  try {
    console.log('Started refreshing application (/) commands.');
    
    // グローバルコマンドを削除
    console.log('Deleting global commands...');
    try {
      // グローバルコマンドを取得
      const existingGlobalCommands = await rest.get(
        Routes.applicationCommands(config.discord_client_id)
      );
      
      // グローバルコマンドをすべて削除
      console.log(`Found ${existingGlobalCommands.length} global commands to delete`);
      for (const command of existingGlobalCommands) {
        await rest.delete(
          Routes.applicationCommand(config.discord_client_id, command.id)
        );
        console.log(`Deleted global command ${command.name}`);
      }
    } catch (globalError) {
      console.error('Error deleting global commands:', globalError);
    }
    
    // ギルドコマンドを削除
    console.log('Deleting guild commands...');
    // ギルドコマンドを取得
    const existingGuildCommands = await rest.get(
      Routes.applicationGuildCommands(config.discord_client_id, config.guild_id)
    );
    
    // ギルドコマンドをすべて削除
    console.log(`Found ${existingGuildCommands.length} guild commands to delete`);
    for (const command of existingGuildCommands) {
      await rest.delete(
        Routes.applicationGuildCommand(config.discord_client_id, config.guild_id, command.id)
      );
      console.log(`Deleted guild command ${command.name}`);
    }
    
    // 新しいコマンドをギルドコマンドとして登録
    console.log('Registering new guild commands...');
    await rest.put(
      Routes.applicationGuildCommands(config.discord_client_id, config.guild_id),
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}

// コマンドを登録
registerCommands();

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
    case 'snapshot-list':
      await dropletController.snapshotList(interaction.options.getString('server_name'));
      break;
    case 'cleanup':
      const serverName = interaction.options.getString('server_name');
      const keepCount = interaction.options.getInteger('keep_count') || 3; // デフォルト値は3
      await dropletController.cleanup(serverName, keepCount);
      break;
  }
});

// クライアントのログイン
client.login(config.discord_token);
