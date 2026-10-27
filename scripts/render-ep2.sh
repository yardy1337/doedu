#!/usr/bin/env bash
# Рендер серии 2 (оба формата) + контрольный прогон серии 1
set -e
cd "$(dirname "$0")/.."
npx remotion render Ep2Vertical out/doedu-ep2-vertical.mp4 --concurrency=4 > out/render-ep2-vertical.log 2>&1
npx remotion render Ep2Horizontal out/doedu-ep2-horizontal.mp4 --concurrency=4 > out/render-ep2-horizontal.log 2>&1
echo DONE > out/render-ep2.done
