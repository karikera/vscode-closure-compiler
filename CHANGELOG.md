# 1.2.9
* Spawn error handling

# 1.2.8
* Fix `Go to Error Line` command
* Fix configuration inheritance

# 1.2.7
* Config fix

# 1.2.6
* Add `Go to Error Line` command

# 1.2.5
* ...

# 1.2.4
* include error fix

# 1.2.3
* reference tag include bug fix

# 1.2.2
* Source dup bug fix

# 1.2.1
* Fix README

# 1.2.0
* Remove FTP feature
* Multi workspace support

# 1.1.7
* Fix `Init` command

# 1.1.6
* FTP fix: Fix `Cancel All` & `Download All` & `List` commands
* FTP fix: Password fail reconnect

# 1.1.5
* Change ignore list to use previous feature
* FTP rmdir bug fix when path has white space

# 1.1.4
* Change ignore list to use glob pattern
* Ignore ENOENT error while upload

# 1.1.3
* Fix closure compiler error

# 1.1.3
* Remove ftp feature

# 1.1.2
* Fix closure compiler error

# 1.1.1
* Fix `Download All` command
* Update Closure Compiler schema

# 1.1.0
* Cancel connection if config file is changed
* Add `Cancel All` command
* Prompt password when `password` field is not existed
* Ignore directory not found error by `remotePath`
* Closure Compiler update(closure-compiler-v20170806)
* Add new bug what i don't know

# 1.0.14
* Add logLevel option to config

# 1.0.13
* Suppress duplicated input(Closure Compiler)
* Save latest compile target(Closure Compiler)

# 1.0.12
* Whether or not ftp-kr is busy, reserve auto upload/download

# 1.0.11
* Show last error when use command with invalid configuration

# 1.0.10
* Change encoding of sftp file transfer from utf-8 to binary

# 1.0.9
* Fix about list 550 error
* Fix upload & download with shortcut

# 1.0.8
* Fix tree upload by watcher
* Auto save batch list when press OK
* Bypass reupload issue

# 1.0.7
* Stop create test.txt

# 1.0.6
* Fix autoDownload bug... maybe?

# 1.0.5
* Changing infotext for reviewing sync remote to local operations.
* Open log when upload/download manually

# 1.0.4
* Fix autoDownload bug... maybe not...

# 1.0.3
* Nothing

# 1.0.2
* Use error code instead of error number when exception check for OS compatibility
* Remove unusing files

# 1.0.1
* Bug fix

# 1.0.0
* Set version to 1.0.0 without much meaning
* Port all javascript to typescript
* Use ftp-ssl when set protocol to `ftps`
* Add `ftpOverride` and `sftpOverride` field, It can force override option of ftp/sftp connection

# 0.0.26
* Fix SFTP private key absolute path problem

# 0.0.25
* SFTP private key support  
![privatekey](images/privatekey.png)

# 0.0.24
* Update Closure compiler to v20170124

# 0.0.23
* Add `autoDownload` option, It check modification and download every opening

# 0.0.22
* Add connectionTimeout option
* Do not opens up output for every connection

# 0.0.21
* Fix ignore list did not apply to `Download/Clean All` command
* Reverse ordering of CHANGELOG.md
* Add `List` command  
![list](images/list.png)

# 0.0.20
* Fix `Download/Clean All` commands
* Add `Refresh All` command

# 0.0.19
* Add missing module

# 0.0.18
* Show notification when task takes longer then 1 second
* Add SFTP support
* Fix `Upload/Download this` in file menu
* If use `Upload/Download this` at directory it will use `Upload/Download All` command

# 0.0.17
* Add generate button when not found make.json

# 0.0.16
* Update closure compiler to v20161201

# 0.0.15
* Fix disableFtp option

# 0.0.14
* Add disableFtp option

# 0.0.13
* Fix invalid error when multiple init command
* Add detail button in error message
* Add image to README.md

# 0.0.12
* Change output as ftp-kr when use Closure-Compiler
* If make.json is not found use the latest one

# 0.0.11
* Add config.createSyncCache option! default is true
* Implement array option inheritance for Closure-Compiler settings!
* Add json schema
* Make Json command will add new config field

# 0.0.10
* Fix Closure-Compiler variable option remapping

# 0.0.9
* Split config.autosync -> config.autoUpload & config.autoDelete
* Set default value of config.autoDelete as false
* Init command will add new config field

# 0.0.8
* Add config.fileNameEncoding option!
* Fix being mute with wrong connection
* Fix Upload All command
* Fix Closure Compile All command
* Do not stop batch work even occured error

# 0.0.7
* Fix download all command

# 0.0.6
* Fix init command

# 0.0.5
* Fix creating dot ended directory when open

# 0.0.4
* Fix init command not found error (npm package dependency error)
* Fix init command error when not exists .vscode folder
* Fix ignorePath error of init command when use twice
* Fix download all command
* Decide to use MIT license

# 0.0.3
* Add git repository address!

# 0.0.2
* Fix Closure-Compiler
* Add Download This command
* Add Upload This command 

# 0.0.1
* I publish It!
