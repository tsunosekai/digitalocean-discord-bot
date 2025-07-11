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
    this.end = this.end.bind(this);
    this.cleanup = this.cleanup.bind(this);
    this.snapshotList = this.snapshotList.bind(this);
    this.getServerNames = this.getServerNames.bind(this);
  }
  
  // サーバー名のリストを取得
  async getServerNames() {
    let serverNames = new Set();
    
    // 稼働中・起動中のサーバーを取得
    let droplets = await this.client.droplets.list({all: true});
    droplets.forEach(d => {
      serverNames.add(d.name);
    });
    
    // スナップショットを取得
    let snapshots = await this.client.snapshots.list({
      all: true,
      includeAll: true,
      page: 1,
      per_page: 200,
      resource_type: 'droplet'
    });
    
    // スナップショットからサーバー名を抽出
    snapshots.forEach(s => {
      let serverName = s.name;
      const dashIndex = s.name.indexOf('-');
      if (dashIndex !== -1) {
        serverName = s.name.substring(0, dashIndex);
      }
      serverNames.add(serverName);
    });
    
    return Array.from(serverNames);
  }

  // サーバーのリスト取得
  async list(){
    this.logger('サーバーのリストを取得中…');
    let already = [];
    let servers = [];
    
    // 稼働中・起動中のサーバーを取得
    let droplets = await this.client.droplets.list({all: true});
    droplets.forEach(d => {
      let status = '起動中';
      let ip = '';
      let snapshotInfo = '';
      
      if(d.networks.v4.length > 0){
        status = '稼働中';
        ip = d.networks.v4[0].ip_address;
      }
      
      servers.push({
        name: d.name,
        status: status,
        ip: ip,
        snapshotInfo: snapshotInfo,
        created_at: new Date(d.created_at)
      });
      
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
      
      servers.push({
        name: serverName,
        status: '停止中',
        ip: '',
        snapshotInfo: latestSnapshot.name,
        created_at: new Date(latestSnapshot.created_at)
      });
    }
    
    // サーバーを作成日時の降順でソート
    servers.sort((a, b) => b.created_at - a.created_at);
    
    // リスト形式で表示（一つのメッセージにまとめる）
    let output = '【サーバーリスト】\n';
    
    servers.forEach(server => {
      const date = server.created_at;
      const formattedDate = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      output += '\n';
      output += `■ ${server.name}\n`;
      output += `  状態: ${server.status}\n`;
      
      if (server.ip) {
        output += `  IPアドレス: ${server.ip}\n`;
      }
      
      if (server.snapshotInfo) {
        output += `  スナップショット: ${server.snapshotInfo}\n`;
      }
      
      output += `  作成日時: ${formattedDate}\n`;
    });
    
    // 一度にすべての内容を送信
    this.logger(output);
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
          this.logger('サーバーは稼働中です\nIPアドレス：\n'+droplets[0].networks.v4[0].ip_address);
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
    this.logger(`スナップショット「${latestsnapshot.name}」から起動しています...`);
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
    this.logger('サーバー起動完了!（接続できない場合は数分お待ちください）\nIPアドレス：\n'+ip);
  
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
    
    const dropletId = droplets[0].id;
    const timestamp = Date.now();
    const snapshotName = `${name}-${timestamp}`;
    
    // 停止コマンド実行
    this.logger("サーバーの電源をオフにしています...");
    await this.client.droplets.powerOff(dropletId);
    
    // 電源オフの完了を待つ
    let isPoweredOff = false;
    while(!isPoweredOff) {
      await sleep(3*1000);
      const dropletInfo = await this.client.droplets.get(dropletId);
      if(dropletInfo.status === 'off') {
        isPoweredOff = true;
        this.logger("サーバーの電源がオフになりました。スナップショットを作成しています...");
      }
    }
    
    // スナップショットを作成
    try {
      await this.client.droplets.snapshot(dropletId, snapshotName);
      
      // スナップショットの作成完了を待つ
      let isSnapshotComplete = false;
      let retryCount = 0;
      const maxRetries = 60; // 最大待機回数（約5分）
      
      while(!isSnapshotComplete && retryCount < maxRetries) {
        await sleep(5*1000); // 5秒待機
        retryCount++;
        
        // スナップショットのリストを取得
        const snapshots = await this.client.snapshots.list({
          all: true,
          includeAll: true,
          page: 1,
          per_page: 200,
          resource_type: 'droplet'
        });
        
        // 作成中のスナップショットを検索
        const targetSnapshot = snapshots.find(s => s.name === snapshotName);
        
        if(targetSnapshot) {
          isSnapshotComplete = true;
          this.logger(`スナップショット「${snapshotName}」の作成が完了しました。サーバーを削除しています...`);
        }
      }
      
      if(!isSnapshotComplete) {
        this.logger("⚠️ スナップショットの作成が確認できませんでした。サーバーは削除されません。");
        this.logger("手動でスナップショットの作成状況を確認し、問題がなければ手動でサーバーを削除してください。");
        return false;
      }
      
      // ドロップレットを削除
      await this.client.droplets.delete(dropletId);
      this.logger("サーバー削除中...");
      
      // サーバーの終了を通知
      while(true){
        await sleep(5*1000);
        let currentDroplets = await this.client.droplets.list({all: true});
        // 名前が完全一致するドロップレットを選択
        currentDroplets = currentDroplets.filter(d => d.name === name);
        if(currentDroplets.length == 0){
          this.logger('サーバーは正常に終了しました!');
          break;
        }
      }
      
      return true;
      
    } catch(error) {
      this.logger(`⚠️ エラーが発生しました: ${error.message}`);
      this.logger("サーバーは削除されません。手動で対応してください。");
      return false;
    }
  }
  
  // 特定のサーバーのスナップショットリストを表示
  async snapshotList(name) {
    this.logger(`サーバー "${name}" のスナップショットリストを取得中...`);
    
    // スナップショットを取得
    let snapshots = await this.client.snapshots.list({
      all: true,
      includeAll: true,
      page: 1,
      per_page: 200,
      resource_type: 'droplet'
    });
    
    // 指定されたサーバー名に関連するスナップショットのみをフィルタリング
    snapshots = snapshots.filter(s => 
      s.name === name || 
      s.name.startsWith(`${name}-`)
    );
    
    if (snapshots.length === 0) {
      this.logger(`サーバー "${name}" のスナップショットが見つかりません`);
      return false;
    }
    
    // スナップショットを作成日時の降順でソート
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
    
    // リスト形式でスナップショットの情報を表示（一つのメッセージにまとめる）
    let output = `【${name}のスナップショット一覧】\n`;
    output += `合計: ${snapshots.length}件\n\n`;
    
    snapshots.forEach((s, index) => {
      const date = new Date(s.created_at);
      const formattedDate = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      output += `${index + 1}. ${s.name}\n`;
      output += `   作成日時: ${formattedDate}\n`;
      output += `   ID: ${s.id}\n`;
      output += `   サイズ: ${(s.size_gigabytes || 0).toFixed(1)} GB\n`;
      if (index < snapshots.length - 1) {
        output += '\n';
      }
    });
    
    // 一度にすべての内容を送信
    this.logger(output);
    
    return true;
  }
  
  // 古いスナップショットを削除
  async cleanup(name, keepCount) {
    this.logger('古いスナップショットの削除を開始します...');
    
    // スナップショットを取得
    let snapshots = await this.client.snapshots.list({
      all: true,
      includeAll: true,
      page: 1,
      per_page: 200,
      resource_type: 'droplet'
    });
    
    // 指定されたサーバー名に関連するスナップショットのみをフィルタリング
    snapshots = snapshots.filter(s => 
      s.name === name || 
      s.name.startsWith(`${name}-`)
    );
    
    if (snapshots.length === 0) {
      this.logger(`サーバー "${name}" のスナップショットが見つかりません`);
      return false;
    }
    
    // スナップショットを作成日時の降順でソート
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
    
    // 保持するスナップショットの数を確認
    if (snapshots.length <= keepCount) {
      this.logger(`削除対象のスナップショットがありません（合計: ${snapshots.length}件、保持数: ${keepCount}件）`);
      return false;
    }
    
    // 削除対象のスナップショットを特定
    const snapshotsToKeep = snapshots.slice(0, keepCount);
    const snapshotsToDelete = snapshots.slice(keepCount);
    
    this.logger(`最新の${keepCount}件のスナップショットを保持し、${snapshotsToDelete.length}件の古いスナップショットを削除します`);
    
    // リスト形式でスナップショットの情報を表示（一つのメッセージにまとめる）
    let output = `【${name}のスナップショット】\n`;
    output += `最新の${keepCount}件を保持し、${snapshotsToDelete.length}件を削除します\n\n`;
    
    // 保持するスナップショットの情報を表示
    output += '◆ 保持するスナップショット\n';
    snapshotsToKeep.forEach((s, index) => {
      const date = new Date(s.created_at);
      const formattedDate = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      output += `  ${index + 1}. ${s.name}\n`;
      output += `     作成日時: ${formattedDate}\n`;
    });
    
    // 削除するスナップショットの情報を表示
    output += '\n◆ 削除するスナップショット\n';
    snapshotsToDelete.forEach((s, index) => {
      const date = new Date(s.created_at);
      const formattedDate = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      output += `  ${index + 1}. ${s.name}\n`;
      output += `     作成日時: ${formattedDate}\n`;
    });
    
    // 一度にすべての内容を送信
    this.logger(output);
    
    // 削除の確認
    this.logger('削除を開始します...');
    
    // スナップショットを削除
    let successCount = 0;
    let errorCount = 0;
    
    for (const snapshot of snapshotsToDelete) {
      try {
        await this.client.snapshots.delete(snapshot.id);
        this.logger(`削除成功: ${snapshot.name}`);
        successCount++;
      } catch (error) {
        this.logger(`削除失敗: ${snapshot.name} (エラー: ${error.message})`);
        errorCount++;
      }
      
      // APIレート制限を避けるために少し待機
      await sleep(1000);
    }
    
    this.logger(`削除処理が完了しました（成功: ${successCount}件、失敗: ${errorCount}件）`);
    return true;
  }
}
