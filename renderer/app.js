// YouTube Player API
let player;
let playerReady = false;
let isPlaying = false;
let currentSong = null;
let favorites = [];
let playlists = [];

// Initialize
async function init() {
    console.log("App initializing...");
    favorites = await window.api.getStore('favorites') || [];
    playlists = await window.api.getStore('playlists') || [];
    renderPlaylists();

    // Load YouTube API
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    console.log("YouTube API script injected.");
}

window.onYouTubeIframeAPIReady = function () {
    console.log("YouTube API Ready. Initializing player...");
    player = new YT.Player('youtube-player-container', {
        host: 'https://www.youtube.com',
        height: '200',
        width: '200',
        videoId: '',
        playerVars: {
            'autoplay': 0,
            'controls': 0,
            'disablekb': 1,
            'modestbranding': 1,
            'origin': 'app://localhost'
        },
        events: {
            'onStateChange': (e) => {
                console.log("Player state changed:", e.data);
                onPlayerStateChange(e);
            },
            'onReady': onPlayerReady,
            'onError': (e) => console.error("YouTube Player Error:", e.data)
        }
    });

    // Fallback: If onReady doesn't fire in 3 seconds, force it (sometimes events are blocked)
    setTimeout(() => {
        if (!playerReady) {
            console.log("Forcing player ready state (fallback)...");
            playerReady = true;
        }
    }, 3000);
};

function onPlayerReady(event) {
    console.log("Player object fully ready.");
    playerReady = true;
    updateProgressBar();
}

function onPlayerStateChange(event) {
    if (event.data == YT.PlayerState.PLAYING) {
        isPlaying = true;
        updateUI();
    } else if (event.data == YT.PlayerState.PAUSED || event.data == YT.PlayerState.ENDED) {
        isPlaying = false;
        updateUI();
    }
}

// Navigation
const navItems = {
    'nav-home': 'home-view',
    'nav-search': 'search-view',
    'nav-library': 'library-view'
};

Object.keys(navItems).forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
        showView(navItems[id]);
        document.querySelectorAll('nav li').forEach(li => li.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    });
});

function showView(viewId) {
    ['home-view', 'search-view', 'library-view'].forEach(id => {
        document.getElementById(id).style.display = (id === viewId) ? 'block' : 'none';
    });
    if (viewId === 'library-view') renderFavorites();
}

// Search
const searchInput = document.getElementById('search-input');
searchInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const query = searchInput.value;
        if (!query) return;

        showView('search-view');
        document.getElementById('search-results').innerHTML = '<div style="padding: 20px;">Searching...</div>';

        const results = await window.api.searchYouTube(query);
        if (results.error) {
            document.getElementById('search-results').innerHTML = `<div style="padding: 20px; color: red;">Error: ${results.error}</div>`;
            return;
        }

        renderResults(results, 'search-results');
    }
});

function renderResults(songs, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    songs.forEach(song => {
        const card = document.createElement('div');
        card.className = 'song-card';
        card.innerHTML = `
            <div class="thumbnail-container">
                <img src="${song.thumbnail}" alt="${song.title}">
                <div class="play-btn-overlay">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </div>
            </div>
            <div class="song-title">${song.title}</div>
            <div class="song-artist">${song.artist}</div>
            <div class="song-duration">${song.duration}</div>
        `;

        card.addEventListener('click', () => playSong(song));
        container.appendChild(card);
    });
}

function playSong(song) {
    console.log("Attempting to play song:", song.title, "ID:", song.id);
    if (!playerReady) {
        console.warn("Play attempted but player not ready.");
        // alert("Player is still loading, please wait a moment...");
        return;
    }
    currentSong = song;
    player.loadVideoById(song.id);
    player.playVideo();
    console.log("Player commands sent.");

    document.getElementById('player-thumb').src = song.thumbnail;
    document.getElementById('player-title').textContent = song.title;
    document.getElementById('player-artist').textContent = song.artist;
    document.getElementById('total-duration').textContent = song.duration;

    updateFavoriteIcon();
}

// Player Controls
const playPauseBtn = document.getElementById('play-pause-btn');
playPauseBtn.addEventListener('click', () => {
    if (!playerReady) return;
    if (isPlaying) {
        player.pauseVideo();
    } else {
        player.playVideo();
    }
});

function updateUI() {
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');

    if (isPlaying) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
    } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
    }
}

// Progress Bar
function updateProgressBar() {
    setInterval(() => {
        if (player && player.getCurrentTime) {
            const current = player.getCurrentTime();
            const total = player.getDuration();
            const pct = (current / total) * 100;

            document.getElementById('seek-fill').style.width = `${pct}%`;
            document.getElementById('current-time').textContent = formatTime(current);
        }
    }, 1000);
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

const seekBar = document.getElementById('seek-bar');
seekBar.addEventListener('click', (e) => {
    const rect = seekBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const time = player.getDuration() * pct;
    player.seekTo(time, true);
});

// Volume
const volumeBar = document.getElementById('volume-bar');
volumeBar.addEventListener('click', (e) => {
    const rect = volumeBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    player.setVolume(pct * 100);
    document.getElementById('volume-fill').style.width = `${pct * 100}%`;
});

// Favorites
const favoriteBtn = document.getElementById('favorite-toggle');
favoriteBtn.addEventListener('click', async () => {
    if (!currentSong) return;

    const index = favorites.findIndex(s => s.id === currentSong.id);
    if (index === -1) {
        favorites.push(currentSong);
    } else {
        favorites.splice(index, 1);
    }

    await window.api.setStore('favorites', favorites);
    updateFavoriteIcon();
});

function updateFavoriteIcon() {
    const isFav = currentSong && favorites.some(s => s.id === currentSong.id);
    favoriteBtn.querySelector('svg').style.fill = isFav ? 'var(--accent-color)' : 'none';
    favoriteBtn.querySelector('svg').style.stroke = isFav ? 'var(--accent-color)' : 'currentColor';
}

function renderFavorites() {
    renderResults(favorites, 'favorites-grid');
}

// Playlists
document.getElementById('create-playlist').addEventListener('click', async () => {
    const name = prompt('Enter playlist name:');
    if (name) {
        playlists.push({ name, songs: [] });
        await window.api.setStore('playlists', playlists);
        renderPlaylists();
    }
});

function renderPlaylists() {
    const list = document.getElementById('playlists-list');
    list.innerHTML = '';
    playlists.forEach((pl, index) => {
        const li = document.createElement('li');
        li.textContent = pl.name;
        li.style.fontSize = '14px';
        li.addEventListener('click', () => {
            // Show playlist view (could be implemented as a separate view)
            alert(`Playlist: ${pl.name} (${pl.songs.length} songs)`);
        });
        list.appendChild(li);
    });
}

init();
