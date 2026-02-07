const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 5000;

// 12 WORKING MOVIE TRAILERS
const movies = [
    {id:1,title:"Dune: Part Two",description:"Epic sci-fi adventure",trailerUrl:"https://www.youtube.com/embed/Way9Dexny3w",thumbnail:"https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",genre:["Sci-Fi"],rating:8.7},
    {id:2,title:"The Batman",description:"Dark knight detective story",trailerUrl:"https://www.youtube.com/embed/mqqft2x_Aa4",thumbnail:"https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg",genre:["Action"],rating:7.8},
    {id:3,title:"Spider-Man: Across the Spider-Verse",description:"Multiverse animation masterpiece",trailerUrl:"https://www.youtube.com/embed/shW9i6k8cB0",thumbnail:"https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg",genre:["Animation"],rating:8.6},
    {id:4,title:"Avatar: The Way of Water",description:"Underwater Pandora adventure",trailerUrl:"https://www.youtube.com/embed/d9MyW72ELq0",thumbnail:"https://image.tmdb.org/t/p/w500/94xxm5701CzOdJdUEdIuwqZaowx.jpg",genre:["Sci-Fi"],rating:7.6},
    {id:5,title:"John Wick: Chapter 4",description:"Action-packed revenge story",trailerUrl:"https://www.youtube.com/embed/qEVUtrk8_B4",thumbnail:"https://image.tmdb.org/t/p/w500/vZloFAK7NmvMGKE7VkF5UHaz0I.jpg",genre:["Action"],rating:7.8},
    {id:6,title:"Barbie",description:"Life in plastic is fantastic",trailerUrl:"https://www.youtube.com/embed/pBk4NYhWNMM",thumbnail:"https://image.tmdb.org/t/p/w500/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg",genre:["Comedy"],rating:7.0},
    {id:7,title:"Oppenheimer",description:"Atomic bomb creation story",trailerUrl:"https://www.youtube.com/embed/bK6ldnjE3Y0",thumbnail:"https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR3n8zh.jpg",genre:["Drama"],rating:8.3},
    {id:8,title:"Mission: Impossible 7",description:"Ethan Hunt's latest mission",trailerUrl:"https://www.youtube.com/embed/avz06PDqDbM",thumbnail:"https://image.tmdb.org/t/p/w500/NNxYkU70HPurnNCSiCjYAmacwm.jpg",genre:["Action"],rating:7.7},
    {id:9,title:"Guardians 3",description:"Final guardians adventure",trailerUrl:"https://www.youtube.com/embed/u3V5KDHRQvk",thumbnail:"https://image.tmdb.org/t/p/w500/nHf61UzkfFno5X1ofIhugCPus2R.jpg",genre:["Action"],rating:7.9},
    {id:10,title:"Black Panther 2",description:"Wakanda forever",trailerUrl:"https://www.youtube.com/embed/RlOB3UALvrQ",thumbnail:"https://image.tmdb.org/t/p/w500/sv1xJUazXeYqALzczSZ3O6nkH75.jpg",genre:["Action"],rating:7.2},
    {id:11,title:"Top Gun: Maverick",description:"High-flying sequel",trailerUrl:"https://www.youtube.com/embed/giXco2jaZ_4",thumbnail:"https://image.tmdb.org/t/p/w500/62HCnUTziyWcpDaBO2i1DX17ljH.jpg",genre:["Action"],rating:8.2},
    {id:12,title:"Everything Everywhere",description:"Multiverse comedy drama",trailerUrl:"https://www.youtube.com/embed/wxN1T1uxQ2g",thumbnail:"https://image.tmdb.org/t/p/w500/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg",genre:["Comedy"],rating:7.8}
];

// API ENDPOINTS
app.get('/api/movies', (req, res) => res.json(movies));
app.get('/api/movies/:id', (req, res) => res.json(movies.find(m => m.id == req.params.id) || {}));
app.get('/api/genres', (req, res) => res.json([...new Set(movies.flatMap(m => m.genre))]));
app.get('/api/health', (req, res) => res.json({status:'OK',movies:movies.length}));

// ROUTES
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname,'public','index.html')));

// START
app.listen(PORT, () => console.log(`🚀 Server ready with ${movies.length} movies at http://localhost:${PORT}`));
