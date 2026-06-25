#!/usr/bin/env bash
# 编译 PartnerHubLeadNotifyJob.class 并复制到帆软 WEB-INF/classes
#
# 用法：
#   export FR_HOME=/path/to/WebReport   # 帆软部署目录，含 WEB-INF/lib
#   ./compile.sh
#
# 示例 FR_HOME：
#   Linux: /opt/finereport/WebReport
#   或决策报表: /opt/tomcat/webapps/WebReport

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FR_HOME="${FR_HOME:-}"

if [[ -z "$FR_HOME" ]]; then
  echo "请设置 FR_HOME 为帆软 WebReport 根目录（含 WEB-INF/lib）" >&2
  echo "例: export FR_HOME=/opt/finereport/WebReport && $0" >&2
  exit 1
fi

LIB_DIR="$FR_HOME/WEB-INF/lib"
OUT_DIR="$SCRIPT_DIR/out"
CLASSES_DIR="$FR_HOME/WEB-INF/classes"

if [[ ! -d "$LIB_DIR" ]]; then
  echo "找不到 $LIB_DIR，请确认 FR_HOME 正确" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "==> 编译 PartnerHubLeadNotifyJob.java ..."
javac -encoding UTF-8 -cp "$LIB_DIR/*" -d "$OUT_DIR" "$SCRIPT_DIR/PartnerHubLeadNotifyJob.java"

TARGET="$CLASSES_DIR/com/fr/data/PartnerHubLeadNotifyJob.class"
mkdir -p "$(dirname "$TARGET")"
cp "$OUT_DIR/com/fr/data/PartnerHubLeadNotifyJob.class" "$TARGET"

echo "==> 已复制到 $TARGET"
echo "==> 请重启帆软报表服务使 class 生效"
