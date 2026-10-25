#!/bin/bash
cd "$(dirname "$0")" || exit 1
PORT=8900
IP=$(ifconfig 2>/dev/null | awk '/inet /&&!/127\.0\.0\.1/{print $2; exit}')
if ! curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/"; then
  echo "启动中…"; (setsid nohup ./run.sh > /dev/null 2>&1 < /dev/null &); sleep 3
fi
echo "=========== 江湖行 ==========="
echo "本机：  http://127.0.0.1:$PORT/"
[ -n "$IP" ] && echo "局域网：http://$IP:$PORT/"
curl -s -o /dev/null -w "状态：%{http_code}\n" "http://127.0.0.1:$PORT/"
echo "=============================="
