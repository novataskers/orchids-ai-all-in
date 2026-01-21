#!/bin/bash

warp-svc &
sleep 2

warp-cli --accept-tos registration new 2>/dev/null || true
warp-cli --accept-tos mode proxy
warp-cli --accept-tos proxy port 40000
warp-cli --accept-tos connect

sleep 2

export WARP_PROXY="socks5://127.0.0.1:40000"

exec npm start
