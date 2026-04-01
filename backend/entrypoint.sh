#!/bin/sh
redis-server /etc/redis.conf --daemonize yes
sleep 1
exec ./dealer
