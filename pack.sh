#!/usr/bin/env bash
set -e

# ไปยังไดเรกทอรี root ของโปรเจกต์
cd "$(dirname "$0")"

# เรียกใช้งานสคริปต์ pack.js ด้วย bun
bun script/pack.js
