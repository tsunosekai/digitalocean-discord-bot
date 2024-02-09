var Discord = require("discord.js");
var client = new Discord.Client();
var fs = require('fs');

var settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
var server = require('./server.js');

client.on('message', message => {
  cmd = message.content.split(/\s+/);
  switch (cmd[0]){
    case 'help':
      message.reply('\nshow : サーバーの一覧を表示\nstart [server name] : 最新のスナップショットからサーバーを起動\nend [server name] : 稼働中のサーバーを停止');
      break;
    case 'show':
      server.show(message);
      break;
    case 'start':
      server.start(cmd[1], message);
      break;
    case 'end':
      server.end(cmd[1], message);
      break;
  }
});

client.login(settings.discord_token);