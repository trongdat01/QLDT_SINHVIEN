const express = require('express');
const path = require('path');
const session = require('express-session');
// Clear require cache for connectDB module
delete require.cache[require.resolve('./config/connectDB')];
const { connectDB } = require('./config/connectDB');
const configViewEngine = require('./config/viewEngine');
const homeRoutes = require('./routes/home');
const taiKhoanRoutes = require('./routes/taiKhoan');
// Fix the path to sinhvien routes - remove the 'src/' prefix
const sinhvienRoutes = require('./routes/sinhvien');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Config view engine
configViewEngine(app);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Add a middleware to make the session available to all views
app.use((req, res, next) => {
    res.locals.user = req.session && req.session.user ? req.session.user : null;
    next();
});

// Enable debug middleware to see route requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Database connection
connectDB();

// Routes
app.use('/', homeRoutes);
app.use('/taikhoan', taiKhoanRoutes);
app.use('/sinhvien', sinhvienRoutes);

// Make sure the admin directory exists for the views
const fs = require('fs');
const adminViewsDir = path.join(__dirname, 'views', 'admin');
if (!fs.existsSync(adminViewsDir)) {
    fs.mkdirSync(adminViewsDir, { recursive: true });
    console.log('Created admin views directory');
}

// Make sure the sinhvien directory exists for the views
const sinhvienViewsDir = path.join(__dirname, 'views', 'sinhvien');
if (!fs.existsSync(sinhvienViewsDir)) {
    fs.mkdirSync(sinhvienViewsDir, { recursive: true });
    console.log('Created sinhvien views directory');
}

// Check if dashboard.ejs exists in the correct location
const dashboardViewPath = path.join(__dirname, 'views', 'sinhvien', 'dashboard.ejs');
const potentialSourcePath = path.join(__dirname, '..', 'views', 'sinhvien', 'dashboard.ejs');

if (!fs.existsSync(dashboardViewPath) && fs.existsSync(potentialSourcePath)) {
    // Copy from source to destination
    fs.copyFileSync(potentialSourcePath, dashboardViewPath);
    console.log('Copied dashboard.ejs to the correct views directory');
} else if (!fs.existsSync(dashboardViewPath)) {
    console.error('Warning: dashboard.ejs not found. Please make sure it exists at:', dashboardViewPath);
}

// Only in development mode, include admin reset route
if (process.env.NODE_ENV !== 'production') {
    const adminResetRoutes = require('./routes/homeAdminReset');
    app.use('/admin-tools', adminResetRoutes);
    console.log('Admin tools routes enabled for development');
}

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});