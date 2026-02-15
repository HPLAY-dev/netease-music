import base64
import json
import random
import binascii
import time
import os
import sys
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
import requests
# from bs4 import BeautifulSoup

class NeteaseMusicEncrypt:
    """网易云音乐 Web 端 weapi 加密模块"""
    def __init__(self):
        self.pub_key = "010001"
        self.modulus = "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7"
        self.iv = "0102030405060708"
        self.nonce = "0CoJUm6Qyw8W8jud"
    
    def _generate_random_key(self, size=16):
        return ''.join(random.choice('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') for _ in range(size))
    
    def _aes_encrypt(self, text, key):
        text = text.encode('utf-8')
        cipher = AES.new(key.encode('utf-8'), AES.MODE_CBC, self.iv.encode('utf-8'))
        encrypted = cipher.encrypt(pad(text, 16))
        return base64.b64encode(encrypted).decode('utf-8')
    
    def _rsa_encrypt(self, text):
        text = text[::-1]
        hex_text = binascii.hexlify(text.encode('utf-8')).decode('utf-8')
        result = pow(int(hex_text, 16), int(self.pub_key, 16), int(self.modulus, 16))
        return format(result, 'x').zfill(256)
    
    def encrypt(self, data):
        secret_key = self._generate_random_key(16)
        enc_text = self._aes_encrypt(json.dumps(data), self.nonce)
        enc_text = self._aes_encrypt(enc_text, secret_key)
        enc_sec_key = self._rsa_encrypt(secret_key)
        return {"params": enc_text, "encSecKey": enc_sec_key}

class NeteaseMusicAPI:
    """合并后的增强版 API 客户端"""
    
    DEFAULT_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
        'Referer': 'https://music.163.com/',
        'Origin': 'https://music.163.com/',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }

    def __init__(self, cookies=None):
        self.cookies = cookies or {}
        self.headers = self.DEFAULT_HEADERS.copy()
        self.encryptor = NeteaseMusicEncrypt()
        
        self.dl_headers = self.headers.copy()
        self.dl_headers.update({
            'Accept': '*/*',
            'Connection': 'keep-alive',
            'Range': 'bytes=0-'
        })

    def _get_csrf(self):
        return self.cookies.get('__csrf', '')

    def _make_request(self, endpoint, data):
        """通用加密请求发送器"""
        payload = self.encryptor.encrypt(data)
        url = f'https://music.163.com/weapi/{endpoint}?csrf_token={self._get_csrf()}'
        resp = requests.post(url, headers=self.headers, cookies=self.cookies, data=payload)
        return resp.json()

    # 有用但不完全有用的函数...
    def get_fans(self, user_id, limit=20, offset=0, total=False):
        data = {
            "userId": str(user_id),
            "offset": str(offset),
            "limit": str(limit),
            "csrf_token": self._get_csrf(),
            "total": str(total).lower()
        }
        return self._make_request("user/getfolloweds", data)
    
    def get_dynamics(self, user_id):
        data = {
            "csrf_token": self._get_csrf()
        }
        return self._make_request(f'event/get/{str(user_id)}', data=data)
    
    def get_comments(self, song_id):
        data = {
            "csrf_token": self._get_csrf()
        }
        return self._make_request(f'v1/resources/comments/R_SO_4_{str(song_id)}', data=data)

    # 主要函数
    def search(self, keyword, search_type="1", limit=10, offset=0):
        """
        使用 cloudsearch 接口获取完整搜索结果
        search_type: {
            1       单曲
            10      专辑
            100     歌手
            1000    歌单
            1002    用户
            1004    MV
            1006    歌词
            1009    主播电台
        }
        """
        data = {
            "s": keyword,
            "type": str(search_type),
            "limit": str(limit),
            "offset": str(offset),
            "total": "true",
            "csrf_token": self._get_csrf()
        }
        temp = self._make_request("cloudsearch/get/web", data)
        return temp

    def get_song_detail(self, song_ids):
        if isinstance(song_ids, (int, str)): song_ids = [song_ids]
        data = {"c": json.dumps([{"id": str(i)} for i in song_ids]), "ids": json.dumps([str(i) for i in song_ids]), "csrf_token": self._get_csrf()}
        return self._make_request("v3/song/detail", data)

    def get_artist_description(self, artist_id):
        data = {
            "id": str(artist_id),
            "csrf_token": self._get_csrf()
        }
        return self._make_request("artist/introduction", data)
    
    def get_artist_avatar(self, artist_id):
        # TODO: needs work on it. I failed to implement it...
        return ""

    # 歌手 专辑
    def get_songs_artist(self, artist_id):
        """
        获取歌手的热门歌曲 (Top 50)
        :param artist_id: 歌手 ID
        """
        data = {
            "id": str(artist_id),
            "csrf_token": self._get_csrf()
        }
        # 使用注释中提到的 weapi 路径
        return self._make_request("artist/top/song", data)
    
    def get_album(self, album_id):
        url = f"https://music.163.com/api/v1/album/{str(album_id)}"
        headers = self.headers

        return requests.get(url, headers=headers).json()

    def get_lyric(self, song_id):
        data = {"id": str(song_id), "lv": -1, "kv": -1, "tv": -1, "csrf_token": self._get_csrf()}
        return self._make_request("song/lyric", data)
    
    # --- 核心音频获取接口 ---
    def get_song_url(self, song_id, level="lossless"):
        """获取播放链接（带码率映射映射）"""
        br_map = {
            "standard": "128000",
            "higher": "192000",
            "exhigh": "320000",
            "lossless": "999000",
            "hires": "999000"
        }
        data = {
            "ids": f"[{song_id}]",
            "level": level,
            "encodeType": "aac",
            "br": br_map.get(level, "320000"),
            "header": json.dumps({"os": "pc"}),
            "csrf_token": self._get_csrf()
        }
        return self._make_request("song/enhance/player/url/v1", data)

    # --- 增强下载功能 ---
    def download(self, url, filename):
        """带身份验证的下载，防止 403"""
        with requests.get(url, headers=self.dl_headers, cookies=self.cookies, stream=True) as r:
            if r.status_code >= 400:
                print(f"下载失败: {r.status_code}. 请检查 Cookie 是否过期。")
                return
            
            with open(filename, 'wb') as f:
                for chunk in r.iter_content(chunk_size=1024*128):
                    if chunk: f.write(chunk)
        print(f"成功保存至: {filename} (大小: {os.path.getsize(filename)/1024/1024:.2f} MB)")

    @classmethod
    def from_raw_cookie_str(cls, cookie_str):
        """直接从浏览器复制的 curl cookie 字符串创建实例"""
        cookies = {}
        for item in cookie_str.split(';'):
            item = item.strip()
            if '=' in item:
                k, v = item.split('=', 1)
                cookies[k] = v
        return cls(cookies=cookies)

# --- 使用示例 ---
if __name__ == "__main__":
    while True:
        run = input('>')
        run = run.split(' ')
        if run[0] == 'lc':
            cookies = json.loads(open('cookies.json', 'r').read())
            api = NeteaseMusicAPI(cookies)
        elif run[0] == 's':
            print(json.dumps(api.search(' '.join(run[1:])), indent=2))
        elif run[0] == 'd':
            result = api.get_song_url(int(run[1]), level=run[2])
            dtl = api.get_song_detail(int(run[1]))
            url = result['data'][0]['url']
            if url is None:
                print('VIP')
                continue
            open(dtl['songs'][0]['name']+'.'+result['data'][0]['type'], 'wb').write(requests.get(url, headers=api.dl_headers, cookies=api.cookies).content)
        elif run[0] == 'q':
            sys.exit(0)