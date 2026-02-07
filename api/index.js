const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// Movie data (same as in server.js)
const movies = [
    {
        id: 1,
        title: "Dune: Part Two",
        description: "Paul Atreides unites with Chani and the Fremen.",
        trailerUrl: "https://www.youtube.com/embed/Way9Dexny3w",
        thumbnail: "https://m.media-amazon.com/images/M/MV5BODI0YjNhNjUtYzE2MC00ZDI1LWE3ZjctODc1M2Q0ZDA1NjgzXkEyXkFqcGdeQXVyMTUzMTg2ODkz._V1_.jpg",
        genre: ["Sci-Fi", "Adventure"],
        releaseYear: 2024,
        duration: "2h 46m",
        rating: 8.7,
        popularity: 95
    },
    {
        id: 2,
        title: "The Batman",
        description: "Batman investigates corruption in Gotham City.",
        trailerUrl: "https://www.youtube.com/embed/mqqft2x_Aa4",
        thumbnail: "https://m.media-amazon.com/images/M/MV5BMDdmMTBiNTYtMDIzNi00NGVlLWIzMDYtZTk3MTQ3NGQxZGEwXkEyXkFqcGdeQXVyMzMwOTU5MDk@._V1_.jpg",
        genre: ["Action", "Crime"],
        releaseYear: 2022,
        duration: "2h 56m",
        rating: 7.8,
        popularity: 88
    }
];

// API Routes
app.get('/movies', (req, res) => {
    res.json(movies);
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Movie API is running',
        totalMovies: movies.length
    });
});

// Export for Vercel
module.exports = app;
