#!/bin/sh
# Baut MouseMover.exe (Windows x64) – funktioniert unter Linux, macOS und Windows mit Go.
set -e
cd "$(dirname "$0")"
go run ./icongen mousemover.ico
go run github.com/akavel/rsrc@v0.10.2 -manifest mousemover.manifest -ico mousemover.ico -arch amd64 -o rsrc_windows_amd64.syso
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-H windowsgui -s -w" -o MouseMover.exe .
echo "Fertig: MouseMover.exe"
