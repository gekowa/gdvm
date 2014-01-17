#!/bin/bash
if [ $1 ]; then
node /usr/gdvm/main --mode U --vhp 17173 --user comicatas@17173.com --pass 222222 --path /data/sdgo-video --date $1
else
node /usr/gdvm/main --mode U --vhp 17173 --user comicatas@17173.com --pass 222222 --path /data/sdgo-video
fi

