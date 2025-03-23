import digitalocean from 'digitalocean';

// スリープ関数のユーティリティ
const sleep = (delay)=>{
  return new Promise(resolve => setTimeout(resolve, 3000));
}

// 名前からタイムスタンプを抽出する関数
const extractTimestamp = (name) => {
  // "name-timestamp" 形式からタイムスタンプを抽出
  const dashIndex = name.lastIndexOf('-');
  if (dashIndex === -1) return null;
  
  const timestampStr = name.substring(dashIndex + 1);
  const timestamp = parseInt(timestampStr, 10);
  return isNaN(timestamp) ? null : timestamp;
};

// ドロップレットを操作するクラス
export class DropletController{
  constructor(config, logger){
    this.client = digitalocean.client(config.digital_ocean_token);
    this.dropletSize = config.droplet_size;
    this.logger = logger;
    this.list = this.list.bind(this);
    this.start = this.start.bind(this);
  }

  // サーバーのリスト取得
  async list(){
    this.logger('サーバーのリストを取得中…');
    let already = [];
    let text = '\n';
    let droplets = await this.client.droplets.list({all: true});
    droplets.forEach(d=>{
      if(d.networks.v4.length > 0){
        text += d.name + ' :' + d.networks.v4[0].ip_address + ' [稼働中]\n';
      }else{
        text += d.name + ' [起動中]\n';
      }
      already.push(d.name);
    });
    // スナップショットを取得
    let snapshots = await this.client.snapshots.list({
      all: true,
      includeAll: true,
      page: 1,
      per_page: 200,
      resource_type: 'droplet'
    });
    
    // サーバー名ごとにグループ化
    const serverGroups = new Map();
    
    snapshots.forEach(s => {
      // "name-timestamp" 形式からサーバー名を抽出
      let serverName = s.name;
      const dashIndex = s.name.indexOf('-');
      if (dashIndex !== -1) {
        serverName = s.name.substring(0, dashIndex);
      }
      
      // サーバー名ごとにスナップショットをグループ化
      if (!serverGroups.has(serverName)) {
        serverGroups.set(serverName, []);
      }
      serverGroups.get(serverName).push(s);
    });
    
    // 各サーバーの最新スナップショットを表示
    for (const [serverName, serverSnapshots] of serverGroups.entries()) {
      if (already.includes(serverName)) continue;
      
      // スナップショットを作成日時の降順でソート
      // 名前に含まれるタイムスタンプも考慮する
      serverSnapshots.sort((a, b) => {
        // まず作成日時で比較
        const dateComparison = new Date(b.created_at) - new Date(a.created_at);
        if (dateComparison !== 0) return dateComparison;
        
        // 作成日時が同じ場合、名前に含まれるタイムスタンプで比較
        const aTimestamp = extractTimestamp(a.name);
        const bTimestamp = extractTimestamp(b.name);
        
        if (aTimestamp && bTimestamp) {
          return bTimestamp - aTimestamp;
        }
        
        // タイムスタンプが取得できない場合は名前で比較
        return b.name.localeCompare(a.name);
      });
      
      const latestSnapshot = serverSnapshots[0];
      already.push(serverName);
      text += `${serverName} [停止中（スナップショット）] (最新: ${latestSnapshot.name})\n`;
    }
    this.logger(text);
  }

  // サーバー起動
  async start(name){
    this.logger('しばらくお待ちください…');
    // すでにサーバーが立っていないか確認
    let droplets = await this.client.droplets.list({all: true});
    if(droplets.length>0){
      // 名前が完全一致するドロップレットを選択
      droplets = droplets.filter(d => d.name === name);
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
    let snapshots = await this.client.snapshots.list({
      all: true,
      includeAll: true,
      page: 1,
      per_page: 200,
      resource_type: 'droplet'
    });
    
    // スナップショットのフィルタリング方法を改善
    // 名前が完全一致するか、または "name-" で始まるスナップショットのみを選択
    snapshots = snapshots.filter(s => 
      s.name === name || 
      s.name.startsWith(`${name}-`)
    );
    
    if(snapshots.length == 0){
      this.logger('スナップショットがありません');
      return false;
    }
    
    // スナップショットを作成日時の降順でソート
    // 名前に含まれるタイムスタンプも考慮する
    snapshots.sort((a, b) => {
      // まず作成日時で比較
      const dateComparison = new Date(b.created_at) - new Date(a.created_at);
      if (dateComparison !== 0) return dateComparison;
      
      // 作成日時が同じ場合、名前に含まれるタイムスタンプで比較
      const aTimestamp = extractTimestamp(a.name);
      const bTimestamp = extractTimestamp(b.name);
      
      if (aTimestamp && bTimestamp) {
        return bTimestamp - aTimestamp;
      }
      
      // タイムスタンプが取得できない場合は名前で比較
      return b.name.localeCompare(a.name);
    });
    
    let latestsnapshot = snapshots[0]; // 最新のスナップショット
    try{
      await this.client.droplets.create({
        "name": name,
        "region":latestsnapshot.regions[0],
        "size": this.dropletSize,
        "image": latestsnapshot.id
      });
    }catch(error){
      this.logger("Error: "+error.message);
      return;
    }
    this.logger('サーバー起動中…');
  
    // サーバーが立つまで待ってIPを取得
    let ip;
    while(true){
      await sleep(2*1000);
      let droplets = await this.client.droplets.list({all: true});
      // 名前が完全一致するドロップレットを選択
      droplets = droplets.filter(d => d.name === name);
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
    
    let droplets = await this.client.droplets.list({all: true});
    
    // 名前が完全一致するドロップレットを選択
    droplets = droplets.filter(d => d.name === name);
    
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
      let droplets = await this.client.droplets.list({all: true});
      // 名前が完全一致するドロップレットを選択
      droplets = droplets.filter(d => d.name === name);
      if(droplets.length == 0){
        this.logger('サーバーは正常に終了しました!');
        break;
      }
    }
  
    return true;
  }
}
