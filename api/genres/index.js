const genres = ["Action", "Adventure", "Sci-Fi", "Drama", "Crime", "Animation"];

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.json(genres);
};
