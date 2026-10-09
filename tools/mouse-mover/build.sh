#!/bin/sh
# Baut MouseMover.exe (Windows x64) – funktioniert unter Linux, macOS und Windows mit Go.
set -e
cd "$(dirname "$0")"
go run ./icongen mousemover.ico
go run github.com/josephspurrier/goversioninfo/cmd/goversioninfo@v1.7.0 -64 -o rsrc_windows_amd64.syso versioninfo.json
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-H windowsgui -s -w" -o MouseMover.exe .
echo "Fertig: MouseMover.exe"
