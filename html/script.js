const audio = document.getElementById('main-audio');
const lrcWindow = document.getElementById('lrc-window');
const lrcContainer = document.getElementById('lyric-container');

let lyrics = [];
let isFull = false;
let userIsScrolling = false;
let scrollTimer = null;
let currentSongId = null;
let currentLevel = 'standard';
let currentPage = 1;

// playback state
let playMode = 'sequential'; // 'sequential' | 'shuffle' | 'repeat-one'
let playbackContext = null; // currently playing list (array)
let playbackIndex = 0; // index in playbackContext
let renderedList = null; // currently rendered list on screen (used for playFromRenderedList)
let playlists = {}; // explicit playlists store (was implicit global)
let currentPlaylist = null; // currently selected playlist name

// drag state for playlist reorder
let dragSrcIndex = null;

// cached DOM nodes for performance
const songList = document.getElementById('song-list');
const kwInput = document.getElementById('kw');
const searchBtnEl = document.getElementById('search-btn') || document.querySelector('.search-bar button');
const clearBtnEl = document.getElementById('clear-btn');
const paginationEl = document.getElementById('pagination');
const playlistsEl = document.getElementById('playlists');
const toastContainerEl = document.getElementById('toast-container');

// small utility: escape for data-attrs / html
function escapeAttr(str) { return String(str || '').replace(/"/g, '&quot;').replace(/'/g, "&#39;").replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// escape HTML for text-to-HTML fallback (used when `marked` is not available)
function escapeHtml(str) { return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Toast implementation (提前声明，避免引用错误)
function showToast(message, type='') {
    const container = toastContainerEl || document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = 'toast ' + (type?type:'');
    t.innerText = message;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(()=>container.removeChild(t), 250); }, 3000);
}

// 核心：抽离出的渲染列表函数
function renderSongList(songs) {
    const list = songList;
    list.innerHTML = '';
    
    songs.forEach(s => {
        const item = document.createElement('div');
        item.className = 'song-item';
        
        const artistsText = s.ar.map(a => a.name).join(', ');
        const albumName = s.al ? s.al.name : "未知专辑";
        const albumId = s.al ? s.al.id : null;
        const albumPic = s.al ? s.al.picUrl : "";

        let actionHtml = '';
        if (currentPlaylist) {
            actionHtml = `<div class="actions">
                <img src="/html/assets/play.svg" class="icon-btn" data-action="play" data-id="${s.id}" data-name="${s.name.replace(/'/g, "\\'")}" data-artist="${artistsText.replace(/'/g, "\\'")}" title="播放">
                <img src="/html/assets/download.svg" class="icon-btn" data-action="download" data-id="${s.id}" title="下载">
                <span class="icon-del" data-action="remove" data-playlist="${escapeAttr(currentPlaylist)}" data-id="${s.id}" title="从歌单中删除">x</span>
            </div>`;
        } else {
            // include artist IDs on the add button so playlists can store artist ids
            const artistIds = s.ar.map(a => a.id).join(',');
            actionHtml = `<div class="actions">
                <img src="/html/assets/play.svg" class="icon-btn" data-action="play" data-id="${s.id}" data-name="${s.name.replace(/'/g, "\\'")}" data-artist="${artistsText.replace(/'/g, "\\'")}" title="播放">
                <img src="/html/assets/download.svg" class="icon-btn" data-action="download" data-id="${s.id}" title="下载">
                <span class="icon-add" data-action="add" data-id="${s.id}" data-name="${s.name.replace(/'/g, "\\'")}" data-artist="${artistsText.replace(/'/g, "\\'")}" data-artist-ids="${artistIds}" data-album-id="${albumId}" data-album-name="${albumName.replace(/'/g, "\\'")}" data-album-pic="${albumPic}" title="加入歌单">＋</span>
            </div>`;
        }

        item.innerHTML = `
            <img src="${albumPic}?param=60y60" class="song-cover" loading="lazy">
            <div style="flex: 2; display: flex; flex-direction: column; overflow: hidden;">
                <span class="song-name" data-action="play" data-id="${s.id}" data-name="${s.name.replace(/'/g, "\\'")}" data-artist="${artistsText.replace(/'/g, "\\'")}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${s.name}
                </span>
<small class="album-info" data-action="album" data-album-id="${albumId}" data-album-name="${albumName.replace(/'/g, "\\'")}" data-album-pic="${albumPic}" 
                    style="color: var(--text-sub); cursor: pointer; font-size: 12px; margin-top: 4px;" 
                    onmouseover="this.style.color='var(--main-color)'" 
                    onmouseout="this.style.color='var(--text-sub)'">
                    ${albumName}
                </small>
            </div>
            <div class="artist-name">
                ${s.ar.map(a => `
                    <span class="artist-span" data-action="artist" data-artist-id="${a.id}" data-artist-name="${a.name.replace(/'/g, "\\'")}">
                        ${a.name}
                    </span>
                `).join(', ')}
            </div>
            ${actionHtml}
        `;
        list.appendChild(item);

        // populate data-* attributes for event-delegation (keeps HTML generation unchanged)
        const nameEl = item.querySelector('.song-name'); if (nameEl) { nameEl.dataset.action = 'play'; nameEl.dataset.id = s.id; nameEl.dataset.name = s.name; nameEl.dataset.artist = artistsText; }
        const albumEl = item.querySelector('small'); if (albumEl) { albumEl.dataset.action = 'album'; albumEl.dataset.albumId = albumId; albumEl.dataset.albumName = albumName; albumEl.dataset.albumPic = albumPic; }
        const artistEls = item.querySelectorAll('.artist-span'); artistEls.forEach((el, idx) => { const a = s.ar[idx]; if (a) { el.dataset.action = 'artist'; el.dataset.artistId = a.id; el.dataset.artistName = a.name; } });
        const actionImgs = item.querySelectorAll('.actions .icon-btn'); if (actionImgs[0]) { actionImgs[0].dataset.action = 'play'; actionImgs[0].dataset.id = s.id; }
        if (actionImgs[1]) { actionImgs[1].dataset.action = 'download'; actionImgs[1].dataset.id = s.id; }
        const addBtn = item.querySelector('.icon-add'); if (addBtn) { addBtn.dataset.action = 'add'; addBtn.dataset.name = s.name; addBtn.dataset.artist = artistsText; addBtn.dataset.artistIds = s.ar.map(a=>a.id).join(','); addBtn.dataset.albumName = albumName; addBtn.dataset.albumId = albumId; addBtn.dataset.albumPic = albumPic; }
        const delBtn = item.querySelector('.icon-del'); if (delBtn) { delBtn.dataset.action = 'remove'; delBtn.dataset.id = s.id; }
    });
    // ensure each list item has a current index dataset (used by drag / playback)
    Array.from(songList.querySelectorAll('.song-item')).forEach((it, i) => it.dataset.index = i);
}

// 搜索函数
async function doSearch(page = 1) {
    const list = songList;
    const header = document.getElementById('info-header');
    
    list.innerHTML = ''; 
    if (header) header.style.display = 'none';

    const kw = (kwInput && kwInput.value) || ''; 
    if (!kw) {
        loadWelcomePage();
        return;
    }
    // Ensure playlists hidden when searching
    hidePlaylists();
    currentPlaylist = null;
    if (paginationEl) paginationEl.style.display = '';
    currentPage = page;
    const limit = 20;
    const offset = (page - 1) * limit;

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(kw)}&offset=${offset}&limit=${limit}`);
        const data = await res.json();
        if (data.result && data.result.songs) {
            renderedList = data.result.songs;
            renderSongList(data.result.songs);
            renderPagination(data.result.songCount, page);
            window.scrollTo(0, 0);
        }
    } catch (e) { console.error(e); }
}

async function doArtistSearch(artistId, artistName, artistPic = "") {
    hidePlaylists();
    if (kwInput) kwInput.value = "歌手: " + artistName;
    const header = document.getElementById('info-header');
    const descBox = document.getElementById('info-desc');
    const titleBox = document.getElementById('info-title');
    const picBox = document.getElementById('info-big-pic');
    const typeBox = document.getElementById('info-type');

    header.style.display = 'block';
    titleBox.innerText = artistName;
    typeBox.innerText = "歌手";
    descBox.innerText = "正在获取歌手简介...";
    
    if(artistPic) picBox.src = artistPic + "?param=200y200";
    if (paginationEl) paginationEl.style.display = 'none';

    try {
        const [descRes, songsRes] = await Promise.all([
            fetch(`/api/artist_desc?id=${artistId}`),
            fetch(`/api/artist?id=${artistId}`)
        ]);
        const descData = await descRes.json();
        const songsData = await songsRes.json();
        descBox.innerText = descData.briefDesc || "该歌手暂无简介。";
        const songs = songsData.songs || songsData.hotSongs || [];
        if (!picBox.src && songs.length > 0) {
            picBox.src = songs[0].ar[0].img1v1Url + "?param=200y200";
        }
        if (songs.length > 0) { renderedList = songs; renderSongList(songs); }
        window.scrollTo(0, 0);
    } catch (e) { console.error(e); }
}

async function doAlbumSearch(albumId, albumName, albumPic) {
    hidePlaylists();
    if (kwInput) kwInput.value = "专辑: " + albumName;
    const header = document.getElementById('info-header');
    const descBox = document.getElementById('info-desc');
    const titleBox = document.getElementById('info-title');
    const picBox = document.getElementById('info-big-pic');
    const typeBox = document.getElementById('info-type');
    
    header.style.display = 'block';
    titleBox.innerText = albumName;
    picBox.src = albumPic ? albumPic + "?param=200y200" : "";
    if (typeBox) typeBox.innerText = "专辑";

    descBox.innerText = "正在加载专辑详情..."; 
    if (paginationEl) paginationEl.style.display = 'none';

    try {
        const res = await fetch(`/api/album?id=${albumId}`);
        const data = await res.json();
        const description = (data.album && data.album.description) || "暂无专辑介绍";
        descBox.innerText = description;
        const songs = data.songs || (data.album && data.album.songs) || [];
        if (songs.length > 0) { renderedList = songs; renderSongList(songs); }
        window.scrollTo(0, 0);
    } catch (e) { console.error(e); }
}

function changePage(delta) {
    const newPage = currentPage + delta;
    if (newPage < 1) return;
    doSearch(newPage);
}

function lockAutoScroll() {
    userIsScrolling = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { userIsScrolling = false; }, 3000); 
}

lrcWindow.addEventListener('wheel', () => lockAutoScroll());
lrcWindow.addEventListener('touchstart', () => lockAutoScroll());

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
}

// (mobile-aware toggle implemented later)

function renderPagination(totalCount, page) {
    const limit = 20;
    const totalPages = Math.ceil(totalCount / limit);
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const pageNumDisplay = document.getElementById('page-num');

    if (pageNumDisplay) pageNumDisplay.innerText = `第 ${page} / ${totalPages || 1} 页 (共${totalCount}首)`;
    if (prevBtn) {
        prevBtn.disabled = (page <= 1);
        prevBtn.onclick = () => doSearch(page - 1);
    }
    if (nextBtn) {
        nextBtn.disabled = (page >= totalPages);
        nextBtn.onclick = () => doSearch(page + 1);
    }
}

async function changeQuality(level) {
    currentLevel = level;
    if (!currentSongId) return;
    const currentTime = audio.currentTime;
    const wasPlaying = !audio.paused;
    try {
        const res = await fetch(`/api/proxy_url?id=${currentSongId}&level=${currentLevel}`);
        const data = await res.json();
        const newUrl = data.data[0].url;
        if (!newUrl) { showToast('该音质暂不可用', 'warn'); return; }
        audio.src = newUrl;
        audio.currentTime = currentTime;
        if (wasPlaying) audio.play();
        setPlayIcon(!audio.paused);
    } catch (e) { console.error(e); }
}

async function playSong(id, name, artist) {
    // ensure playbackContext tracks the current rendered list when possible
    if (renderedList) {
        const idx = renderedList.findIndex(s => s.id === id);
        if (idx !== -1) {
            playbackContext = renderedList;
            playbackIndex = idx;
        } else {
            playbackContext = [{ id, name, ar: [], al: {} }];
            playbackIndex = 0;
        }
    }

    currentSongId = id;
    document.getElementById('bar-song-name').innerText = name;
    document.getElementById('bar-artist-name').innerText = artist;
    document.getElementById('full-title').innerText = name;
    document.getElementById('fp-artist').innerText = artist;

    try {
        const [urlRes, dtlRes, lrcRes] = await Promise.all([
            fetch(`/api/proxy_url?id=${id}&level=${currentLevel}`),
            fetch(`/api/detail?id=${id}`),
            fetch(`/api/lyric?id=${id}`)
        ]);
        const urlData = await urlRes.json();
        const dtlData = await dtlRes.json();
        const lrcData = await lrcRes.json();

        if (!urlData.data[0].url) { showToast('链接获取失败', 'error'); return; }

        const songDtl = dtlData.songs[0];
        document.getElementById('bar-cover-img').src = songDtl.al.picUrl;
        document.getElementById('big-cover').src = songDtl.al.picUrl;
        document.getElementById('detail-album').innerText = songDtl.al.name;
        const date = new Date(songDtl.publishTime).toLocaleDateString();
        document.getElementById('detail-date').innerText = date === 'Invalid Date' ? '未知' : date;

        parseLyric(lrcData.lrc ? lrcData.lrc.lyric : "[00:00.00]无歌词");
        audio.src = urlData.data[0].url;
        audio.play();
        setPlayIcon(true);
    } catch (e) { console.error(e); }
}

function parseLyric(lrc) {
    lyrics = [];
    lrcContainer.innerHTML = '';
    lrc.split('\n').forEach((line) => {
        const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
        if (match) {
            const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
            const text = match[3].trim();
            if(!text && lyrics.length > 0 && lyrics[lyrics.length-1].text === "") return;
            lyrics.push({ time, text });
            const div = document.createElement('div');
            div.className = 'lyric-line';
            div.innerText = text || "•••";
            div.onclick = (e) => {
                e.stopPropagation();
                audio.currentTime = time;
                userIsScrolling = false;
                if (audio.paused) audio.play();
            };
            lrcContainer.appendChild(div);
        }
    });
}

audio.ontimeupdate = () => {
    const curr = audio.currentTime;
    const dur = audio.duration;
    if (!dur) return;
    document.getElementById('progress-bar').style.width = (curr / dur) * 100 + '%';
    const index = lyrics.findIndex((l, i) => curr >= l.time && (!lyrics[i+1] || curr < lyrics[i+1].time));
    if(index !== -1) {
        const lines = lrcContainer.querySelectorAll('.lyric-line');
        if(lines[index] && !lines[index].classList.contains('active')) {
            lines.forEach(l => l.classList.remove('active'));
            lines[index].classList.add('active');
            document.getElementById('bar-lrc-preview').innerText = lyrics[index].text;
            if (!userIsScrolling) {
                const targetLine = lines[index];
                const scrollPos = targetLine.offsetTop - lrcWindow.offsetHeight / 2 + targetLine.offsetHeight / 2;
                lrcWindow.scrollTo({ top: scrollPos, behavior: 'smooth' });
            }
        }
    }
};

function setPlayIcon(isPlaying) {
    document.getElementById('play-btn-img').src = isPlaying ? '/html/assets/pause.svg' : '/html/assets/play.svg';
}

function togglePlay() {
    if (!audio.src) return;
    audio.paused ? audio.play() : audio.pause();
    setPlayIcon(!audio.paused);
}

function seek(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    audio.currentTime = ((event.clientX - rect.left) / rect.width) * audio.duration;
}

async function downloadSong(id, name) {
    const res = await fetch(`/api/proxy_url?id=${id}&level=${currentLevel}`);
    const data = await res.json();
    if(data.data[0].url) window.open(data.data[0].url);
}

function loadPlaylistsFromStorage() {
    try {
        const raw = localStorage.getItem('playlists');
        const rawObj = raw ? JSON.parse(raw) : {};
        // normalize older array format to { songs: [], cover: '' }
        playlists = {};
        Object.keys(rawObj).forEach(k => {
            const v = rawObj[k];
            if (Array.isArray(v)) playlists[k] = { songs: v, cover: '' };
            else playlists[k] = v;
        });
        // persist normalized structure
        localStorage.setItem('playlists', JSON.stringify(playlists));
    } catch (e) { playlists = {}; }
}

function savePlaylistsToStorage() {
    try { localStorage.setItem('playlists', JSON.stringify(playlists)); } catch (e) { console.error(e); }
    renderPlaylistsOverview();
}

function renderPlaylistsOverview() {
    const container = playlistsEl;
    if (!container) return;
    container.innerHTML = '';
    const keys = Object.keys(playlists);
    if (keys.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'flex';
    keys.forEach(name => {
        const obj = playlists[name] || { songs: [], cover: '' };
        const list = obj.songs || [];
        const card = document.createElement('div');
        card.className = 'playlist-card';
        const imgSrc = obj.cover || ((list[0] && list[0].al && list[0].al.picUrl) ? list[0].al.picUrl + '?param=80y80' : '/html/assets/play.svg');
        card.innerHTML = `
            <img src="${imgSrc}" loading="lazy">
            <div class="meta">
                <div class="name">${name}</div>
                <div class="count">${list.length} 首</div>
            </div>
            <button class="edit-playlist" title="编辑歌单" onclick="event.stopPropagation(); openPlaylistEditor('${name}')">编辑</button>
            <button class="delete-playlist" title="删除歌单" onclick="event.stopPropagation(); if(confirm('删除歌单【${name}】?')) { delete playlists['${name}']; savePlaylistsToStorage(); if(currentPlaylist==='${name}') { currentPlaylist=null; document.getElementById('kw').value=''; loadWelcomePage(); } }">x</button>
        `;
        card.onclick = () => loadPlaylist(name);
        container.appendChild(card);
    });
}

function openPlaylistPickerFromHTML(id, name, artistText, artistIds, albumName, albumId, albumPic) {
    // artistText: comma-separated names
    // artistIds: comma-separated ids (preferred)
    const names = (artistText || '').split(',').map(t => t.trim()).filter(Boolean);
    const ids = (artistIds || '').split(',').map(x => x.trim()).filter(Boolean);
    const ar = names.map((n, i) => ({ id: ids[i] ? Number(ids[i]) : (ids.length===1 && ids[0] && names.length===1 ? Number(ids[0]) : null), name: n }));
    const songObj = {
        id: id,
        name: name,
        ar: ar,
        al: { id: albumId || null, name: albumName || '', picUrl: albumPic || '' }
    };
    openPlaylistPicker(songObj);
}

function openPlaylistPicker(song) {
    const picker = document.getElementById('playlist-picker');
    picker.innerHTML = '';
    picker.style.display = 'block';
    picker.setAttribute('aria-hidden', 'false');

    const title = document.createElement('div'); title.className='title'; title.innerText = '添加到歌单';
    picker.appendChild(title);

    const listWrap = document.createElement('div'); listWrap.className = 'list';
    const keys = Object.keys(playlists);
    if (keys.length === 0) {
        const empty = document.createElement('div'); empty.className='row'; empty.innerText='暂无歌单，请新建'; listWrap.appendChild(empty);
    }
    keys.forEach(name => {
        const row = document.createElement('div'); row.className='row';
        const left = document.createElement('div'); left.style.display='flex'; left.style.gap='10px'; left.style.alignItems='center';
        const img = document.createElement('img'); img.src = (playlists[name].cover) ? playlists[name].cover : ((playlists[name].songs[0] && playlists[name].songs[0].al && playlists[name].songs[0].al.picUrl) ? playlists[name].songs[0].al.picUrl+'?param=60y60' : '/html/assets/play.svg'); img.style.width='44px'; img.style.height='44px'; img.style.borderRadius='6px'; img.loading='lazy';
        const meta = document.createElement('div'); meta.style.display='flex'; meta.style.flexDirection='column';
        const n = document.createElement('div'); n.innerText = name; n.style.fontWeight='600';
        const c = document.createElement('div'); c.innerText = `${playlists[name].songs.length} 首`; c.style.fontSize='12px'; c.style.color='var(--text-sub)';
        meta.appendChild(n); meta.appendChild(c);
        left.appendChild(img); left.appendChild(meta);
        row.appendChild(left);
        const btn = document.createElement('div'); btn.className='btn'; btn.innerText='添加'; btn.onclick = (e) => { e.stopPropagation(); addSongToPlaylist(name, song); closePlaylistPicker(); };
        row.appendChild(btn);
        row.onclick = () => { addSongToPlaylist(name, song); closePlaylistPicker(); };
        listWrap.appendChild(row);
    });
    picker.appendChild(listWrap);

    const actions = document.createElement('div'); actions.className='actions';
    const input = document.createElement('input'); input.className='new-input'; input.placeholder='新建歌单名称';
    const createBtn = document.createElement('button'); createBtn.className='btn'; createBtn.innerText='新建并添加';
    createBtn.onclick = () => {
        const val = input.value.trim();
        if (!val) { showToast('请输入歌单名', 'warn'); return; }
        if (!playlists[val]) playlists[val] = { songs: [], cover: '' };
        addSongToPlaylist(val, song);
        closePlaylistPicker();
    };
    const cancelBtn = document.createElement('button'); cancelBtn.className='btn'; cancelBtn.innerText='取消'; cancelBtn.onclick = closePlaylistPicker;
    actions.appendChild(input); actions.appendChild(createBtn); actions.appendChild(cancelBtn);
    picker.appendChild(actions);
}

function closePlaylistPicker() {
    const picker = document.getElementById('playlist-picker');
    picker.style.display = 'none';
    picker.setAttribute('aria-hidden', 'true');
    picker.innerHTML = '';
}

function addSongToPlaylist(listName, song) {
    if (!playlists[listName]) playlists[listName] = { songs: [], cover: '' };
    const found = playlists[listName].songs.some(s => s.id === song.id);
    if (found) { showToast('歌曲已存在于歌单', 'warn'); return; }
    playlists[listName].songs.push(song);
    savePlaylistsToStorage();
    showToast('已加入歌单：' + listName, 'success');
}

function removeSongFromPlaylist(listName, songId) {
    if (!playlists[listName]) return;
    playlists[listName].songs = playlists[listName].songs.filter(s => s.id !== songId);
    savePlaylistsToStorage();
    showToast('已从歌单移除', 'success');
    if (currentPlaylist === listName) loadPlaylist(listName);
}

function loadPlaylist(name) {
    currentPlaylist = name;
    if (kwInput) kwInput.value = '歌单: ' + name;
    if (paginationEl) paginationEl.style.display = 'none';
    if (playlistsEl) playlistsEl.style.display = 'none';
    const songs = playlists[name] ? playlists[name].songs : [];
    renderedList = songs;
    renderSongList(songs);
    // enable drag/reorder in playlist view
    enablePlaylistDrag();
}

async function loadWelcomePage() {
    const list = songList;
    const header = document.getElementById('info-header');
    if (header) header.style.display = 'none';
    list.innerHTML = '<div style="padding:20px; color:var(--text-sub);">正在加载说明文档...</div>';
    try {
        const res = await fetch('/README.md');
        if (!res.ok) throw new Error("无法获取");
        const markdown = await res.text();
        const content = (typeof marked !== 'undefined')
            ? marked.parse(markdown)
            : `<pre style="white-space:pre-wrap; font-family:inherit; margin:0;">${escapeHtml(markdown)}</pre>`;
        list.innerHTML = `<div class="readme-container" style="padding: 30px;">${content}</div>`;
    } catch (e) {
        list.innerHTML = '<div style="padding:40px; text-align:center;">加载README.md失败</div>';
    }

    // Always show playlists on the welcome page, even if README failed to render
    showPlaylists();
} 

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.key === 'Escape') { closePlaylistPicker(); }
});

// 点击空白关闭 picker + 处理 .icon-add 的后备点击
document.addEventListener('click', (e) => {
    const picker = document.getElementById('playlist-picker');
    if (picker && picker.style.display === 'block' && !picker.contains(e.target)) { closePlaylistPicker(); return; }

    const addEl = e.target.closest && e.target.closest('.icon-add');
    if (addEl && songList && songList.contains(addEl)) {
        e.stopPropagation();
        openPlaylistPickerFromHTML(Number(addEl.dataset.id), addEl.dataset.name||'', addEl.dataset.artist||'', addEl.dataset.artistIds||'', addEl.dataset.albumName||'', addEl.dataset.albumId||'', addEl.dataset.albumPic||'');
    }
});

// 布局检测：通过屏幕比例 & 宽度判断移动端（用于全屏播放器变为两页）
function isMobileLayout() {
    return (window.innerHeight / window.innerWidth) > 1.1 || window.innerWidth <= 820;
}

function updateFullPlayerMode() {
    const fp = document.getElementById('full-player');
    if (!fp) return;
    if (isMobileLayout()) fp.classList.add('mobile');
    else fp.classList.remove('mobile');
}

function updatePageIndicator() {
    const fc = document.querySelector('.full-content');
    const dots = document.querySelectorAll('#page-indicator .dot');
    if (!fc || dots.length === 0) return;
    const w = fc.clientWidth || window.innerWidth;
    const idx = Math.round((fc.scrollLeft || 0) / w);
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
}

function setupFullContentScroll() {
    const fc = document.querySelector('.full-content');
    if (!fc) return;
    let timer = null;
    // 在滚动停止时更新指示并吸附到最近一页
    fc.addEventListener('scroll', () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { updatePageIndicator(); snapToNearest(); }, 120);
    });

    // 触摸/指针抬起时强制吸附
    ['touchend', 'pointerup', 'mouseup'].forEach(evt => {
        fc.addEventListener(evt, () => { if (isMobileLayout()) snapToNearest(); });
    });

    // tap to switch pages on small screens (aria friendly)
    fc.addEventListener('click', (e) => {
        if (!isMobileLayout()) return;
        const w = fc.clientWidth;
        const idx = Math.round((fc.scrollLeft || 0) / w);
        const clickX = e.clientX - fc.getBoundingClientRect().left;
        if (clickX < w * 0.25 && idx > 0) fc.scrollTo({left: (idx -1) * w, behavior: 'smooth'});
        else if (clickX > w * 0.75) fc.scrollTo({left: (idx +1) * w, behavior: 'smooth'});
    });
}

function snapToNearest() {
    const fc = document.querySelector('.full-content');
    if (!fc) return;
    const w = fc.clientWidth || window.innerWidth;
    const idx = Math.round((fc.scrollLeft || 0) / w);
    fc.scrollTo({ left: idx * w, behavior: 'smooth' });
    // 确保指示器与位置一致
    setTimeout(updatePageIndicator, 160);
}

function toggleFullPlayer() {
    isFull = !isFull;
    const fp = document.getElementById('full-player');
    fp.classList.toggle('show', isFull);
    if (isFull && isMobileLayout()) {
        const fc = document.querySelector('.full-content');
        setTimeout(() => { if (fc) { fc.scrollTo({ left: 0, behavior: 'smooth' }); updatePageIndicator(); } }, 120);
    }
}

window.addEventListener('resize', updateFullPlayerMode);
window.addEventListener('DOMContentLoaded', () => {
    loadPlaylistsFromStorage();
    renderPlaylistsOverview();
    loadWelcomePage();
    updateFullPlayerMode();
    setupFullContentScroll();

    // Enter 键触发搜索（兼容现代浏览器）
    if (kwInput) {
        kwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(1); } });
    }
    // 搜索 / 清空 按钮绑定
    if (searchBtnEl) searchBtnEl.addEventListener('click', () => doSearch(1));
    if (clearBtnEl) clearBtnEl.addEventListener('click', () => { if (kwInput) { kwInput.value=''; loadWelcomePage(); kwInput.focus(); } });

    // song-list event delegation: 统一处理内部操作（播放 / 下载 / 加入 / 删除 / 歌手 / 专辑）
    if (songList) {
        songList.addEventListener('click', (e) => {
            const actionEl = e.target.closest('[data-action]');
            if (actionEl && songList.contains(actionEl)) {
                const action = actionEl.dataset.action;
                switch (action) {
                    case 'play': { const id=Number(actionEl.dataset.id); playSong(id, actionEl.dataset.name||'', actionEl.dataset.artist||''); return; }
                    case 'download': downloadSong(Number(actionEl.dataset.id), actionEl.dataset.name||''); return;
                    case 'add':
                        openPlaylistPickerFromHTML(Number(actionEl.dataset.id), actionEl.dataset.name||'', actionEl.dataset.artist||'', actionEl.dataset.artistIds||'', actionEl.dataset.albumName||'', actionEl.dataset.albumId||'', actionEl.dataset.albumPic||'');
                        return;
                    case 'remove': removeSongFromPlaylist(actionEl.dataset.playlist, Number(actionEl.dataset.id)); return;
                    case 'artist': doArtistSearch(Number(actionEl.dataset.artistId), actionEl.dataset.artistName||''); return;
                    case 'album': doAlbumSearch(actionEl.dataset.albumId, actionEl.dataset.albumName||'', actionEl.dataset.albumPic||''); return;
                }
            }
            // fallback: 点击行播放
            const item = e.target.closest('.song-item');
            if (!item) return;
            const idx = Number(item.dataset.index);
            if (!isNaN(idx)) playFromRenderedList(idx);
        });


    }

    // ensure play-mode button reflects current mode
    const pmBtn = document.getElementById('play-mode-btn');
    if (pmBtn) pmBtn.innerText = (playMode === 'sequential') ? '顺序' : (playMode === 'shuffle' ? '随机' : '单曲');
});
if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');

// 播放器：从当前渲染列表播放
function playFromRenderedList(index) {
    if (!renderedList || !renderedList[index]) return;
    playbackContext = renderedList;
    playbackIndex = index;
    const s = renderedList[index];
    playSong(s.id, s.name, (s.ar && s.ar.map) ? s.ar.map(a=>a.name).join(', ') : '');
}

// 播放结束处理
audio.onended = () => {
    if (playMode === 'repeat-one') { audio.currentTime = 0; audio.play(); return; }
    if (!playbackContext || playbackContext.length === 0) return;
    if (playMode === 'shuffle') {
        let next = Math.floor(Math.random() * playbackContext.length);
        if (playbackContext.length > 1) while (next === playbackIndex) next = Math.floor(Math.random() * playbackContext.length);
        playbackIndex = next;
        playFromRenderedList(playbackIndex);
        return;
    }
    // 顺序播放
    const nextIdx = playbackIndex + 1;
    if (nextIdx < playbackContext.length) {
        playbackIndex = nextIdx;
        playFromRenderedList(playbackIndex);
    }
};

function cyclePlayMode() {
    if (playMode === 'sequential') { playMode = 'shuffle'; document.getElementById('play-mode-btn').innerText='随机'; showToast('随机播放', 'success'); }
    else if (playMode === 'shuffle') { playMode = 'repeat-one'; document.getElementById('play-mode-btn').innerText='单曲'; showToast('单曲循环', 'success'); }
    else { playMode = 'sequential'; document.getElementById('play-mode-btn').innerText='顺序'; showToast('顺序播放', 'success'); }
}



// Drag & reorder for playlist
function enablePlaylistDrag() {
    const items = document.querySelectorAll('#song-list .song-item');
    items.forEach(item => {
        item.setAttribute('draggable', 'true');
        item.addEventListener('dragstart', (e) => {
            dragSrcIndex = Number(item.dataset.index);
            item.classList.add('dragging');
            try { e.dataTransfer.setData('text/plain', String(dragSrcIndex)); } catch (err) {}
        });
        item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('drag-over'); });
        item.addEventListener('dragleave', (e) => { item.classList.remove('drag-over'); });
        item.addEventListener('drop', (e) => {
            e.preventDefault(); item.classList.remove('drag-over');
            const dst = Number(item.dataset.index);
            if (dragSrcIndex === null || isNaN(dst) || dst === dragSrcIndex) return;
            reorderPlaylist(currentPlaylist, dragSrcIndex, dst);
        });
        item.addEventListener('dragend', () => {
            dragSrcIndex = null;
            document.querySelectorAll('#song-list .song-item').forEach(x=>x.classList.remove('dragging','drag-over'));
        });
    });
}

function reorderPlaylist(name, src, dst) {
    if (!playlists[name]) return;
    const arr = playlists[name].songs;
    if (src < 0 || src >= arr.length || dst < 0 || dst > arr.length) return;
    const [moved] = arr.splice(src, 1);
    arr.splice(dst, 0, moved);
    savePlaylistsToStorage();
    showToast('已重新排序', 'success');
    // re-render playlist view and keep showing current playlist
    if (currentPlaylist === name) loadPlaylist(name);
}

// 编辑歌单（重命名 / 封面选择）
function openPlaylistEditor(name) {
    const editor = document.createElement('div'); editor.className='playlist-editor';
    const obj = playlists[name];
    editor.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-weight:700">编辑歌单</div>
            <div style="display:flex; gap:8px;"><button class="btn" id="save-playlist-btn">保存</button><button class="btn" id="cancel-playlist-btn">取消</button></div>
        </div>
        <div style="margin-top:10px; display:flex; gap:8px; align-items:center;">
            <input id="playlist-new-name" class="new-input" value="${name}">
            <button class="btn" id="del-playlist-btn">删除歌单</button>
        </div>
        <div style="margin-top:8px; font-size:13px; color:var(--text-sub);">选择封面（从歌单歌曲中选择）</div>
        <div class="thumbs" id="playlist-thumbs"></div>
    `;
    document.body.appendChild(editor);
    const thumbs = editor.querySelector('#playlist-thumbs');
    const songs = obj.songs || [];
    songs.forEach((s, i) => {
        const img = document.createElement('img'); img.src = s.al && s.al.picUrl ? s.al.picUrl + '?param=80y80' : '/html/assets/play.svg';
        img.onclick = () => { document.querySelectorAll('.playlist-editor .thumbs img').forEach(x=>x.classList.remove('selected')); img.classList.add('selected'); };
        thumbs.appendChild(img);
        if ((obj.cover && obj.cover === img.src) || (!obj.cover && i===0)) img.classList.add('selected');
    });

    editor.querySelector('#save-playlist-btn').onclick = () => {
        const newName = editor.querySelector('#playlist-new-name').value.trim();
        if (!newName) { showToast('歌单名不能为空', 'warn'); return; }
        if (newName !== name) {
            playlists[newName] = playlists[name];
            delete playlists[name];
        }
        const sel = editor.querySelector('.playlist-editor .thumbs img.selected');
        if (sel) playlists[newName].cover = sel.src;
        savePlaylistsToStorage();
        document.body.removeChild(editor);
        showToast('已保存歌单设置', 'success');
        renderPlaylistsOverview();
    };
    editor.querySelector('#cancel-playlist-btn').onclick = () => { document.body.removeChild(editor); };
    editor.querySelector('#del-playlist-btn').onclick = () => {
        if (!confirm('删除歌单 '+name+'?')) return;
        delete playlists[name]; savePlaylistsToStorage(); document.body.removeChild(editor); showToast('歌单已删除', 'success');
    };
}

// ensure playlists only visible on welcome
function hidePlaylists() { if (playlistsEl) playlistsEl.style.display = 'none'; }
function showPlaylists() { if (playlistsEl) renderPlaylistsOverview(); }

// doSearch handles hiding playlists directly (previous wrapper removed)
