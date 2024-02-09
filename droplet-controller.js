// const digitalocean = require('digitalocean');
import digitalocean from 'digitalocean';

const sleep = (delay)=>{
  return new Promise(resolve => setTimeout(resolve, 3000));
}

export class DropletController{
  constructor(token, dropletSize, logger = console.log){
    this.client = digitalocean.client(token);
    this.dropletSize = dropletSize;
    this.logger = logger;
  }

  // サーバーのリスト取得
  async list(){
    this.logger('サーバーのリストを取得中…');
    let already = [];
    let text = '\n';
    let droplets = await this.client.droplets.list();
    droplets.forEach(d=>{
      if(d.networks.v4.length > 0){
        text += d.name + ' :' + d.networks.v4[0].ip_address + ' [稼働中]\n';
      }else{
        text += d.name + ' [起動中]\n';
      }
      already.push(d.name);
    });
    let snapshots = await this.client.snapshots.list();
    snapshots.forEach(s=>{
      let snapname = s.name.split('-')[0];
      if(!already.includes(snapname)){
        already.push(snapname);
        text += snapname + ' [停止中（スナップショット）]\n'
      }
    });
    this.logger(text);
  }

  // サーバー起動
  async start(name){
    this.logger('しばらくお待ちください…');
    // すでにサーバーが立っていないか確認
    let droplets = await this.client.droplets.list();
    if(droplets.length>0){
      droplets = droplets.filter(d=>d.name.includes(name));
      if(droplets.length>0){
        if(droplets[0].networks.v4.length > 0){
          this.logger('サーバーは稼働中です\nIP : '+droplets[0].networks.v4[0].ip_address);
        }else{
          this.logger('サーバーは起動中です');
        }
        return false;
      }
    }
  
    // スナップショットからドロップレットを作成
    let snapshots = await this.client.snapshots.list();
    snapshots = snapshots.filter(s=>s.name.includes(name));
    if(snapshots.length == 0){
      this.logger('スナップショットがありません');
      return false;
    }
    let latestsnapshot = snapshots[snapshots.length-1];
    try{
      await this.client.droplets.create({
        "name": name,
        "region":latestsnapshot.regions[0],
        "size": this.dropletSize,
        "image": latestsnapshot.id
      });
    }catch(error){
      this.logger(error.message);
      return;
    }
    this.logger('サーバー起動中…');
  
    // サーバーが立つまで待ってIPを取得
    let ip;
    while(true){
      await sleep(2*1000);
      let droplets = await this.client.droplets.list();
      droplets = droplets.filter(d=>d.name.includes(name));
      if(droplets.length == 0){
        continue;
      }
      if(droplets[0].networks.v4.length > 0){
        ip = droplets[0].networks.v4[0].ip_address;
        break;
      }
    }
    this.logger('サーバー起動完了!（接続できない場合は数分お待ちください）\nIP :'+ip);
  
    return true;
  }
  
  // サーバー停止
  async end(name){
    this.logger('しばらくお待ちください…');
    
    let droplets = await this.client.droplets.list();
    droplets = droplets.filter(d=>d.name == name);
  
    // サーバーが存在するか確認
    if(droplets.length == 0){
      this.logger('現在サーバーは稼働していません');
      return false;
    }
  
    // 停止コマンド実行
    await this.client.droplets.powerOff(droplets[0].id);
    await sleep(1000);
    await this.client.droplets.snapshot(droplets[0].id);
    await sleep(1000);
    await this.client.droplets.delete(droplets[0].id);
    this.logger("サーバー停止中…");
  
    // サーバーの終了を通知
    while(true){
      await sleep(5*1000);
      let droplets = await this.client.droplets.list();
      droplets = droplets.filter(d=>d.name.includes(name));
      if(droplets.length == 0){
        this.logger('サーバーは正常に終了しました!');
        break;
      }
    }
  
    return true;
  }
}