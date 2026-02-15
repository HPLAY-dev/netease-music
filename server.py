from flask import Flask, request, jsonify, send_from_directory, render_template_string
import json
import os
from api import NeteaseMusicAPI 

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 初始化 API
def get_api():
    try:
        with open('cookies.json', 'r') as f:
            cookies = json.load(f)
    except:
        cookies = {}
    return NeteaseMusicAPI(cookies)

api = get_api()

HTML_TEMPLATE = open(os.path.join(BASE_DIR, 'html', 'index.html'), encoding='utf-8').read()

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/api/search')
def search_api():
    # 获取搜索关键词
    keyword = request.args.get('q')
    
    # 获取分页参数，设置默认值：limit=20, offset=0
    # 使用 type=int 确保获取到的是数字而不是字符串
    limit = request.args.get('limit', default=20, type=int)
    offset = request.args.get('offset', default=0, type=int)
    
    if not keyword:
        return jsonify({"result": {"songs": []}})

    # 调用 search 函数并透传参数
    # 假设 search_type="1" 代表单曲搜索
    result = api.search(keyword, search_type="1", limit=limit, offset=offset)
    
    return jsonify(result)

@app.route('/api/download')
def download_api():
    song_id = request.args.get('id')
    level = request.args.get('level', 'lossless')
    
    # 获取 URL
    url_res = api.get_song_url(song_id, level=level)
    if not url_res['data'] or not url_res['data'][0]['url']:
        return jsonify({"success": False, "message": "无法获取播放地址，可能是VIP或版权限制"})
    
    # 获取详情以命名
    detail = api.get_song_detail(song_id)
    song_name = detail['songs'][0]['name']
    ext = url_res['data'][0]['type'].lower()
    filename = f"{song_name}.{ext}"
    
    # 执行下载
    try:
        api.download(url_res['data'][0]['url'], filename)
        return jsonify({"success": True, "filename": filename})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

@app.route('/api/artist')
def artist_songs_api():
    artist_id = request.args.get('id')
    result = api.get_songs_artist(artist_id)
    return jsonify(result)

@app.route('/api/lyric')
def lyric_api():
    song_id = request.args.get('id')
    return jsonify(api.get_lyric(song_id))

@app.route('/api/album')
def album_songs_api():
    album_id = request.args.get('id')
    return jsonify(api.get_album(album_id))

@app.route('/api/artist_desc')
def artist_desc_api():
    artist_id = request.args.get('id')
    return jsonify(api.get_artist_description(artist_id))

@app.route('/api/detail')
def detail_api():
    song_id = request.args.get('id')
    return jsonify(api.get_song_detail(song_id))

# 获取歌曲直链（给前端 audio 标签用）
@app.route('/api/proxy_url')
def proxy_url():
    song_id = request.args.get('id')
    level = request.args.get('level', 'standard')
    res = api.get_song_url(song_id, level=level)
    return jsonify(res)

@app.route('/html/assets/<path:filename>')
def serve_assets(filename):
    # 这里的路径必须指向 html 文件夹下的 assets
    assets_path = os.path.join(BASE_DIR, 'html', 'assets')
    return send_from_directory(assets_path, filename)

@app.route('/mobile')
def mobile_index():
    return send_from_directory(os.path.join(BASE_DIR, 'html'), 'mobile.html')

@app.route('/favicon.ico')
def serve_favicon():
    return send_from_directory(BASE_DIR, 'favicon.svg')

@app.route('/README.md')
def serve_readme():
    return send_from_directory(BASE_DIR, 'README.md')

@app.route('/style.css')
def serve_style():
    return send_from_directory(os.path.join(BASE_DIR, 'html'), 'style.css')

@app.route('/script.js')
def serve_script():
    return send_from_directory(os.path.join(BASE_DIR, 'html'), 'script.js')

if __name__ == '__main__':
    # 启动服务器，默认端口 5000
    app.run(debug=False, host='0.0.0.0', port=5000)