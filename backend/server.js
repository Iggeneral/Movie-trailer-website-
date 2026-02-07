const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 5000;

// Enhanced movie data with 6 popular movies
let movies = [
    {
        id: 1,
        title: "Dune: Part Two",
        description: "Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.",
        trailerUrl: "https://www.youtube.com/embed/Way9Dexny3w",
        thumbnail: "https://m.media-amazon.com/images/M/MV5BODI0YjNhNjUtYzE2MC00ZDI1LWE3ZjctODc1M2Q0ZDA1NjgzXkEyXkFqcGdeQXVyMTUzMTg2ODkz._V1_.jpg",
        genre: ["Sci-Fi", "Adventure", "Drama"],
        releaseYear: 2024,
        duration: "2h 46m",
        rating: 8.7,
        director: "Denis Villeneuve",
        cast: ["Timothée Chalamet", "Zendaya", "Rebecca Ferguson"],
        popularity: 95
    },
    {
        id: 2,
        title: "The Batman",
        description: "When a sadistic serial killer begins murdering key political figures in Gotham, Batman is forced to investigate the city's hidden corruption.",
        trailerUrl: "https://www.youtube.com/embed/mqqft2x_Aa4",
        thumbnail: "https://m.media-amazon.com/images/M/MV5BMDdmMTBiNTYtMDIzNi00NGVlLWIzMDYtZTk3MTQ3NGQxZGEwXkEyXkFqcGdeQXVyMzMwOTU5MDk@._V1_.jpg",
        genre: ["Action", "Crime", "Drama"],
        releaseYear: 2022,
        duration: "2h 56m",
        rating: 7.8,
        director: "Matt Reeves",
        cast: ["Robert Pattinson", "Zoë Kravitz", "Paul Dano"],
        popularity: 88
    },
    {
        id: 3,
        title: "Spider-Man: Across the Spider-Verse",
        description: "Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting its very existence.",
        trailerUrl: "https://www.youtube.com/embed/shW9i6k8cB0",
        thumbnail: "https://m.media-amazon.com/images/M/MV5BMzI0NmVkMjEtYmY4MS00ZDMxLTlkZmEtMzU4MDQxYTMzMjU2XkEyXkFqcGdeQXVyMzQ0MzA0NTM@._V1_FMjpg_UX1000_.jpg",
        genre: ["Animation", "Action", "Adventure"],
        releaseYear: 2023,
        duration: "2h 20m",
        rating: 8.6,
        director: "Joaquim Dos Santos",
        cast: ["Shameik Moore", "Hailee Steinfeld", "Oscar Isaac"],
        popularity: 92
    },
    {
        id: 4,
        title: "Avatar: The Way of Water",
        description: "Jake Sully lives with his newfound family formed on the extrasolar moon Pandora. When a familiar threat returns, Jake must work with Neytiri to protect their home.",
        trailerUrl: "https://www.youtube.com/embed/d9MyW72ELq0",
        thumbnail: "https://m.media-amazon.com/images/M/MV5BYjhiNjBlODctY2ZiOC00YjVlLWFlNzAtNTVhNzM1YjI1NzMxXkEyXkFqcGdeQXVyMjQxNTE1MDA@._V1_.jpg",
        genre: ["Sci-Fi", "Adventure", "Fantasy"],
        releaseYear: 2022,
        duration: "3h 12m",
        rating: 7.6,
        director: "James Cameron",
        cast: ["Sam Worthington", "Zoe Saldana", "Sigourney Weaver"],
        popularity: 85
    },
    {
        id: 5,
        title: "John Wick: Chapter 4",
        description: "John Wick uncovers a path to defeating The High Table. But before he can earn his freedom, Wick must face off against a new enemy.",
        trailerUrl: "https://www.youtube.com/embed/qEVUtrk8_B4",
        thumbnail: "https://m.media-amazon.com/images/M/MV5BMDExZGMyOTMtMDgyYi00NGIwLWJhMTEtOTdkZGFjNmZiMTEwXkEyXkFqcGdeQXVyMjM4NTM5NDY@._V1_.jpg",
        genre: ["Action", "Crime", "Thriller"],
        releaseYear: 2023,
        duration: "2h 49m",
        rating: 7.8,
        director: "Chad Stahelski",
        cast: ["Keanu Reeves", "Donnie Yen", "Bill Skarsgård"],
        popularity: 87
    },
    {
        id: 6,
        title: "Barbie",
        description: "Barbie and Ken are having the time of their lives in Barbie Land. However, when they get a chance to go to the real world, they soon discover the joys and perils of living among humans.",
        trailerUrl: "https://www.youtube.com/embed/pBk4NYhWNMM",
        thumbnail: "https://m.media-amazon.com/images/M/MV5BNjU3N2QxNzYtMjk1NC00MTc4LTk1NTQtMmUxNTljM2I0NDA5XkEyXkFqcGdeQXVyODE5NzE3OTE@._V1_.jpg",
        genre: ["Adventure", "Comedy", "Fantasy"],
        releaseYear: 2023,
        duration: "1h 54m",
        rating: 7.0,
        director: "Greta Gerwig",
        cast: ["Margot Robbie", "Ryan Gosling", "America Ferrera"],
        popularity: 85
    },
    {
        id: 7,
        title: "Mission: Impossible - Dead Reckoning",
        description: "Ethan Hunt and his IMF team must track down a terrifying new weapon that threatens all of humanity if it falls into the wrong hands.",
        trailerUrl: "https://www.youtube.com/embed/avz06PDqDbM",
        thumbnail: "https://m.media-amazon.com/images/M/MV5BYzFiZjc1YzctMDY3Zi00NGE5LTlmNWEtN2Q3OWFjYjY1NGM2XkEyXkFqcGdeQXVyMTUyMTUzNjQ0._V1_.jpg",
        genre: ["Action", "Adventure", "Thriller"],
        releaseYear: 2023,
        duration: "2h 43m",
        rating: 7.7,
        director: "Christopher McQuarrie",
        cast: ["Tom Cruise", "Hayley Atwell", "Ving Rhames"],
        popularity: 84
    },
    {
        id: 8,
        title: "Guardians of the Galaxy Vol. 3",
        description: "Still reeling from the loss of Gamora, Peter Quill must rally his team to defend the universe and protect one of their own.",
        trailerUrl: "https://www.youtube.com/embed/u3V5KDHRQvk",
        thumbnail: "https://m.media-amazon.com/images/M/MV5BMDgxOTdjMzYtZGQxMS00ZTAzLWI4Y2UtMTQzN2VlYjYyZWRiXkEyXkFqcGdeQXVyMTkxNjUyNQ@@._V1_.jpg",
        genre: ["Action", "Adventure", "Comedy"],
        releaseYear: 2023,
        duration: "2h 30m",
        rating: 7.9,
        director: "James Gunn",
        cast: ["Chris Pratt", "Zoe Saldana", "Dave Bautista"],
        popularity: 83
    }
];

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

// Ensure all movies have embed URLs
movies.forEach(movie => {
    movie.trailerUrl = convertToEmbedUrl(movie.trailerUrl);
});

// API Routes
app.get('/api/movies', (req, res) => {
    const { search, genre, sort = 'popularity' } = req.query;
    let filteredMovies = [...movies];
    
    if (search) {
        filteredMovies = filteredMovies.filter(movie => 
            movie.title.toLowerCase().includes(search.toLowerCase()) ||
            movie.description.toLowerCase().includes(search.toLowerCase()) ||
            movie.genre.some(g => g.toLowerCase().includes(search.toLowerCase()))
        );
    }
    
    if (genre && genre !== 'all') {
        filteredMovies = filteredMovies.filter(movie => 
            movie.genre.some(g => g.toLowerCase() === genre.toLowerCase())
        );
    }
    
    if (sort === 'rating') {
        filteredMovies.sort((a, b) => b.rating - a.rating);
    } else if (sort === 'releaseYear') {
        filteredMovies.sort((a, b) => b.releaseYear - a.releaseYear);
    } else {
        filteredMovies.sort((a, b) => b.popularity - a.popularity);
    }
    
    res.json(filteredMovies);
});

app.get('/api/movies/:id', (req, res) => {
    const movie = movies.find(m => m.id === parseInt(req.params.id));
    if (movie) {
        res.json(movie);
    } else {
        res.status(404).json({ error: 'Movie not found' });
    }
});

// Add new movie
app.post('/api/movies', (req, res) => {
    try {
        const newMovie = {
            id: movies.length + 1,
            ...req.body,
            trailerUrl: convertToEmbedUrl(req.body.trailerUrl),
            popularity: req.body.popularity || 50
        };
        
        movies.push(newMovie);
        res.status(201).json(newMovie);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/genres', (req, res) => {
    const genres = [...new Set(movies.flatMap(movie => movie.genre))];
    res.json(genres);
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Movie Trailer API is running',
        timestamp: new Date().toISOString(),
        totalMovies: movies.length
    });
});

// Admin page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Main site: http://localhost:${PORT}`);
    console.log(`👑 Admin panel: http://localhost:${PORT}/admin`);
    console.log(`🎬 Total movies: ${movies.length} (all should play!)`);
    console.log(`🎥 Testing first movie URL: ${movies[0].trailerUrl}`);
});
