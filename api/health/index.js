module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.json({ 
        status: 'OK', 
        message: 'Movie API is running',
        timestamp: new Date().toISOString()
    });
};
