#!/bin/bash
# 查看公网地址（tunnelmole 免密码）并检测连通性
cd "$(dirname "$0")"
echo "========== 江湖行 · 公网入口 =========="
cat 公网链接.txt 2>/dev/null || echo "尚未生成，先运行 ~/tunnel/tm.sh"
URL=$(grep -o 'https://[^ ]*tunnelmole\.net' 公网链接.txt 2>/dev/null | head -1)
[ -z "$URL" ] && URL=$(grep -o 'https://[^ ]*loca\.lt' 公网链接.txt 2>/dev/null | head -1)
if [ -n "$URL" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL")
  echo "隧道状态：$code $([ "$code" = "200" ] && echo '✅ 正常' || echo '⚠ 不通（tm.sh 会自动重连）')"
fi
echo "====================================="
