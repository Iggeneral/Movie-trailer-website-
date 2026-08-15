# 🎬 CineFlix 2.0 — Ultimate Movie Trailer Hub

> A premium, production-ready trailer website with 12 curated movies, advanced filtering, watchlist, and fully functional admin CRUD.

### ✨ Live Features (What I built for you)

**Frontend Premium UI:**
- Tailwind CSS + glassmorphism design, 1600px max, fully responsive
- Hero featured carousel with auto-rotation (3 featured movies)
- Movie grid with hover play, lazy images, skeleton loading, animations
- Advanced filters: genre, year (2024/2023/2022), rating (7+, 8+), search (debounced), sort (popularity/rating/year/title)
- Active filter chips UI, empty state handling
- Modal trailer player: YouTube embed autoplay, related movies, director/cast info
- Watchlist (localStorage) with sidebar drawer, counter badges
- Likes/Favorites (heart)
- Share via Web Share API + clipboard fallback
- Toast notifications, keyboard shortcuts (Esc)
- PWA manifest ready

**Backend v2.0 API:**
- `GET /api/movies?search=&genre=&year=&minRating=&sort=&order=` — advanced filtering
- `GET /api/movies/:id` — single + related
- `POST /api/movies` — add (admin)
- `PUT /api/movies/:id` — edit
- `DELETE /api/movies/:id` — delete
- `GET /api/genres`, `/api/trending`, `/api/featured`, `/api/stats`, `/api/health`
- `POST /api/reset` — restore 12 defaults
- File persistence: `data/movies.json` (auto-created)
- YouTube URL auto-converter (watch, youtu.be → embed)
- CORS enabled, static public serving

**Admin Panel `/admin`:**
- Live preview, edit existing, delete, search, sort
- Form validates title/trailer required, comma parsing for genres/cast
- Reset to defaults button

**Data — 12 Movies with Full Metadata:**
Dune 2, The Batman, Spider-Verse, Avatar 2, John Wick 4, Barbie, Oppenheimer, Mission Impossible 7, Guardians 3, Black Panther 2, Top Gun Maverick, Everything Everywhere — all with TMDB posters/backdrops, YouTube embeds, directors, cast, durations.

### 🚀 Run Locally
```bash
npm install
node server.js
# Main: http://localhost:5000
# Admin: http://localhost:5000/admin
# API: http://localhost:5000/api/movies
```

### 🌐 Deploy
- Node 18+ compatible (uses 22 in dev, works fine). Engine warning harmless.
- Set `PORT` env var. Persist `data/movies.json` volume if needed.
- Optional: add `TMDB_API_KEY` env for future live import (endpoint stub present at `/api/tmdb/info`).

### 📦 Stack
Express 4, CORS, Tailwind CDN, Vanilla JS (component-style), Poppins + Outfit fonts, FontAwesome.

### 🔮 Next Ideas
- TMDB trending import script
- User auth + MongoDB
- Comments/ratings API
- React + Framer Motion rewrite

Built in one session — you asked for "all of it" and you got it.
