#!/bin/bash
# 一键部署到 Linux 云服务器（Ubuntu/Debian，阿贝云/阿里云/腾讯云通用）
# 用法：把本文件内容粘贴到服务器的终端里执行，或者上传后 bash deploy-vps.sh
set -e
PORT="${PORT:-8900}"
echo "==> 1/5 安装依赖"
if command -v apt >/dev/null; then
  sudo apt update -y && sudo apt install -y curl git
  if ! command -v node >/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
  fi
fi
node -v || { echo "Node 安装失败，请手动安装 nodejs"; exit 1; }

echo "==> 2/5 拉取代码"
if [ -d /opt/jianghu/.git ]; then
  cd /opt/jianghu && git pull --rebase || true
else
  sudo mkdir -p /opt && sudo chown $USER /opt
  git clone --depth 1 https://github.com/1787081338/jianghu.git /opt/jianghu || \
  git clone --depth 1 https://ghproxy.net/https://github.com/1787081338/jianghu.git /opt/jianghu
fi
cd /opt/jianghu

echo "==> 3/5 配置存档（可选：填了 GH_TOKEN 就同步到 GitHub 私库）"
cat > .env <<ENVFILE
PORT=$PORT
GH_REPO=${GH_REPO:-1787081338/jianghu-data}
GH_TOKEN=${GH_TOKEN:-}
ENVFILE

echo "==> 4/5 注册开机自启"
sudo tee /etc/systemd/system/jianghu.service >/dev/null <<SVC
[Unit]
Description=Jianghu Game
After=network.target
[Service]
Type=simple
WorkingDirectory=/opt/jianghu
EnvironmentFile=/opt/jianghu/.env
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
SVC
sudo systemctl daemon-reload
sudo systemctl enable jianghu >/dev/null 2>&1
sudo systemctl restart jianghu

echo "==> 5/5 完成"
sleep 2
curl -s -o /dev/null -w "本地自检: %{http_code}\n" "http://127.0.0.1:$PORT/api/health" || true
IP=$(curl -s --max-time 5 ifconfig.me || echo "服务器IP")
echo "游戏地址: http://$IP:$PORT/"
echo "GM 后台 : http://$IP:$PORT/gm.html  密钥 gm-7f3a91c2"
