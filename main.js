const { useState, useEffect, useRef, useCallback, useMemo } = React;

const YT_KEY = 'AIzaSyDwP6t6l9_7PUxswPTmPWvnc_fhMg_YRd0';

const S = {
    getUser: () => JSON.parse(localStorage.getItem('freely_user') || 'null'),
    setUser: u => localStorage.setItem('freely_user', JSON.stringify(u)),
    clearUser: () => localStorage.removeItem('freely_user'),
    getHist: e => JSON.parse(localStorage.getItem('f_h_' + e) || '[]'),
    addHist: (e, s) => {
        let h = S.getHist(e).filter(x => x.id !== s.id);
        h = [s, ...h].slice(0, 20);
        localStorage.setItem('f_h_' + e, JSON.stringify(h));
        return h;
    },
    getLiked: e => JSON.parse(localStorage.getItem('f_l_' + e) || '[]'),
    toggleLike: (e, s) => {
        let l = S.getLiked(e);
        const ex = l.find(x => x.id === s.id);
        l = ex ? l.filter(x => x.id !== s.id) : [s, ...l];
        localStorage.setItem('f_l_' + e, JSON.stringify(l));
        return l;
    }
};

async function ytSearch(query) {
    try {
        const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=20&q=${encodeURIComponent(query)}&key=${YT_KEY}`);
        const d = await r.json();
        if (!d.items) return [];
        const ids = d.items.map(i => i.id.videoId).join(',');
        const dr = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${ids}&key=${YT_KEY}`);
        const dd = await dr.json();
        return dd.items.map(i => ({
            id: i.id,
            title: i.snippet.title.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
            artist: i.snippet.channelTitle,
            duration: parseYTDuration(i.contentDetails.duration),
            thumbnail: i.snippet.thumbnails.high?.url || i.snippet.thumbnails.medium?.url,
        }));
    } catch (e) { console.error(e); return []; }
}

function parseYTDuration(d) {
    const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return "3:30";
    const hrs = parseInt(m[1] || 0), mins = parseInt(m[2] || 0), secs = parseInt(m[3] || 0);
    if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

function fmtTime(s) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const rs = Math.floor(s % 60);
    return `${m}:${String(rs).padStart(2, '0')}`;
}

// --- COMPONENTS ---

function Visualizer({ active }) {
    const [bars, setBars] = useState(Array(15).fill(10));
    const timerRef = useRef();

    useEffect(() => {
        if (active) {
            timerRef.current = setInterval(() => {
                setBars(bars.map(() => Math.random() * 80 + 20));
            }, 100);
        } else {
            setBars(Array(15).fill(10));
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [active]);

    return React.createElement('div', { className: 'flex items-end justify-center gap-3 h-32 w-full visualizer-brush' },
        bars.map((h, i) => React.createElement('div', {
            key: i,
            className: 'brush-stroke',
            style: { 
                height: `${h}%`, 
                backgroundColor: i % 2 === 0 ? 'var(--terracotta)' : 'var(--brass)',
                opacity: 0.4 + (h / 200)
            }
        }))
    );
}

function AuthScreen({ onLogin }) {
    return React.createElement('div', { className: 'h-screen flex flex-col items-center justify-center p-10 bg-linen relative overflow-hidden' },
        React.createElement('div', { className: 'fixed inset-0 linen-texture opacity-20' }),
        React.createElement('div', { className: 'text-center z-10' },
            React.createElement('h1', { className: 'text-8xl font-serif font-black mb-4 text-espresso' }, 'Freely'),
            React.createElement('div', { className: 'double-rule w-48 mx-auto' }),
            React.createElement('p', { className: 'font-condensed tracking-widest text-brass mb-12 uppercase' }, 'Handcrafted Sound Experience'),
            React.createElement('button', {
                onClick: () => { S.setUser({ name: 'Listener', email: 'user@linen.com' }); onLogin() },
                className: 'ecru-card px-12 py-5 font-serif text-xl border-2 border-brass/30 hover:border-terracotta transition-colors bg-ecru text-espresso shadow-lg active:scale-95'
            }, 'Open the Journal')
        )
    );
}

function MainLayout({ user, onLogout }) {
    const [view, setView] = useState('home'); // home, search, library, player
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [queue, setQueue] = useState([]);
    const [qIdx, setQIdx] = useState(-1);
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(80);
    const [isReady, setIsReady] = useState(false);
    const [liked, setLiked] = useState(S.getLiked(user.email));
    const [history, setHistory] = useState(S.getHist(user.email));

    const playerRef = useRef(null);
    const current = queue[qIdx] || null;

    const playSong = useCallback((songs, idx) => {
        if (!songs || idx < 0 || idx >= songs.length) return;
        const s = songs[idx];
        setQueue(songs);
        setQIdx(idx);
        if (isReady && playerRef.current?.loadVideoById) {
            playerRef.current.loadVideoById({ videoId: s.id, startSeconds: 0 });
            playerRef.current.playVideo();
        }
        setHistory(S.addHist(user.email, s));
    }, [isReady, user.email]);

    useEffect(() => {
        if (!window.YT) {
            const tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            document.body.appendChild(tag);
        }
        window.onYouTubeIframeAPIReady = () => {
            playerRef.current = new YT.Player('yt-placeholder', {
                height: '0', width: '0',
                playerVars: { 'autoplay': 0, 'controls': 0, 'modestbranding': 1, 'enablejsapi': 1, 'origin': window.location.origin },
                events: {
                    'onReady': (e) => { e.target.setVolume(volume); setIsReady(true); },
                    'onStateChange': (e) => {
                        if (e.data === YT.PlayerState.PLAYING) setPlaying(true);
                        if (e.data === YT.PlayerState.PAUSED) setPlaying(false);
                        if (e.data === YT.PlayerState.ENDED) {
                            if (qIdx < queue.length - 1) playSong(queue, qIdx + 1);
                        }
                    }
                }
            });
        };
    }, [queue, qIdx, playSong, volume]);

    useEffect(() => {
        let iv;
        if (playing) {
            iv = setInterval(() => {
                if (playerRef.current?.getCurrentTime) {
                    setProgress(playerRef.current.getCurrentTime());
                    setDuration(playerRef.current.getDuration());
                }
            }, 500);
        }
        return () => clearInterval(iv);
    }, [playing]);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setLoading(true);
        setView('search');
        const res = await ytSearch(query);
        setResults(res);
        setLoading(false);
    };

    const renderEmpty = () => React.createElement('div', { className: 'flex flex-col items-center justify-center py-20 px-10 text-center opacity-60' },
        React.createElement('div', { className: 'relative mb-8' },
            React.createElement('svg', { width: '120', height: '120', viewBox: '0 0 120 120' },
                React.createElement('rect', { x: '10', y: '10', width: '100', height: '100', fill: 'none', stroke: 'var(--brass)', strokeWidth: '2' }),
                React.createElement('circle', { cx: '60', cy: '60', r: '40', fill: 'none', stroke: 'var(--brass)', strokeWidth: '1' }),
                React.createElement('path', { d: 'M60 20 L60 40 M100 60 L80 60 M60 100 L60 80 M20 60 L40 60', stroke: 'var(--brass)', strokeWidth: '1' })
            ),
            React.createElement('div', { className: 'absolute bottom-0 right-0 transform translate-x-4 translate-y-4' },
                 React.createElement('span', { className: 'text-4xl' }, '📍')
            )
        ),
        React.createElement('p', { className: 'font-serif italic text-2xl text-espresso' }, '"Nothing playing. Pick a record."')
    );

    const renderTrackList = (tracks, title) => React.createElement('div', { className: 'p-6 space-y-4' },
        React.createElement('h2', { className: 'text-4xl font-serif font-black mb-8 text-espresso' }, title),
        tracks.map((s, i) => React.createElement('div', {
            key: s.id + i,
            onClick: () => playSong(tracks, i),
            className: `track-row ${current?.id === s.id ? 'active' : ''} group cursor-pointer`
        },
            React.createElement('span', { className: 'text-3xl font-serif text-linen/60 mr-6 w-8 text-right' }, i + 1),
            React.createElement('img', { src: s.thumbnail, className: 'w-14 h-14 object-cover border border-brass/20 mr-4' }),
            React.createElement('div', { className: 'flex-1 min-w-0' },
                React.createElement('p', { className: 'font-serif text-lg text-espresso truncate group-hover:text-terracotta transition-colors' }, s.title),
                React.createElement('p', { className: 'text-sage text-xs uppercase tracking-widest' }, s.artist)
            ),
            current?.id === s.id && React.createElement('span', { className: 'text-terracotta mr-4 animate-spin-slow' }, '◎'),
            React.createElement('span', { className: 'font-mono text-xs text-brass' }, s.duration)
        ))
    );

    const renderHome = () => React.createElement('div', { className: 'pb-40' },
        React.createElement('div', { className: 'p-6 bg-ecru/50 border-b border-brass/10' },
             React.createElement('div', { className: 'flex items-center gap-4 border-b-2 border-brass/20 pb-2 focus-within:border-terracotta transition-colors' },
                React.createElement('span', { className: 'text-brass text-xl' }, '⚲'),
                React.createElement('input', {
                    className: 'flex-1 bg-transparent border-none text-espresso outline-none font-serif text-xl placeholder:text-brass/40',
                    placeholder: 'Seek your frequency...',
                    value: query,
                    onChange: e => setQuery(e.target.value),
                    onKeyDown: e => e.key === 'Enter' && handleSearch()
                })
             )
        ),
        
        React.createElement('div', { className: 'p-6 space-y-12' },
            history.length > 0 && React.createElement('section', null,
                React.createElement('h3', { className: 'font-condensed text-xs tracking-[0.3em] uppercase text-brass mb-6' }, 'Recently Flipped'),
                React.createElement('div', { className: 'flex gap-8 overflow-x-auto pb-6 no-scrollbar' },
                    history.map((s, i) => React.createElement('div', {
                        key: s.id + i,
                        onClick: () => playSong(history, i),
                        className: 'flex-shrink-0 w-44'
                    },
                        React.createElement('div', { className: 'polaroid-frame mb-4 active:scale-95 transition-transform' },
                            React.createElement('div', { className: 'inner-rule' },
                                React.createElement('img', { src: s.thumbnail, className: 'w-full aspect-square object-cover' })
                            )
                        ),
                        React.createElement('p', { className: 'font-serif text-sm text-espresso truncate' }, s.title),
                        React.createElement('p', { className: 'text-sage text-[10px] uppercase tracking-wider' }, s.artist)
                    ))
                )
            ),

            React.createElement('section', null,
                React.createElement('h3', { className: 'font-condensed text-xs tracking-[0.3em] uppercase text-brass mb-6' }, 'Curated Collections'),
                React.createElement('div', { className: 'grid grid-cols-2 gap-4' },
                    ['Late Night Jazz', 'Woven Lo-fi', 'Terracotta Folk', 'Deep Linen Ambient'].map(m => React.createElement('button', {
                        key: m,
                        onClick: () => { setQuery(m); handleSearch(); },
                        className: 'bg-ecru p-8 text-left border border-brass/10 hover:border-terracotta/40 transition-all active:bg-linen/50'
                    }, 
                        React.createElement('p', { className: 'font-serif text-espresso' }, m),
                        React.createElement('p', { className: 'text-[10px] text-brass uppercase mt-2' }, 'Collection №' + Math.floor(Math.random()*100))
                    ))
                )
            )
        )
    );

    const renderPlayer = () => React.createElement('div', { className: 'fixed inset-0 bg-linen z-50 flex flex-col overflow-y-auto no-scrollbar' },
        React.createElement('div', { className: 'fixed inset-0 linen-texture opacity-20' }),
        
        // Header
        React.createElement('header', { className: 'flex justify-between items-center p-8 z-10' },
            React.createElement('button', { onClick: () => setView('home'), className: 'text-espresso text-3xl' }, '↓'),
            React.createElement('p', { className: 'font-condensed tracking-widest text-brass text-xs uppercase' }, 'Now Spinning'),
            React.createElement('button', { onClick: () => setLiked(S.toggleLike(user.email, current)), className: `text-2xl ${liked.find(x => x.id === current?.id) ? 'text-terracotta' : 'text-brass/40'}` }, '♥')
        ),

        // Album Art
        React.createElement('div', { className: 'flex-1 flex flex-col items-center justify-center px-10 py-4 z-10' },
            React.createElement('div', { className: `polaroid-frame w-full max-w-xs ${playing ? 'playing' : ''}` },
                React.createElement('div', { className: 'inner-rule' },
                    React.createElement('img', { src: current?.thumbnail, className: 'w-full aspect-square object-cover' })
                )
            ),
            
            // Text Info
            React.createElement('div', { className: 'w-full text-center mt-12' },
                React.createElement('h2', { className: 'font-serif text-4xl font-black text-espresso mb-2' }, current?.title),
                React.createElement('p', { className: 'text-sage text-lg font-condensed tracking-widest uppercase mb-4' }, current?.artist),
                React.createElement('p', { className: 'text-brass italic text-sm' }, 'The Linen Sessions • 2026'),
                React.createElement('div', { className: 'double-rule max-w-[200px] mx-auto' })
            ),

            // Visualizer
            React.createElement(Visualizer, { active: playing }),

            // Progress
            React.createElement('div', { className: 'w-full space-y-6 mt-8' },
                React.createElement('div', { className: 'flex justify-between font-mono text-[10px] text-brass' },
                    React.createElement('span', null, fmtTime(progress)),
                    React.createElement('span', null, fmtTime(duration))
                ),
                React.createElement('div', {
                    className: 'tailor-ruler',
                    onClick: (e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const p = (e.clientX - rect.left) / rect.width;
                        if (playerRef.current) playerRef.current.seekTo(p * duration);
                    }
                },
                    React.createElement('div', { className: 'tailor-ruler-fill', style: { width: `${(progress / duration) * 100}%` } }),
                    React.createElement('div', { className: 'tailor-ruler-thumb', style: { left: `${(progress / duration) * 100}%` } })
                )
            ),

            // Controls
            React.createElement('div', { className: 'w-full flex items-center justify-between mt-12 mb-8' },
                React.createElement('button', { className: 'text-brass text-2xl' }, '⥮'),
                React.createElement('div', { className: 'flex items-center gap-10' },
                    React.createElement('button', { onClick: () => playSong(queue, (qIdx - 1 + queue.length) % queue.length), className: 'text-brass text-4xl' }, '⇠'),
                    React.createElement('button', {
                        onClick: () => {
                            if (!playerRef.current || !isReady) return;
                            playing ? playerRef.current.pauseVideo() : playerRef.current.playVideo();
                        },
                        className: 'leather-medallion'
                    }, 
                        React.createElement('div', { className: 'leather-medallion-inner' },
                            React.createElement('span', { className: 'text-white text-3xl' }, playing ? '⏸' : '▶')
                        )
                    ),
                    React.createElement('button', { onClick: () => playSong(queue, (qIdx + 1) % queue.length), className: 'text-brass text-4xl' }, '⇢')
                ),
                React.createElement('button', { className: 'text-brass text-2xl' }, '↺')
            ),

            // Volume
            React.createElement('div', { className: 'w-full flex items-center gap-6 mt-4' },
                React.createElement('span', { className: 'text-brass' }, '🔈'),
                React.createElement('div', { className: 'flex-1 volume-fader-track' },
                    React.createElement('div', { className: 'volume-fader-rail', style: { left: '0' } }),
                    React.createElement('div', { className: 'volume-fader-rail', style: { left: '20%' } }),
                    React.createElement('div', { className: 'volume-fader-rail', style: { left: '40%' } }),
                    React.createElement('div', { className: 'volume-fader-rail', style: { left: '60%' } }),
                    React.createElement('div', { className: 'volume-fader-rail', style: { left: '80%' } }),
                    React.createElement('div', { className: 'volume-fader-rail', style: { left: '100%' } }),
                    React.createElement('div', { 
                        className: 'volume-fader-knob', 
                        style: { left: `${volume}%` },
                        onMouseDown: (e) => {
                             // Simple volume drag logic could go here
                        }
                    })
                )
            )
        )
    );

    return React.createElement('div', { className: 'h-screen flex flex-col bg-linen relative overflow-hidden' },
        React.createElement('main', { className: 'flex-1 overflow-y-auto no-scrollbar' },
            view === 'home' && renderHome(),
            view === 'search' && renderTrackList(results, 'Discovered'),
            view === 'library' && renderTrackList(liked, 'Journal'),
            view === 'player' && renderPlayer()
        ),

        // Mini Player
        current && view !== 'player' && React.createElement('div', {
            onClick: () => setView('player'),
            className: 'fixed bottom-24 left-6 right-6 bg-ecru border border-brass/30 p-3 shadow-xl z-40 flex items-center gap-4 cursor-pointer hover:bg-white/50 transition-colors'
        },
            React.createElement('img', { src: current.thumbnail, className: 'w-12 h-12 border border-brass/20' }),
            React.createElement('div', { className: 'flex-1 min-w-0' },
                React.createElement('p', { className: 'font-serif text-espresso truncate' }, current.title),
                React.createElement('p', { className: 'text-sage text-[10px] uppercase tracking-widest' }, current.artist)
            ),
            React.createElement('button', {
                onClick: (e) => { 
                    e.stopPropagation(); 
                    if (!playerRef.current || !isReady) return;
                    playing ? playerRef.current.pauseVideo() : playerRef.current.playVideo();
                },
                className: 'text-terracotta text-2xl pr-2'
            }, playing ? '⏸' : '▶')
        ),

        // Nav Bar
        React.createElement('nav', { className: 'fixed bottom-0 left-0 right-0 h-20 bg-linen border-t border-brass/10 flex z-50' },
            React.createElement('button', { onClick: () => setView('home'), className: `nav-item ${view === 'home' ? 'active' : ''}` },
                React.createElement('span', { className: 'text-2xl' }, '☖'),
                React.createElement('span', { className: 'font-condensed text-[10px] uppercase tracking-tighter' }, 'Studio'),
                view === 'home' && React.createElement('div', { className: 'nav-stitch' })
            ),
            React.createElement('button', { onClick: () => setView('library'), className: `nav-item ${view === 'library' ? 'active' : ''}` },
                React.createElement('span', { className: 'text-2xl' }, '☰'),
                React.createElement('span', { className: 'font-condensed text-[10px] uppercase tracking-tighter' }, 'Journal'),
                view === 'library' && React.createElement('div', { className: 'nav-stitch' })
            ),
            React.createElement('button', { onClick: () => onLogout(), className: 'nav-item' },
                React.createElement('span', { className: 'text-2xl' }, '⌬'),
                React.createElement('span', { className: 'font-condensed text-[10px] uppercase tracking-tighter' }, 'Exit')
            )
        ),

        React.createElement('div', { style: { position: 'absolute', top: '-1000px' } },
            React.createElement('div', { id: 'yt-placeholder' })
        )
    );
}

function App() {
    const [user, setUser] = useState(S.getUser());
    if (!user) return React.createElement(AuthScreen, { onLogin: () => setUser(S.getUser()) });
    return React.createElement(MainLayout, { user, onLogout: () => { S.clearUser(); setUser(null) } });
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
