IF "%1" == "" (
	node main --mode U --vhp 17173 --user comicatas@17173.com --pass 222222 --path E:\Workspace\gdvmdata
) ELSE (
	node main --mode U --vhp 17173 --user comicatas@17173.com --pass 222222 --path E:\Workspace\gdvmdata --date %1
)