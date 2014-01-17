#!/bin/bash
if [ $1 ]; then
node /usr/gdvm/main --mode T --path /data/sdgo-video --date $1
else
node /usr/gdvm/main --mode T --path /data/sdgo-video
fi

