IF "%1" == "" (
	node main --mode U --vhp 17173 --user comicatas@17173.com --pass 222222 --path F:\sdgo-video) ELSE (
	node main --mode U --vhp 17173 --user comicatas@17173.com --pass 222222 --path F:\sdgo-video --date %1
)