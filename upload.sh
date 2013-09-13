#!/bin/bash
if [ $1 ]; then
node --debug /usr/gdvm/main --mode U --17173user comicatas@17173.com --17173pass 222222 --path /data/sdgo-video --date $1
else
node --debug /usr/gdvm/main --mode U --17173user comicatas@17173.com --17173pass 222222 --path /data/sdgo-video
fi

