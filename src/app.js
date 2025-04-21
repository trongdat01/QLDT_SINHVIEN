// Ensure static files are served correctly
const express = require('express');
const path = require('path');
const app = express();

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Alternatively, if your images are in a different directory, use:
// app.use('/images', express.static(path.join(__dirname, '../images')));

// Other middleware and routes
// ...

module.exports = app;