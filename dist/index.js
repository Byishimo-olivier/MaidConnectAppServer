"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const jobRoutes_1 = __importDefault(require("./routes/jobRoutes"));
const profileRoutes_1 = __importDefault(require("./routes/profileRoutes"));
const contractRoutes_1 = __importDefault(require("./routes/contractRoutes"));
const miscRoutes_1 = __importDefault(require("./routes/miscRoutes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 8000;
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*", // Allow all for development
        methods: ["GET", "POST"]
    }
});
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/api/auth', authRoutes_1.default);
app.use('/api/jobs', jobRoutes_1.default);
app.use('/api/profile', profileRoutes_1.default);
app.use('/api/contracts', contractRoutes_1.default);
app.use('/api', miscRoutes_1.default);
app.get('/', (req, res) => {
    res.send('House Maid Recruiting System Backend is running');
});
// Socket.io connection
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    socket.on('join', (userId) => {
        socket.join(`user:${userId}`);
    });
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});
httpServer.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
