const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 5000;
const IS_VERCEL = !!process.env.VERCEL;
const DATA_FILE = path.join(__dirname, 'data', 'movies.json');
const TMP_DATA_FILE = '/tmp/movies.json';

// Convert YouTube URL to embed format
function convertToEmbedUrl(url) {
    if (!url) return '';
    if (url.includes('embed/')) return url;
    if (url.includes('youtube.com/watch?v=')) {
        const videoId = url.split('v=')[1]?.split('&')[0];
        return `https://www.youtube.com/embed/${videoId}`;
    }
    if (url.includes('youtu.be/')) {
        const videoId = url.split('youtu.be/')[1]?.split('?')[0];
        return `https://www.youtube.com/embed/${videoId}`;
    }
    return url;
}

// Default 12 movies with enriched metadata
const defaultMovies = [
    {
        id: 1,
        title: "Dune: Part Two",
        description: "Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family. Epic continuation of Frank Herbert's saga.",
        trailerUrl: "https://www.youtube.com/embed/Way9Dexny3w",
        thumbnail: "https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",
        backdrop: "https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9IsKZUClX8ha8.jpg",
        genre: ["Sci-Fi", "Adventure", "Drama"],
        releaseYear: 2024,
        duration: "2h 46m",
        rating: 8.7,
        director: "Denis Villeneuve",
        cast: ["Timothée Chalamet", "Zendaya", "Rebecca Ferguson", "Javier Bardem"],
        popularity: 98,
        featured: true
    },
    {
        id: 2,
        title: "The Batman",
        description: "When a sadistic serial killer begins murdering key political figures in Gotham, Batman is forced to investigate the city's hidden corruption and question his family's involvement.",
        trailerUrl: "https://www.youtube.com/embed/mqqft2x_Aa4",
        thumbnail: "https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg",
        backdrop: "https://image.tmdb.org/t/p/w1280/5P8SmMzSNYKTQSovBU5HMkuAE0H.jpg",
        genre: ["Action", "Crime", "Drama"],
        releaseYear: 2022,
        duration: "2h 56m",
        rating: 7.8,
        director: "Matt Reeves",
        cast: ["Robert Pattinson", "Zoë Kravitz", "Paul Dano", "Jeffrey Wright"],
        popularity: 88
    },
    {
        id: 3,
        title: "Spider-Man: Across the Spider-Verse",
        description: "Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting its existence. Masterpiece animation.",
        trailerUrl: "https://www.youtube.com/embed/shW9i6k8cB0",
        thumbnail: "https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg",
        backdrop: "https://image.tmdb.org/t/p/w1280/4HodYYKEIsQHOxgjzdQRxvsTNr.jpg",
        genre: ["Animation", "Action", "Adventure"],
        releaseYear: 2023,
        duration: "2h 20m",
        rating: 8.6,
        director: "Joaquim Dos Santos",
        cast: ["Shameik Moore", "Hailee Steinfeld", "Oscar Isaac", "Brian Tyree Henry"],
        popularity: 92,
        featured: true
    },
    {
        id: 4,
        title: "Avatar: The Way of Water",
        description: "Jake Sully lives with his newfound family on Pandora. When a familiar threat returns, Jake must work with Neytiri and the army of the Na'vi race to protect their home.",
        trailerUrl: "https://www.youtube.com/embed/d9MyW72ELq0",
        thumbnail: "https://image.tmdb.org/t/p/w500/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg",
        backdrop: "https://image.tmdb.org/t/p/w1280/s16H6tpK2utvwDtzZ8Qy4qm5Emw.jpg",
        genre: ["Sci-Fi", "Adventure", "Fantasy"],
        releaseYear: 2022,
        duration: "3h 12m",
        rating: 7.6,
        director: "James Cameron",
        cast: ["Sam Worthington", "Zoe Saldana", "Sigourney Weaver", "Stephen Lang"],
        popularity: 85
    },
    {
        id: 5,
        title: "John Wick: Chapter 4",
        description: "John Wick uncovers a path to defeating The High Table. But before he can earn his freedom, Wick must face off against a new enemy with powerful alliances across the globe.",
        trailerUrl: "https://www.youtube.com/embed/qEVUtrk8_B4",
        thumbnail: "https://image.tmdb.org/t/p/w500/vZloFAK7NmvMGKE7VkF5UHaz0I.jpg",
        backdrop: "https://image.tmdb.org/t/p/w1280/h8gHn0OzBoaefsYseUByqsmEDMY.jpg",
        genre: ["Action", "Crime", "Thriller"],
        releaseYear: 2023,
        duration: "2h 49m",
        rating: 7.8,
        director: "Chad Stahelski",
        cast: ["Keanu Reeves", "Donnie Yen", "Bill Skarsgård", "Laurence Fishburne"],
        popularity: 87
    },
    {
        id: 6,
        title: "Barbie",
        description: "Barbie and Ken are having the time of their lives in colorful Barbie Land. However, when they get a chance to go to the real world, they discover the joys and perils of living among humans.",
        trailerUrl: "https://www.youtube.com/embed/pBk4NYhWNMM",
        thumbnail: "https://image.tmdb.org/t/p/w500/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg",
        backdrop: "https://image.tmdb.org/t/p/w1280/ctMserH8g2SeOAnCw5gFjdQF8mo.jpg",
        genre: ["Comedy", "Adventure", "Fantasy"],
        releaseYear: 2023,
        duration: "1h 54m",
        rating: 7.0,
        director: "Greta Gerwig",
        cast: ["Margot Robbie", "Ryan Gosling", "America Ferrera", "Kate McKinnon"],
        popularity: 85
    },
    {
        id: 7,
        title: "Oppenheimer",
        description: "The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb during World War II. Nolan's epic thriller.",
        trailerUrl: "https://www.youtube.com/embed/bK6ldnjE3Y0",
        thumbnail: "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR3n8zh.jpg",
        backdrop: "https://image.tmdb.org/t/p/w1280/fm6KqXpk3M2HVveHwCrB8heMDQ5.jpg",
        genre: ["Drama", "History", "Thriller"],
        releaseYear: 2023,
        duration: "3h 0m",
        rating: 8.3,
        director: "Christopher Nolan",
        cast: ["Cillian Murphy", "Emily Blunt", "Matt Damon", "Robert Downey Jr."],
        popularity: 90,
        featured: true
    },
    {
        id: 8,
        title: "Mission: Impossible - Dead Reckoning",
        description: "Ethan Hunt and his IMF team must track down a dangerous weapon that threatens all of humanity before it falls into the wrong hands, confronting a mysterious enemy.",
        trailerUrl: "https://www.youtube.com/embed/avz06PDqDbM",
        thumbnail: "https://image.tmdb.org/t/p/w500/NNxYkU70HPurnNCSiCjYAmacwm.jpg",
        backdrop: "https://image.tmdb.org/t/p/w1280/628Dep6AxEtDxjZoGP78TsOxYbK.jpg",
        genre: ["Action", "Thriller", "Adventure"],
        releaseYear: 2023,
        duration: "2h 43m",
        rating: 7.7,
        director: "Christopher McQuarrie",
        cast: ["Tom Cruise", "Hayley Atwell", "Ving Rhames", "Simon Pegg"],
        popularity: 84
    },
    {
        id: 9,
        title: "Guardians of the Galaxy Vol. 3",
        description: "Still reeling from the loss of Gamora, Peter Quill rallies his team to defend the universe and protect one of their own. Emotional final chapter.",
        trailerUrl: "https://www.youtube.com/embed/u3V5KDHRQvk",
        thumbnail: "https://image.tmdb.org/t/p/w500/r2J02Z2OpNTctfOSN1Ydgii51I3.jpg",
        backdrop: "https://image.tmdb.org/t/p/w1280/5YZbUmjbMa3ClvSW1Wj3D6JCXmj.jpg",
        genre: ["Action", "Adventure", "Comedy"],
        releaseYear: 2023,
        duration: "2h 30m",
        rating: 7.9,
        director: "James Gunn",
        cast: ["Chris Pratt", "Zoe Saldana", "Dave Bautista", "Karen Gillan"],
        popularity: 83
    },
    {
        id: 10,
        title: "Black Panther: Wakanda Forever",
        description: "Queen Ramonda, Shuri, M'Baku, Okoye and the Dora Milaje fight to protect their nation from intervening world powers in the wake of King T'Challa's death.",
        trailerUrl: "https://www.youtube.com/embed/RlOB3UALvrQ",
        thumbnail: "https://image.tmdb.org/t/p/w500/sv1xJUazXeYqALzczSZ3O6nkH75.jpg",
        backdrop: "https://image.tmdb.org/t/p/w1280/xDMIl84Qo5Tsu62c9DGWhmPI67A.jpg",
        genre: ["Action", "Adventure", "Sci-Fi"],
        releaseYear: 2022,
        duration: "2h 41m",
        rating: 7.2,
        director: "Ryan Coogler",
        cast: ["Letitia Wright", "Lupita Nyong'o", "Danai Gurira", "Winston Duke"],
        popularity: 80
    },
    {
        id: 11,
        title: "Top Gun: Maverick",
        description: "After more than 30 years of service as one of the Navy's top aviators, Pete Mitchell is where he belongs, pushing the envelope as a courageous test pilot.",
        trailerUrl: "https://www.youtube.com/embed/giXco2jaZ_4",
        thumbnail: "https://image.tmdb.org/t/p/w500/62HCnUTziyWcpDaBO2i1DX17ljH.jpg",
        backdrop: "https://image.tmdb.org/t/p/w1280/AaV1YIdWKnjAadbuFsdqCyNqM5x.jpg",
        genre: ["Action", "Drama"],
        releaseYear: 2022,
        duration: "2h 11m",
        rating: 8.2,
        director: "Joseph Kosinski",
        cast: ["Tom Cruise", "Miles Teller", "Jennifer Connelly", "Val Kilmer"],
        popularity: 86
    },
    {
        id: 12,
        title: "Everything Everywhere All At Once",
        description: "A middle-aged Chinese immigrant is swept up into an insane adventure where she alone can save existence by exploring other universes and connecting with the lives she could have led.",
        trailerUrl: "https://www.youtube.com/embed/wxN1T1uxQ2g",
        thumbnail: "https://image.tmdb.org/t/p/w500/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg",
        backdrop: "https://image.tmdb.org/t/p/w1280/m0YjB4Vfgh1Tz0a2T0aT0aT0aT0aT0a.jpg",
        genre: ["Comedy", "Sci-Fi", "Drama"],
        releaseYear: 2022,
        duration: "2h 19m",
        rating: 7.8,
        director: "Daniel Kwan",
        cast: ["Michelle Yeoh", "Stephanie Hsu", "Ke Huy Quan", "James Hong"],
        popularity: 82
    }
];

// Load or initialize data
let movies = [];
function loadMovies() {
    try {
        // Try /tmp first on vercel (writable), then committed data file
        const candidates = IS_VERCEL ? [TMP_DATA_FILE, DATA_FILE] : [DATA_FILE, TMP_DATA_FILE];
        for (const file of candidates) {
            if (fs.existsSync(file)) {
                const data = fs.readFileSync(file, 'utf8');
                movies = JSON.parse(data);
                movies.forEach(m => m.trailerUrl = convertToEmbedUrl(m.trailerUrl));
                console.log(`📁 Loaded ${movies.length} movies from ${file}`);
                return;
            }
        }
        movies = defaultMovies;
        saveMovies();
        console.log(`✨ Initialized with ${movies.length} default movies`);
    } catch (e) {
        console.error('Failed to load movies, using defaults', e);
        movies = defaultMovies;
    }
}
function saveMovies() {
    try {
        // On vercel, write to /tmp (writable) otherwise to data folder
        if (IS_VERCEL) {
            fs.writeFileSync(TMP_DATA_FILE, JSON.stringify(movies, null, 2));
            console.log(`💾 Saved ${movies.length} movies to ${TMP_DATA_FILE} (vercel tmp)`);
        } else {
            fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
            fs.writeFileSync(DATA_FILE, JSON.stringify(movies, null, 2));
        }
    } catch (e) {
        console.error('Failed to save movies (expected on read-only vercel fs for committed file)', e.message);
    }
}
loadMovies();

// --- API ROUTES ---

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'CineFlix API v2.0 running',
        timestamp: new Date().toISOString(),
        totalMovies: movies.length,
        avgRating: (movies.reduce((a, b) => a + b.rating, 0) / movies.length).toFixed(1)
    });
});

app.get('/api/stats', (req, res) => {
    const genres = [...new Set(movies.flatMap(m => m.genre))];
    const years = [...new Set(movies.map(m => m.releaseYear))].sort((a,b)=>b-a);
    const avgRating = (movies.reduce((a,b)=>a+b.rating,0)/movies.length).toFixed(1);
    const featured = movies.filter(m=>m.featured);
    res.json({
        total: movies.length,
        genres: genres.length,
        avgRating,
        years,
        featuredCount: featured.length,
        genreList: genres,
        totalPopularity: movies.reduce((a,b)=>a+b.popularity,0)
    });
});

app.get('/api/genres', (req, res) => {
    const genres = [...new Set(movies.flatMap(movie => movie.genre))];
    res.json(genres);
});

app.get('/api/trending', (req, res) => {
    const trending = [...movies].sort((a,b)=>b.popularity - a.popularity).slice(0,5);
    res.json(trending);
});

app.get('/api/featured', (req, res) => {
    const featured = movies.filter(m=>m.featured);
    if (featured.length===0) return res.json([movies[0]]);
    res.json(featured);
});

// Main movies endpoint with advanced filtering
app.get('/api/movies', (req, res) => {
    const { search, genre, sort = 'popularity', year, minRating, order = 'desc' } = req.query;
    let filtered = [...movies];

    if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(m =>
            m.title.toLowerCase().includes(q) ||
            m.description.toLowerCase().includes(q) ||
            m.director?.toLowerCase().includes(q) ||
            m.cast?.some(c=>c.toLowerCase().includes(q)) ||
            m.genre.some(g => g.toLowerCase().includes(q))
        );
    }

    if (genre && genre !== 'all') {
        filtered = filtered.filter(movie =>
            movie.genre.some(g => g.toLowerCase() === genre.toLowerCase())
        );
    }

    if (year && year !== 'all') {
        filtered = filtered.filter(m => m.releaseYear == year);
    }

    if (minRating) {
        filtered = filtered.filter(m => m.rating >= parseFloat(minRating));
    }

    // Sorting
    filtered.sort((a,b)=>{
        let cmp = 0;
        if (sort === 'rating') cmp = b.rating - a.rating;
        else if (sort === 'releaseYear' || sort === 'year') cmp = b.releaseYear - a.releaseYear;
        else if (sort === 'title') cmp = a.title.localeCompare(b.title);
        else cmp = b.popularity - a.popularity; // popularity default
        return order === 'asc' ? -cmp : cmp;
    });

    res.json(filtered);
});

app.get('/api/movies/:id', (req, res) => {
    const movie = movies.find(m => m.id === parseInt(req.params.id));
    if (movie) {
        // Add related movies
        const related = movies.filter(m => m.id !== movie.id && m.genre.some(g => movie.genre.includes(g))).slice(0,4);
        res.json({ ...movie, related });
    } else {
        res.status(404).json({ error: 'Movie not found' });
    }
});

app.post('/api/movies', (req, res) => {
    try {
        const body = req.body;
        if (!body.title || !body.trailerUrl) return res.status(400).json({ error: 'Title and trailerUrl required' });

        const newMovie = {
            id: movies.length ? Math.max(...movies.map(m=>m.id)) + 1 : 1,
            title: body.title,
            description: body.description || 'No description',
            trailerUrl: convertToEmbedUrl(body.trailerUrl),
            thumbnail: body.thumbnail || `https://via.placeholder.com/500x750/2f3542/ffffff?text=${encodeURIComponent(body.title)}`,
            backdrop: body.backdrop || body.thumbnail,
            genre: Array.isArray(body.genre) ? body.genre : (body.genre?.split(',').map(s=>s.trim()).filter(Boolean) || ['Action']),
            releaseYear: parseInt(body.releaseYear) || new Date().getFullYear(),
            duration: body.duration || '2h 0m',
            rating: parseFloat(body.rating) || 7.0,
            director: body.director || 'Unknown',
            cast: Array.isArray(body.cast) ? body.cast : (body.cast?.split(',').map(s=>s.trim()).filter(Boolean) || []),
            popularity: parseInt(body.popularity) || 50,
            featured: !!body.featured
        };
        movies.push(newMovie);
        saveMovies();
        res.status(201).json(newMovie);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/movies/:id', (req, res) => {
    const idx = movies.findIndex(m => m.id === parseInt(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'Movie not found' });
    try {
        const body = req.body;
        movies[idx] = {
            ...movies[idx],
            ...body,
            id: movies[idx].id,
            trailerUrl: body.trailerUrl ? convertToEmbedUrl(body.trailerUrl) : movies[idx].trailerUrl,
            genre: body.genre ? (Array.isArray(body.genre) ? body.genre : body.genre.split(',').map(s=>s.trim())) : movies[idx].genre,
            cast: body.cast ? (Array.isArray(body.cast) ? body.cast : body.cast.split(',').map(s=>s.trim())) : movies[idx].cast,
            rating: body.rating ? parseFloat(body.rating) : movies[idx].rating,
            releaseYear: body.releaseYear ? parseInt(body.releaseYear) : movies[idx].releaseYear
        };
        saveMovies();
        res.json(movies[idx]);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.delete('/api/movies/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const initial = movies.length;
    movies = movies.filter(m => m.id !== id);
    if (movies.length === initial) return res.status(404).json({ error: 'Movie not found' });
    saveMovies();
    res.json({ success: true, remaining: movies.length });
});

// Reset to defaults (admin helper)
app.post('/api/reset', (req, res) => {
    movies = defaultMovies;
    saveMovies();
    res.json({ success: true, count: movies.length });
});

// TMDB proxy placeholder - if env key present, would fetch. For now return info
app.get('/api/tmdb/info', (req, res) => {
    res.json({
        enabled: !!process.env.TMDB_API_KEY,
        message: process.env.TMDB_API_KEY ? 'TMDB key configured' : 'Add TMDB_API_KEY to .env to enable live trending import',
        endpoint: 'https://api.themoviedb.org/3/trending/movie/week'
    });
});

// Serve admin and frontend
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// For local dev, listen. For Vercel, export as serverless function
if (!IS_VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 CineFlix v2.0 ready with ${movies.length} movies at http://localhost:${PORT}`);
        console.log(`📱 Main: http://localhost:${PORT} | Admin: http://localhost:${PORT}/admin | API: http://localhost:${PORT}/api/movies`);
    });
}

module.exports = app;
