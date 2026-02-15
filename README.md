# Netease Music Player
This projects creates a Netease Music API(weapi) wrapper, API is created in an **UNETHICAL** way, so **DO NOT DISTRIBUTE** this project. This project does not implement all functions of Netease Music Client (Impossible), but I still hope to create a tool simple and powerful enough for everyone to use.

HTML files of the project relies on AI a lot. Therefore, it might be hard to maintain.
## How to use
Initialize:

1. Login into web-version Netease Music
2. Play a VIP song and get `NMTID` and `MUSIC_U` in cookies (search `m4a` in F12-Developer Tools(en traslation unchecked.) > Networks, then get the keys in COOKIES)
3. Write them into a json `{"NMTID": "", "MUSIC_U": ""}`

Run:

1. Run `server.py`
2. Open browser at `localhost:5000`(PC version) and `localhost:5000/mobile`(Mobile version, NOT UPDATED with pc version)
   
## Requirements
- requests
- flask
- pycryptodome