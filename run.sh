#!/bin/bash
# 单实例守护：先探活，端口通就只等待；不通才启动 node（避免抢端口循环）
cd "$(dirname "$0")" || exit 1
PORT=8900
echo "[$(date '+%H:%M:%S')] 守护启动 pid=$$" >> server.log
while true; do
  if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/"; then
    sleep 5
    continue
  fi
  node server.js >> server.log 2>&1
  echo "[$(date '+%H:%M:%S')] node 退出，3 秒后重启" >> server.log
  sleep 3
done
