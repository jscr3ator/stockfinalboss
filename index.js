const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.set('view engine', 'ejs');
app.use(express.static('public'));

const stocks = [
    { id: 1, name: 'SafeGov Bond', type: 'Safe', price: 100, volatility: 0.08, history: [100] },
    { id: 2, name: 'StableBlue Chip', type: 'Safe', price: 150, volatility: 0.12, history: [150] },
    { id: 3, name: 'GrowthTech Inc', type: 'Moderate', price: 200, volatility: 0.25, history: [200] },
    { id: 4, name: 'ValueRetail Co', type: 'Moderate', price: 80, volatility: 0.30, history: [80] },
    { id: 5, name: 'BioFuture Labs', type: 'Volatile', price: 50, volatility: 0.50, history: [50] },
    { id: 6, name: 'CryptoMoon X', type: 'Volatile', price: 10, volatility: 0.90, history: [10] },
    { id: 7, name: 'WildWest Energy', type: 'Volatile', price: 30, volatility: 0.70, history: [30] },
    { id: 8, name: 'AIVision Corp', type: 'Volatile', price: 120, volatility: 0.60, history: [120] }
];

let players = new Map();

wss.on('connection', (ws) => {
    let playerId = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'join') {
            playerId = Math.random().toString(36).substr(2, 9);
            players.set(playerId, {
                id: playerId,
                username: data.username,
                balance: 500,
                portfolio: {}, // { stockId: quantity }
                ws: ws
            });
            ws.send(JSON.stringify({ type: 'init', playerId, stocks }));
            broadcastLeaderboard();
        }

        if (data.type === 'trade' && playerId) {
            const player = players.get(playerId);
            const stock = stocks.find(s => s.id === data.stockId);
            if (!player || !stock) return;

            if (data.action === 'buy') {
                const cost = stock.price * data.quantity;
                if (player.balance >= cost) {
                    player.balance -= cost;
                    player.portfolio[data.stockId] = (player.portfolio[data.stockId] || 0) + data.quantity;
                }
            } else if (data.action === 'sell') {
                const qty = player.portfolio[data.stockId] || 0;
                if (qty >= data.quantity) {
                    player.balance += stock.price * data.quantity;
                    player.portfolio[data.stockId] -= data.quantity;
                }
            }
            broadcastLeaderboard();
            ws.send(JSON.stringify({ 
                type: 'update_player', 
                balance: player.balance, 
                portfolio: player.portfolio 
            }));
        }
    });

    ws.on('close', () => {
        if (playerId) {
            players.delete(playerId);
            broadcastLeaderboard();
        }
    });
});

function calculateNetWorth(player) {
    let worth = player.balance;
    for (const [stockId, qty] of Object.entries(player.portfolio)) {
        const stock = stocks.find(s => s.id === parseInt(stockId));
        if (stock) worth += stock.price * qty;
    }
    return worth;
}

function broadcastLeaderboard() {
    const leaderboard = Array.from(players.values())
        .map(p => ({ 
            username: p.username, 
            balance: calculateNetWorth(p)
        }))
        .sort((a, b) => b.balance - a.balance);

    const message = JSON.stringify({ type: 'leaderboard', leaderboard });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Update stock prices periodically
setInterval(() => {
    stocks.forEach(stock => {
        const change = (Math.random() - 0.5) * 2 * stock.volatility * (stock.price * 0.1);
        stock.price = Math.max(0.1, stock.price + change);
        stock.history.push(stock.price);
        if (stock.history.length > 20) stock.history.shift();
    });
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            // Find player associated with this client to send their specific net worth if needed
            // But for now just broadcast prices and leaderboard
            client.send(JSON.stringify({ type: 'prices', stocks }));
        }
    });
    broadcastLeaderboard();
}, 2000);

app.get('/', (req, res) => res.render('index'));
app.get('/host', (req, res) => res.render('host'));
app.get('/game', (req, res) => res.render('game'));

server.listen(5000, '0.0.0.0', () => {
    console.log('Server running on port 5000');
});
