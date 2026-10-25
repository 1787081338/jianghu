# 江湖行 · 部署到公网（免费）

这是零依赖 Node 项目，`node server.js` 即可运行。

## 方案 A：Render（推荐，免费 + 自动 HTTPS）

1. 注册 https://render.com（GitHub 账号登录）
2. New → Web Service → 选你的仓库
3. 配置：
   - Runtime: **Node**
   - Build Command: 留空
   - Start Command: `node server.js`
4. 环境变量：
   - `DATA_FILE=/var/data/data.json`
5. 加一块 Persistent Disk：Mount Path `/var/data`，1GB（免费额度内）
6. Deploy，完成后给你 `https://xxx.onrender.com`

> 免费层 15 分钟无访问会休眠，首次访问需等 30 秒唤醒。想不休眠可升级 $7/月。

## 方案 B：Railway

1. https://railway.app → New Project → Deploy from GitHub
2. 加 Volume 挂到 `/data`，环境变量 `DATA_FILE=/data/data.json`
3. 自动识别 `npm start`

## 方案 C：自己的服务器 / VPS

```bash
git clone <repo> && cd jianghuxing
DATA_FILE=/var/lib/jianghu/data.json PORT=8900 nohup node server.js &
```
配合 Nginx 反代 + certbot 即可 HTTPS。

## 方案 D：Docker

```bash
docker build -t jianghu .
docker run -d -p 8900:8900 -v $(pwd)/data:/data jianghu
```

## 注意

- `data.json` 是全部存档，务必放在**挂载卷**里，否则重启即清空
- 想换数据库（Postgres/Redis）时，只需改 server.js 里 `db` 的读写处
