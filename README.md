# 网易云音乐
该项目使用网易云音乐`weapi`实现开源客户端，基于Flask

*注：html文件基本使用ai实现*
## 如何使用
初始化（仅在需要播放VIP歌曲与高音质时需要）

1. 在网页版网易云音乐登录VIP账号
2. 播放一首VIP歌曲，在F12开发人员工具的Network (网络)页面查看该请求，在COOKIES中获取 `NMTID` 与 `MUSIC_U`
3. 写入json `{"NMTID": "", "MUSIC_U": ""}`

运行:

1. 在**项目目录下**运行 `server.py`
2. 打开浏览器，进入`http://localhost:5000`
   
## 需求（pip安装）
- requests
- flask
- pycryptodome