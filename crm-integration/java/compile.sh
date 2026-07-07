#!/usr/bin/env bash
# 编译 PartnerHubLeadNotifyJob.class
#
# 用法：
#   ./compile.sh                    # 输出到 ../dist/（无需帆软环境）
#   FR_HOME=/path/to/WebReport ./compile.sh   # 同时复制到帆软 WEB-INF/classes
#
# 说明：本地用 stubs/ 编译；CRM 服务器运行时由帆软 lib 提供真实类。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
OUT_DIR="$SCRIPT_DIR/out"
SOURCE="$SCRIPT_DIR/com/fr/data/PartnerHubLeadNotifyJob.java"
STUBS="$SCRIPT_DIR/stubs"

mkdir -p "$OUT_DIR" "$DIST_DIR/com/fr/data"

if [[ -n "${FR_HOME:-}" ]]; then
  LIB_DIR="$FR_HOME/WEB-INF/lib"
  if [[ -d "$LIB_DIR" ]]; then
    CP="$LIB_DIR/*"
    echo "==> 使用帆软 lib 编译: $LIB_DIR"
  else
    echo "警告: 找不到 $LIB_DIR，改用 stubs 编译" >&2
    CP="$STUBS"
  fi
else
  CP="$STUBS"
  echo "==> 使用 stubs 编译（无需 FR_HOME）"
fi

echo "==> 编译 PartnerHubLeadNotifyJob.java ..."
javac -encoding UTF-8 -source 8 -target 8 -cp "$CP" -d "$OUT_DIR" "$SOURCE"

CLASS_SRC="$OUT_DIR/com/fr/data/PartnerHubLeadNotifyJob.class"
CLASS_DST="$DIST_DIR/com/fr/data/PartnerHubLeadNotifyJob.class"
cp "$CLASS_SRC" "$CLASS_DST"

echo "==> 已输出: $CLASS_DST"
ls -la "$CLASS_DST"

if [[ -n "${FR_HOME:-}" ]] && [[ -d "${FR_HOME}/WEB-INF/classes" ]]; then
  TARGET="$FR_HOME/WEB-INF/classes/com/fr/data/PartnerHubLeadNotifyJob.class"
  mkdir -p "$(dirname "$TARGET")"
  cp "$CLASS_SRC" "$TARGET"
  echo "==> 已复制到 $TARGET"
  echo "==> 请重启帆软报表服务使 class 生效"
else
  echo ""
  echo "部署：将 dist/com/fr/data/PartnerHubLeadNotifyJob.class"
  echo "  复制到 <帆软>/WEB-INF/classes/com/fr/data/"
  echo "  然后重启帆软报表服务"
fi
