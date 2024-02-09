// ※おなじサーバーが重複起動していない前提で正常に動作

var fs = require('fs');
var digitalocean = require('digitalocean');

var settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
var client = digitalocean.client(settings.digital_ocean_token);

module.exports = {

  show : async (message)=>{
    message.reply('サーバーのリストを取得中…');
    var already = [];
    var text = '\n';
    var droplets = await client.droplets.list();
    droplets.forEach(d=>{
      if(d.networks.v4.length > 0){
        text += '・' + d.name + ' :' + d.networks.v4[0].ip_address + ' [稼働中]\n';
      }else{
        text += '・' + d.name + ' [起動中]\n';
      }
      already.push(d.name);
    });
    var snapshots = await client.snapshots.list();
    snapshots.forEach(s=>{
      var snapname = s.name.split('-')[0];
      if(!already.includes(snapname)){
        already.push(snapname);
        text += '・' + snapname + ' [停止中（スナップショット）]\n'
      }
    });
    message.reply(text);
  },

  start : async (name, message)=>{
    message.reply('しばらくお待ちください…');
    // すでにサーバーが立っていないか確認
    var droplets = await client.droplets.list();
    if(droplets.length>0){
      droplets = droplets.filter(d=>d.name.includes(name));
      if(droplets.length>0){
        if(droplets[0].networks.v4.length > 0){
          message.reply('サーバーは稼働中です\nIP : '+droplets[0].networks.v4[0].ip_address);
        }else{
          message.reply('サーバーは起動中です');
        }
        return false;
      }
    }

    // スナップショットからドロップレットを作成
    var snapshots = await client.snapshots.list();
    snapshots = snapshots.filter(s=>s.name.includes(name));
    if(snapshots.length == 0){
      message.reply('スナップショットがありません');
      return false;
    }
    var latestsnapshot = snapshots[snapshots.length-1];
    await client.droplets.create({"name": name,"region":latestsnapshot.regions[0],"size":"s-2vcpu-4gb","image": latestsnapshot.id});
    message.reply('サーバー起動中…');

    // サーバーが立つまで待ってIPを取得
    var ip;
    while(true){
      await wait(2*1000);
      var droplets = await client.droplets.list();
      droplets = droplets.filter(d=>d.name.includes(name));
      if(droplets.length == 0){
        continue;
      }
      if(droplets[0].networks.v4.length > 0){
        ip = droplets[0].networks.v4[0].ip_address;
        break;
      }
    }
    message.reply('サーバー起動完了!（接続できない場合は数分お待ちください）\nIP :'+ip);

    return true;
  },
  
  end : async (name, message)=>{
    message.reply('しばらくお待ちください…');
    
    var droplets = await client.droplets.list();
    droplets = droplets.filter(d=>d.name == name);

    // サーバーが存在するか確認
    if(droplets.length == 0){
      message.reply('現在サーバーは稼働していません');
      return false;
    }

    // 停止コマンド実行
    await client.droplets.powerOff(droplets[0].id);
    await wait(1000);
    await client.droplets.snapshot(droplets[0].id);
    await wait(1000);
    await client.droplets.delete(droplets[0].id);
    message.reply("サーバー停止中（この処理には10分ほどかかります）…");

    // サーバーの終了を通知
    while(true){
      await wait(5*1000);
      var droplets = await client.droplets.list();
      droplets = droplets.filter(d=>d.name.includes(name));
      if(droplets.length == 0){
        message.reply('サーバーは正常に終了しました!');
        break;
      }
    }

    return true;
  },

}

var wait = (delay)=>{
  return new Promise((resolve, reject)=>{
    setTimeout(resolve, delay);
  });
}
