# digitalocean-discord-bot

DigitalOcean ( https://www.digitalocean.com/ ) の時間課金サーバー（ Droplet ）を Discord から起動・停止するためのボットです。

予め以下の準備をしてからこのボットを起動してください。

1. Discord Bot を作成し、 CLIENT_ID と TOKEN を取得

2. Discord Bot を Discord サーバーに追加

3. DigitalOcean で Droplet を作成し、 TOKEN を取得

4. config.json 内に設定を記述

- digital_ocean_token
    
    3 で取得した TOKEN

- droplet_size

    3 で作成した Droplet のサイズ
    Basic の CPU 4コアの RAM が8GBなら`s-4vcpu-8gb`
    https://slugs.do-api.dev/

- discord_client_id

    1 で取得した CLIENT_ID

- discord_token

    1 で取得した TOKEN

※discord_api_version は 10 に対応しています。


# 動作環境

```
$ node -v
21.6.1

$ npm -v
9.8.1
```


# Getting started

```
$ npm install
$ node app.js
```

