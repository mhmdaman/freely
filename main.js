const { useState, useEffect, useRef, useCallback, useMemo } = React;

const YT_KEY = 'AIzaSyDwP6t6l9_7PUxswPTmPWvnc_fhMg_YRd0';

const S = {
    getUser: () => JSON.parse(localStorage.getItem('res_user') || 'null'),
    setUser: u => localStorage.setItem('res_user', JSON.stringify(u)),
    clearUser: () => localStorage.removeItem('res_user'),
    getHist: e => JSON.parse(localStorage.getItem('res_h_' + e) || '[]'),
    addHist: (e, s) => {
        let h = S.getHist(e).filter(x => x.id !== s.id);
        h = [s, ...h].slice(0, 20);
        localStorage.setItem('res_h_' + e, JSON.stringify(h));
        return h;
    },
    clearHist: e => { localStorage.removeItem('res_h_' + e); return []; },
    getLiked: e => JSON.parse(localStorage.getItem('res_l_' + e) || '[]'),
    toggleLike: (e, s) => {
        let l = S.getLiked(e);
        const ex = l.find(x => x.id === s.id);
        l = ex ? l.filter(x => x.id !== s.id) : [s, ...l];
        localStorage.setItem('res_l_' + e, JSON.stringify(l));
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
        return dd.items.map(i => {
            const title = i.snippet.title.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
            return {
                id: i.id,
                title: title,
                artist: i.snippet.channelTitle,
                duration: parseYTDuration(i.contentDetails.duration),
                thumbnail: i.snippet.thumbnails.high?.url || i.snippet.thumbnails.medium?.url,
                genre: i.snippet.categoryId === '10' ? 'Music' : 'Video'
            };
        });
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

function RippleEffect({ x, y, onEnd }) {
    useEffect(() => {
        const timer = setTimeout(onEnd, 600);
        return () => clearTimeout(timer);
    }, [onEnd]);

    return React.createElement('div', {
        className: 'ripple',
        style: { left: x, top: y }
    });
}

function Visualizer({ active }) {
    const [bars, setBars] = useState(Array(30).fill(10));
    const timerRef = useRef();

    useEffect(() => {
        if (active) {
            timerRef.current = setInterval(() => {
                setBars(bars.map(() => Math.random() * 70 + 10));
            }, 80);
        } else {
            setBars(Array(30).fill(2));
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [active]);

    return React.createElement('div', { className: 'relative w-full h-24 overflow-hidden' },
        // Main Visualizer
        React.createElement('div', { className: 'visualizer w-full h-full flex items-end gap-[2px] px-2' },
            bars.map((h, i) => React.createElement('div', {
                key: i,
                className: 'v-bar flex-1',
                style: { height: `${h}%`, transition: 'height 0.08s ease-out' }
            }))
        ),
        // Reflection
        React.createElement('div', { className: 'visualizer w-full h-full flex items-end gap-[2px] px-2 absolute top-full left-0 opacity-20 blur-[1px] transform scale-y-[-1]' },
            bars.map((h, i) => React.createElement('div', {
                key: i,
                className: 'v-bar flex-1',
                style: { height: `${h}%`, transition: 'height 0.08s ease-out' }
            }))
        )
    );
}

function AuthScreen({ onLogin }) {
    return React.createElement('div', { className: 'h-screen flex flex-col items-center justify-center p-10 bg-oled' },
        React.createElement('div', { className: 'art-glow' }),
        React.createElement('h1', { className: 'text-7xl mb-2 z-10' }, 'RESONANCE'),
        React.createElement('p', { className: 'artist-name text-purple mb-12 z-10' }, 'AMOLED EDITION'),
        React.createElement('button', {
            onClick: () => { S.setUser({ name: 'USER', email: 'oled@black' }); onLogin() },
            className: 'amoled-card text-white font-bold px-12 py-4 hover:scale-105 transition-transform z-10 border border-purple/30'
        }, 'INITIALIZE LINK')
    );
}

function MainLayout({ user, onLogout }) {
    const [view, setView] = useState('home'); // home, search, library, settings
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [queue, setQueue] = useState([]);
    const [qIdx, setQIdx] = useState(-1);
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(80);
    const [ripples, setRipples] = useState([]);
    const [isReady, setIsReady] = useState(false);
    const [liked, setLiked] = useState(S.getLiked(user.email));
    const [history, setHistory] = useState(S.getHist(user.email));

    const playerRef = useRef(null);
    const current = queue[qIdx] || null;

    // RIPPLE HANDLER
    const addRipple = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const id = Date.now();
        setRipples(prev => [...prev, { id, x, y }]);
    };

    const removeRipple = (id) => {
        setRipples(prev => prev.filter(r => r.id !== id));
    };

    // PLAYER LOGIC
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

    // SWIPE LOGIC
    const touchStart = useRef(0);
    const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
    const handleTouchEnd = (e) => {
        const delta = e.changedTouches[0].clientX - touchStart.current;
        if (Math.abs(delta) > 100) {
            if (delta > 0) playSong(queue, (qIdx - 1 + queue.length) % queue.length); // Swipe Right -> Prev
            else playSong(queue, (qIdx + 1) % queue.length); // Swipe Left -> Next
        }
    };

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

    // VIEWS
    const renderHome = () => React.createElement('div', { className: 'p-6 space-y-8 pb-40' },
        React.createElement('header', { className: 'flex justify-between items-center' },
            React.createElement('h2', { className: 'text-3xl' }, 'DISCOVER'),
            React.createElement('div', { className: 'flex items-center gap-2' },
                React.createElement('div', { className: `w-2 h-2 rounded-full ${isReady ? 'bg-cyan' : 'bg-pink animate-pulse'}` }),
                React.createElement('span', { className: 'mono text-[10px] text-dim' }, isReady ? 'ONLINE' : 'SYNCING')
            )
        ),
        React.createElement('div', { className: 'relative' },
            React.createElement('input', {
                className: 'w-full bg-charcoal border-none rounded-2xl px-6 py-4 text-white outline-none focus:ring-1 ring-purple/50 transition-all',
                placeholder: 'Search for frequency...',
                value: query,
                onChange: e => setQuery(e.target.value),
                onKeyDown: e => e.key === 'Enter' && handleSearch()
            })
        ),
        history.length > 0 && React.createElement('section', null,
            React.createElement('h3', { className: 'text-dim mono text-xs mb-4' }, 'RECENT_LOGS'),
            React.createElement('div', { className: 'flex gap-4 overflow-x-auto pb-4 no-scrollbar' },
                history.map((s, i) => React.createElement('div', {
                    key: s.id + i,
                    onClick: () => playSong(history, i),
                    className: 'amoled-card w-40 flex-shrink-0 space-y-3 active:scale-95 transition-transform'
                },
                    React.createElement('img', { src: s.thumbnail, className: 'w-full aspect-square object-cover rounded-lg' }),
                    React.createElement('div', { className: 'space-y-1' },
                        React.createElement('p', { className: 'text-sm font-bold truncate' }, s.title),
                        React.createElement('p', { className: 'artist-name text-[10px] text-dim' }, s.artist)
                    )
                ))
            )
        ),
        React.createElement('section', null,
            React.createElement('h3', { className: 'text-dim mono text-xs mb-4' }, 'QUICK_ACCESS'),
            React.createElement('div', { className: 'grid grid-cols-2 gap-4' },
                ['CHILL', 'HYPE', 'FOCUS', 'NIGHT'].map(m => React.createElement('button', {
                    key: m,
                    onClick: () => { setQuery(m); handleSearch(); },
                    className: 'amoled-card py-6 text-center font-bold hover:text-purple border border-transparent hover:border-purple/30 transition-all active:bg-purple/10'
                }, m))
            )
        )
    );

    const renderSearch = () => React.createElement('div', { className: 'p-6 space-y-4 pb-40' },
        React.createElement('div', { className: 'flex items-center gap-4 mb-6' },
            React.createElement('button', { onClick: () => setView('home'), className: 'text-dim text-2xl' }, '←'),
            React.createElement('h2', { className: 'text-2xl' }, 'RESULTS')
        ),
        loading ? React.createElement('div', { className: 'flex justify-center py-20' }, React.createElement('div', { className: 'loading-glow' })) :
            results.map((s, i) => React.createElement('div', {
                key: s.id + i,
                onClick: () => playSong(results, i),
                className: `track-row ${current?.id === s.id ? 'active' : ''}`
            },
                React.createElement('img', { src: s.thumbnail, className: 'w-12 h-12 rounded object-cover mr-4' }),
                React.createElement('div', { className: 'flex-1 min-w-0' },
                    React.createElement('p', { className: 'track-title font-bold truncate' }, s.title),
                    React.createElement('p', { className: 'artist-name text-[10px] text-dim' }, s.artist)
                ),
                React.createElement('span', { className: 'mono text-xs text-dim ml-4' }, s.duration)
            ))
    );

    const renderLibrary = () => React.createElement('div', { className: 'p-6 space-y-6 pb-40' },
        React.createElement('h2', { className: 'text-3xl' }, 'ARCHIVE'),
        liked.length === 0 ? React.createElement('div', { className: 'py-20 text-center space-y-4' },
            React.createElement('div', { className: 'text-6xl opacity-20' }, '☲'),
            React.createElement('p', { className: 'text-dim mono' }, 'EMPTY_VOID')
        ) :
            liked.map((s, i) => React.createElement('div', {
                key: s.id + i,
                onClick: () => playSong(liked, i),
                className: `track-row ${current?.id === s.id ? 'active' : ''}`
            },
                React.createElement('img', { src: s.thumbnail, className: 'w-12 h-12 rounded object-cover mr-4' }),
                React.createElement('div', { className: 'flex-1 min-w-0' },
                    React.createElement('p', { className: 'track-title font-bold truncate' }, s.title),
                    React.createElement('p', { className: 'artist-name text-[10px] text-dim' }, s.artist)
                ),
                React.createElement('button', {
                    onClick: (e) => { e.stopPropagation(); setLiked(S.toggleLike(user.email, s)) },
                    className: 'text-pink ml-4 text-xl'
                }, '♥')
            ))
    );

    const renderPlayer = () => React.createElement('div', {
        className: 'fixed inset-0 bg-oled z-50 flex flex-col',
        onTouchStart: handleTouchStart,
        onTouchEnd: handleTouchEnd
    },
        // Album Art Zone
        React.createElement('div', { className: 'art-zone' },
            React.createElement('div', { className: 'art-blur-bg', style: { backgroundImage: `url(${current?.thumbnail})` } }),
            React.createElement('div', { className: 'art-glow' }),
            React.createElement('div', { className: 'art-main' },
                React.createElement('img', { src: current?.thumbnail, className: 'w-full h-full object-cover' })
            ),
            React.createElement('div', { className: 'art-fade-overlay' }),
            React.createElement('button', { onClick: () => setView('home'), className: 'absolute top-8 left-8 z-50 text-3xl opacity-50 hover:opacity-100 transition-opacity' }, '↓')
        ),

        // Now Playing Card
        React.createElement('div', { className: 'flex-1 px-8 flex flex-col justify-between pb-12' },
            React.createElement('div', { className: 'text-center' },
                React.createElement('h2', { className: 'text-2xl mb-1 truncate px-4' }, current?.title),
                React.createElement('p', { className: 'artist-name text-dim tracking-[0.3em] text-xs' }, current?.artist),
                React.createElement('div', { className: 'w-16 h-[2px] bg-purple mx-auto mt-6 shadow-[0_0_15px_#A020F0]' })
            ),

            // Lyrics teaser
            React.createElement('div', { className: 'space-y-4 py-8' },
                React.createElement('p', { className: 'lyric-line dim' }, "Deep in the electric void"),
                React.createElement('p', { className: 'lyric-line active' }, "We find the resonance"),
                React.createElement('p', { className: 'lyric-line dim' }, "Where pure black meets the light")
            ),

            // Controls
            React.createElement('div', { className: 'space-y-10' },
                // Progress
                React.createElement('div', { className: 'space-y-3' },
                    React.createElement('div', {
                        className: 'progress-container h-[4px]',
                        onClick: (e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const p = (e.clientX - rect.left) / rect.width;
                            if (playerRef.current) playerRef.current.seekTo(p * duration);
                        }
                    },
                        React.createElement('div', { className: 'progress-fill h-full', style: { width: `${(progress / duration) * 100}%` } },
                            React.createElement('div', { className: 'progress-thumb w-3 h-3 opacity-100' })
                        )
                    ),
                    React.createElement('div', { className: 'flex justify-between mono text-[10px] text-dim font-bold' },
                        React.createElement('span', null, fmtTime(progress)),
                        React.createElement('span', null, fmtTime(duration))
                    )
                ),

                // Buttons
                React.createElement('div', { className: 'flex items-center justify-around' },
                    React.createElement('button', { className: 'dim-icon text-2xl' }, '⇄'),
                    React.createElement('button', { onClick: () => playSong(queue, (qIdx - 1 + queue.length) % queue.length), className: 'control-icon text-3xl' }, '⏮'),
                    React.createElement('button', {
                        onClick: () => playing ? playerRef.current.pauseVideo() : playerRef.current.playVideo(),
                        className: 'play-btn scale-110'
                    }, React.createElement('span', { className: 'text-3xl ml-1' }, playing ? '⏸' : '▶')),
                    React.createElement('button', { onClick: () => playSong(queue, (qIdx + 1) % queue.length), className: 'control-icon text-3xl' }, '⏭'),
                    React.createElement('button', { className: 'dim-icon text-2xl' }, '↺')
                )
            )
        ),
        React.createElement(Visualizer, { active: playing })
    );

    const renderSettings = () => React.createElement('div', { className: 'p-6 space-y-10 pb-40' },
        React.createElement('h2', { className: 'text-3xl' }, 'INTERFACE'),
        React.createElement('section', { className: 'space-y-6' },
            React.createElement('h3', { className: 'text-dim mono text-[10px] font-bold' }, 'EQUALIZER_SPECTRUM'),
            React.createElement('div', { className: 'flex justify-between items-end h-32' },
                [80, 60, 90, 40, 70, 50, 85].map((h, i) => React.createElement('div', { key: i, className: 'eq-bar-container h-full w-8' },
                    React.createElement('div', { className: 'eq-bar', style: { height: `${h}%` } },
                        React.createElement('div', { className: 'eq-handle' })
                    )
                ))
            )
        ),
        React.createElement('section', { className: 'space-y-4' },
            React.createElement('h3', { className: 'text-dim mono text-[10px] font-bold' }, 'SYSTEM_ENGINE'),
            React.createElement('div', { className: 'flex justify-between items-center amoled-card border border-transparent active:border-cyan/30 transition-colors' },
                React.createElement('span', { className: 'text-sm font-bold' }, 'BASS_BOOST'),
                React.createElement('button', { className: 'text-cyan mono text-xs font-bold' }, 'ON')
            ),
            React.createElement('div', { className: 'flex justify-between items-center amoled-card border border-transparent active:border-purple/30 transition-colors' },
                React.createElement('span', { className: 'text-sm font-bold' }, 'AMOLED_INFINITE'),
                React.createElement('button', { className: 'text-purple mono text-xs font-bold' }, 'TRUE')
            ),
            React.createElement('div', { className: 'flex justify-between items-center amoled-card' },
                React.createElement('span', { className: 'text-sm font-bold' }, 'GLOW_INTENSITY'),
                React.createElement('input', { type: 'range', className: 'accent-purple w-24' })
            ),
            React.createElement('button', {
                onClick: onLogout,
                className: 'w-full py-4 text-pink font-bold border border-pink/30 rounded-2xl mt-8 active:bg-pink/10 transition-colors'
            }, 'TERMINATE_SESSION')
        )
    );

    return React.createElement('div', {
        className: 'h-screen flex flex-col bg-oled overflow-hidden relative',
        onClick: addRipple
    },
        ripples.map(r => React.createElement(RippleEffect, { key: r.id, x: r.x, y: r.y, onEnd: () => removeRipple(r.id) })),

        React.createElement('main', { className: 'flex-1 overflow-y-auto no-scrollbar' },
            view === 'home' && renderHome(),
            view === 'search' && renderSearch(),
            view === 'library' && renderLibrary(),
            view === 'player' && renderPlayer(),
            view === 'settings' && renderSettings()
        ),

        // Mini Player
        current && view !== 'player' && React.createElement('div', {
            onClick: () => setView('player'),
            className: 'fixed bottom-[80px] left-4 right-4 amoled-card flex items-center gap-4 py-3 border border-purple/10 z-40 animate-slide-up active:scale-[0.98] transition-transform'
        },
            React.createElement('div', { className: 'relative' },
                React.createElement('img', { src: current.thumbnail, className: `w-10 h-10 rounded-full object-cover ${playing ? 'animate-spin-slow' : ''}` }),
                playing && React.createElement('div', { className: 'absolute inset-0 rounded-full border border-purple/50 animate-ping' })
            ),
            React.createElement('div', { className: 'flex-1 min-w-0' },
                React.createElement('p', { className: 'text-xs font-black truncate' }, current.title),
                React.createElement('p', { className: 'artist-name text-[8px] text-dim font-bold' }, current.artist)
            ),
            React.createElement('button', {
                onClick: (e) => { e.stopPropagation(); playing ? playerRef.current.pauseVideo() : playerRef.current.playVideo() },
                className: 'text-purple mr-2 text-xl'
            }, playing ? '⏸' : '▶')
        ),

        // Nav Bar
        React.createElement('nav', { className: 'nav-bar border-t border-charcoal' },
            React.createElement('button', { onClick: () => setView('home'), className: `nav-item ${view === 'home' ? 'active' : ''}` },
                React.createElement('span', { className: 'text-2xl' }, '◈'),
                React.createElement('span', { className: 'mono text-[9px] font-bold' }, 'CORE'),
                view === 'home' && React.createElement('div', { className: 'nav-glow' })
            ),
            React.createElement('button', { onClick: () => setView('library'), className: `nav-item ${view === 'library' ? 'active' : ''}` },
                React.createElement('span', { className: 'text-2xl' }, '☲'),
                React.createElement('span', { className: 'mono text-[9px] font-bold' }, 'LOGS'),
                view === 'library' && React.createElement('div', { className: 'nav-glow' })
            ),
            React.createElement('button', { onClick: () => setView('settings'), className: `nav-item ${view === 'settings' ? 'active' : ''}` },
                React.createElement('span', { className: 'text-2xl' }, '⌬'),
                React.createElement('span', { className: 'mono text-[9px] font-bold' }, 'OPTS'),
                view === 'settings' && React.createElement('div', { className: 'nav-glow' })
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
