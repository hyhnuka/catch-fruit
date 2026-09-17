// ==========================================
// 1. SETUP SIGNALR & KONTROL INPUT REMOTE
// ==========================================
// Tambahkan ?ngrok-skip-browser-warning=true langsung di URL
const BACKEND_URL = "https://delighted-steam-impurity.ngrok-free.dev";

const connection = new signalR.HubConnectionBuilder()
    .withUrl(BACKEND_URL + "/hubs/game?ngrok-skip-browser-warning=true", {
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling
    })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Information)
    .build();

const statusText = document.getElementById("status-text");

// Sambungkan ke server
async function startSignalR() {
    try {
        await connection.start();
        console.log("SignalR Connected!");
        statusText.textContent = "Terhubung! Masukkan nama:";
        statusText.style.color = "#4ade80";
    } catch (err) {
        console.error("Gagal Konek SignalR:", err);
        statusText.textContent = "Gagal terhubung ke server. Coba refresh.";
        statusText.style.color = "#f87171";
    }
}

startSignalR();

// Dengarkan event gerak dari controller HP
connection.on("ReceiveMove", (key, isPressed) => {
    if (remoteKeys.hasOwnProperty(key)) {
        remoteKeys[key] = isPressed;
    }
});

// Dengarkan event saat pemain memasukkan nama di HP
connection.on("PlayerJoined", (playerName) => {
    const statusEl = document.getElementById("lobby-status");
    if (statusEl) statusEl.textContent = `Pemain Terhubung: ${playerName}! Game dimulai...`;

    setTimeout(() => {
        const startScreen = document.getElementById("start-screen");
        const gameScreen = document.getElementById("game-screen");
        if (startScreen) startScreen.classList.add("hidden");
        if (gameScreen) gameScreen.classList.remove("hidden");

        if (window.activeGame) {
            window.activeGame.playerName = playerName;
            window.activeGame.resizeCanvas();
            window.activeGame.start();
        }
    }, 1500);
});

connection.start().catch(err => console.error("Koneksi SignalR Gagal:", err));

// Render QR Code mengarah ke file controller.html
window.addEventListener("DOMContentLoaded", () => {
    const qrContainer = document.getElementById("qrcode");
    if (qrContainer) {
        // Mengarahkan ke file controller.html di hosting/server yang sama
        const controllerUrl = window.location.href.replace(/index\.html.*$/i, "").replace(/\/$/, "") + "/controller.html";
        new QRCode(qrContainer, {
            text: controllerUrl,
            width: 180,
            height: 180
        });
    }
});


// ==========================================
// 2. GAME CLASSES & LOGIC
// ==========================================
class Player {
    constructor(canvas, image) {
        this.canvas = canvas;
        this.image = image;
        this.width = 80;
        this.height = 80;
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - this.height - 15;
        this.baseSpeed = 7;
        this.speed = this.baseSpeed;
    }

    update(keys, speedMultiplier = 1) {
        this.speed = this.baseSpeed * speedMultiplier;
        if (keys.ArrowLeft && this.x > 0) {
            this.x -= this.speed;
        }
        if (keys.ArrowRight && this.x < this.canvas.width - this.width) {
            this.x += this.speed;
        }
    }

    draw(ctx) {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }
}

class FallingObject {
    constructor(canvas, image, type, gameSpeed) {
        this.canvas = canvas;
        this.image = image;
        this.type = type;
        this.width = 45;
        this.height = 45;
        this.x = Math.random() * (canvas.width - this.width);
        this.y = -this.height;
        this.baseSpeed = 3.5;
        this.speed = this.baseSpeed * gameSpeed;
    }

    update(gameSpeed) {
        this.speed = this.baseSpeed * gameSpeed;
        this.y += this.speed;
    }

    draw(ctx) {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }
}

class PartyPopper {
    constructor(canvas, x, y) {
        this.canvas = canvas;
        this.x = x;
        this.y = y;
        this.particles = [];
        this.gravity = 0.5;
        this.fade = 0.02;
        this.colors = ['#FFD700', '#FF6B6B', '#4CAF50', '#1E90FF', '#FF69B4'];
        this.createParticles();
    }

    createParticles() {
        for (let i = 0; i < 50; i++) {
            const angle = (Math.random() * Math.PI * 2);
            const speed = 2 + Math.random() * 6;
            this.particles.push({
                x: this.x,
                y: this.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 3 + Math.random() * 4,
                color: this.colors[Math.floor(Math.random() * this.colors.length)],
                opacity: 1
            });
        }
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vy += this.gravity;
            particle.opacity -= this.fade;

            if (particle.opacity <= 0) {
                this.particles.splice(i, 1);
            }
        }
        return this.particles.length > 0;
    }

    draw(ctx) {
        this.particles.forEach(particle => {
            ctx.save();
            ctx.globalAlpha = particle.opacity;
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.resizeCanvas();
        this.keys = remoteKeys; // Menerima input tombol dari HP via SignalR
        window.activeGame = this;
        this.loadAssets();
        this.partyPoppers = [];
        this.setupGame();
        this.setupEventListeners();
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        if (this.images) {
            this.images.background = this.createBackgroundImage();
        }
        if (this.player) {
            this.player.canvas = this.canvas;
            this.player.y = this.canvas.height - this.player.height - 15;
        }
    }

    createBackgroundImage() {
        const canvas = document.createElement('canvas');
        canvas.width = this.canvas.width;
        canvas.height = this.canvas.height;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#1a7bb5');
        gradient.addColorStop(0.4, '#63b4cf');
        gradient.addColorStop(0.7, '#a7d9e8');
        gradient.addColorStop(1, '#def3f8');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const drawCloud = (x, y, size) => {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.arc(x + size * 0.5, y - size * 0.2, size * 0.7, 0, Math.PI * 2);
            ctx.arc(x - size * 0.5, y, size * 0.6, 0, Math.PI * 2);
            ctx.fill();
        };

        for (let i = 0; i < 7; i++) {
            drawCloud(Math.random() * canvas.width, 50 + Math.random() * 150, 30 + Math.random() * 40);
        }

        const grassGradient = ctx.createLinearGradient(0, canvas.height - 100, 0, canvas.height);
        grassGradient.addColorStop(0, '#2d5a27');
        grassGradient.addColorStop(1, '#3d7a34');
        ctx.fillStyle = grassGradient;
        ctx.fillRect(0, canvas.height - 100, canvas.width, 100);

        for (let i = 0; i < canvas.width; i += 3) {
            const grassHeight = 10 + Math.random() * 15;
            ctx.strokeStyle = `rgb(${45 + Math.random() * 20}, ${90 + Math.random() * 30}, ${39 + Math.random() * 20})`;
            ctx.beginPath();
            ctx.moveTo(i, canvas.height - 95);
            ctx.lineTo(i, canvas.height - 95 - grassHeight);
            ctx.stroke();
        }

        const drawTree = (x, y, size) => {
            const trunkGradient = ctx.createLinearGradient(x - size/8, y, x + size/8, y);
            trunkGradient.addColorStop(0, '#5D4037');
            trunkGradient.addColorStop(0.5, '#795548');
            trunkGradient.addColorStop(1, '#5D4037');
            ctx.fillStyle = trunkGradient;
            ctx.fillRect(x - size/8, y - size/4, size/4, size/3);

            const treeColors = ['#0f5132', '#146B3A', '#165B33'];
            const layers = 3;
            const layerHeight = size / layers;

            for(let i = 0; i < layers; i++) {
                ctx.fillStyle = treeColors[i % treeColors.length];
                ctx.beginPath();
                ctx.moveTo(x - size * (0.8 - i * 0.2), y - size/4 - i * layerHeight);
                ctx.lineTo(x, y - size - i * layerHeight/2);
                ctx.lineTo(x + size * (0.8 - i * 0.2), y - size/4 - i * layerHeight);
                ctx.closePath();
                ctx.fill();
            }

            const ornamentColors = ['#ff0000', '#ffd700', '#ff69b4', '#4169e1', '#ffffff'];
            const addOrnament = (ornX, ornY, radius) => {
                ctx.fillStyle = ornamentColors[Math.floor(Math.random() * ornamentColors.length)];
                ctx.beginPath();
                ctx.arc(ornX, ornY, radius, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.beginPath();
                ctx.arc(ornX - radius/3, ornY - radius/3, radius/3, 0, Math.PI * 2);
                ctx.fill();
            };

            for(let layer = 0; layer < layers; layer++) {
                const layerY = y - size/4 - layer * layerHeight;
                const layerWidth = size * (1.6 - layer * 0.4);
                const ornamentCount = 3 + layer * 2;
                
                for(let j = 0; j < ornamentCount; j++) {
                    const ornX = x - layerWidth/2 + (layerWidth/(ornamentCount-1)) * j;
                    const ornY = layerY - layerHeight/2;
                    addOrnament(ornX, ornY, 5);
                }
            }

            const starX = x;
            const starY = y - size - layers * layerHeight/2;
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            for(let i = 0; i < 5; i++) {
                const angle = (i * 4 * Math.PI) / 5;
                const outerX = starX + Math.cos(angle) * 15;
                const outerY = starY + Math.sin(angle) * 15;
                const innerX = starX + Math.cos(angle + Math.PI/5) * 7;
                const innerY = starY + Math.sin(angle + Math.PI/5) * 7;
                
                if(i === 0) ctx.moveTo(outerX, outerY);
                else ctx.lineTo(outerX, outerY);
                ctx.lineTo(innerX, innerY);
            }
            ctx.closePath();
            ctx.fill();
        };

        const treeCount = Math.max(5, Math.floor(canvas.width / 160));
        for (let i = 0; i < treeCount; i++) {
            const x = (i + 0.5) * (canvas.width / treeCount) + Math.random() * 20 - 10;
            const y = canvas.height - 90;
            const size = 70 + Math.random() * 20;
            drawTree(x, y, size);
        }

        const drawSanta = (x, y, size) => {
            ctx.fillStyle = '#FFE0D1';
            ctx.beginPath();
            ctx.arc(x, y - size/2, size/4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#FF0000';
            ctx.beginPath();
            ctx.moveTo(x - size/3, y - size/2);
            ctx.quadraticCurveTo(x, y - size, x + size/3, y - size/2);
            ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(x - size/3, y - size/2, size/1.5, size/10);
            
            ctx.beginPath();
            ctx.arc(x + size/3, y - size/2, size/10, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(x, y - size/3, size/3, 0, Math.PI);
            ctx.fill();

            ctx.fillStyle = '#FF0000';
            ctx.beginPath();
            ctx.ellipse(x, y + size/4, size/2, size/1.5, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#000000';
            ctx.fillRect(x - size/2, y, size, size/10);
            
            ctx.fillStyle = '#FFD700';
            ctx.fillRect(x - size/8, y - size/40, size/4, size/8);

            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(x - size/8, y - size/2, size/20, 0, Math.PI * 2);
            ctx.arc(x + size/8, y - size/2, size/20, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#FF9999';
            ctx.beginPath();
            ctx.arc(x - size/5, y - size/3, size/15, 0, Math.PI * 2);
            ctx.arc(x + size/5, y - size/3, size/15, 0, Math.PI * 2);
            ctx.fill();
        };

        drawSanta(canvas.width * 0.85, canvas.height - 120, 80);

        const drawBush = (x, y, size) => {
            const bushColors = ['#2d5a27', '#3e7a3c', '#1a4314', '#4a8f48'];
            for (let i = 3; i >= 0; i--) {
                ctx.fillStyle = bushColors[i];
                ctx.beginPath();
                for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
                    const variance = (Math.random() * 0.3 + 0.7) * size;
                    const px = x + Math.cos(angle) * variance + i * 5;
                    const py = y + Math.sin(angle) * variance + i * 3;
                    if (angle === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
            }
        };

        const bushCount = Math.max(6, Math.floor(canvas.width / 120));
        for (let i = 0; i < bushCount; i++) {
            const x = i * (canvas.width / bushCount) + Math.random() * 20;
            const y = canvas.height - 60;
            const size = 25 + Math.random() * 15;
            drawBush(x, y, size);
        }

        const img = new Image();
        img.src = canvas.toDataURL();
        return img;
    }

    loadAssets() {
        const createBasketImage = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 80;
            canvas.height = 80;
            const ctx = canvas.getContext('2d');
            
            const handleColor = '#594300';
            const basketColor = '#FFD700';
            const shadowColor = '#594300';
            
            ctx.strokeStyle = handleColor;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(40, 25, 30, Math.PI, 2 * Math.PI, false);
            ctx.stroke();

            const basketHeight = 35;
            const basketTop = 35;
            
            ctx.strokeStyle = basketColor;
            ctx.lineWidth = 4;
            for (let y = basketTop; y < basketTop + basketHeight; y += 6) {
                ctx.beginPath();
                ctx.moveTo(5, y);
                ctx.bezierCurveTo(5, y + 3, 75, y + 3, 75, y);
                ctx.stroke();
            }

            ctx.lineWidth = 3;
            for (let x = -20; x < 80; x += 12) {
                ctx.beginPath();
                ctx.moveTo(x, basketTop);
                ctx.lineTo(x + 30, basketTop + basketHeight);
                ctx.stroke();
            }

            for (let x = 100; x > 0; x -= 12) {
                ctx.beginPath();
                ctx.moveTo(x, basketTop);
                ctx.lineTo(x - 30, basketTop + basketHeight);
                ctx.stroke();
            }

            ctx.strokeStyle = shadowColor;
            ctx.lineWidth = 1;
            for (let y = basketTop; y < basketTop + basketHeight; y += 6) {
                ctx.beginPath();
                ctx.moveTo(5, y + 2);
                ctx.bezierCurveTo(5, y + 5, 75, y + 5, 75, y + 2);
                ctx.stroke();
            }

            ctx.strokeStyle = handleColor;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(5, basketTop);
            ctx.bezierCurveTo(5, basketTop - 2, 75, basketTop - 2, 75, basketTop);
            ctx.stroke();

            const img = new Image();
            img.src = canvas.toDataURL();
            return img;
        };

        const createFruitImage = (type) => {
            const canvas = document.createElement('canvas');
            canvas.width = 45;
            canvas.height = 45;
            const ctx = canvas.getContext('2d');

            switch(type) {
                case 'strawberry':
                    ctx.fillStyle = '#FF3232';
                    ctx.beginPath();
                    ctx.arc(22, 28, 15, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.fillStyle = '#32CD32';
                    ctx.beginPath();
                    ctx.moveTo(22, 12);
                    ctx.lineTo(17, 18);
                    ctx.lineTo(22, 15);
                    ctx.lineTo(27, 18);
                    ctx.lineTo(22, 12);
                    ctx.fill();
                    
                    ctx.fillStyle = '#FFE135';
                    for(let i = 0; i < 8; i++) {
                        const angle = (i / 8) * Math.PI * 2;
                        const x = 22 + Math.cos(angle) * 8;
                        const y = 28 + Math.sin(angle) * 8;
                        ctx.beginPath();
                        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    break;

                case 'apple':
                    ctx.fillStyle = '#FF0000';
                    ctx.beginPath();
                    ctx.arc(22, 27, 16, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.fillStyle = '#32CD32';
                    ctx.beginPath();
                    ctx.moveTo(22, 11);
                    ctx.lineTo(27, 16);
                    ctx.lineTo(22, 13);
                    ctx.fill();
                    break;

                case 'orange':
                    ctx.fillStyle = '#FFA500';
                    ctx.beginPath();
                    ctx.arc(22, 22, 16, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.fillStyle = '#32CD32';
                    ctx.beginPath();
                    ctx.moveTo(22, 6);
                    ctx.lineTo(27, 11);
                    ctx.lineTo(22, 9);
                    ctx.fill();
                    break;

                case 'banana':
                    ctx.fillStyle = '#FFE135';
                    ctx.beginPath();
                    ctx.moveTo(12, 33);
                    ctx.quadraticCurveTo(22, 3, 33, 13);
                    ctx.quadraticCurveTo(28, 18, 18, 38);
                    ctx.fill();
                    break;

                case 'watermelon':
                    ctx.fillStyle = '#FF6B6B';
                    ctx.beginPath();
                    ctx.arc(22, 22, 16, 0, Math.PI);
                    ctx.fill();
                    
                    ctx.fillStyle = '#90EE90';
                    ctx.beginPath();
                    ctx.arc(22, 22, 16, Math.PI, Math.PI * 1.2);
                    ctx.arc(22, 22, 16, Math.PI * 0.8, Math.PI);
                    ctx.fill();
                    
                    ctx.fillStyle = '#000';
                    for(let i = 0; i < 5; i++) {
                        ctx.beginPath();
                        ctx.ellipse(16 + i * 5, 27 - (i % 2) * 5, 1.2, 2, Math.PI/4, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    break;
            }

            const img = new Image();
            img.src = canvas.toDataURL();
            return img;
        };

        const createBadObjectImage = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 45;
            canvas.height = 45;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(22, 27, 13, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#4A4A4A';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(22, 14);
            ctx.quadraticCurveTo(27, 9, 32, 11);
            ctx.stroke();

            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.moveTo(32, 11);
            ctx.lineTo(35, 8);
            ctx.lineTo(32, 5);
            ctx.lineTo(35, 2);
            ctx.lineTo(32, 1);
            ctx.lineTo(35, 4);
            ctx.lineTo(32, 7);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(17, 22, 3, 0, Math.PI * 2);
            ctx.fill();

            const img = new Image();
            img.src = canvas.toDataURL();
            return img;
        };

        this.fruitImages = [
            createFruitImage('strawberry'),
            createFruitImage('apple'),
            createFruitImage('orange'),
            createFruitImage('banana'),
            createFruitImage('watermelon')
        ];

        this.images = {
            background: this.createBackgroundImage(),
            player: createBasketImage(),
            badObject: createBadObjectImage()
        };

        const silentAudio = new Audio("data:audio/mp3;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV");

        this.sounds = {
            background: silentAudio,
            collect: silentAudio,
            collision: silentAudio
        };
        this.sounds.background.loop = true;
    }

    setupGame() {
        this.player = new Player(this.canvas, this.images.player);
        this.fallingObjects = [];
        this.score = 0;
        this.level = 1;
        this.fruitsCollected = 0;
        this.gameSpeed = 1;
        this.isPaused = false;
        this.isGameOver = false;
        this.playerName = 'Player';
        
        this.lastSpawn = 0;
        this.spawnInterval = 2000;
        this.player.y = this.canvas.height - this.player.height - 15;
    }

    updateDifficulty() {
        const baseSpeedMultiplier = 1 + (this.level - 1) * 0.2;
        const scoreMultiplier = Math.floor(this.score / 50) * 0.1;
        this.gameSpeed = Math.min(baseSpeedMultiplier + scoreMultiplier, 3.0);
        
        if (this.player) {
            this.player.update(this.keys, this.gameSpeed);
        }
        this.spawnInterval = Math.max(400, 2000 - (this.level - 1) * 200);
    }

    spawnObject() {
        if (Date.now() - this.lastSpawn > this.spawnInterval) {
            const objectType = Math.random() < 0.2 ? 'bad' : 'good';
            const object = new FallingObject(
                this.canvas,
                objectType === 'good' 
                    ? this.fruitImages[Math.floor(Math.random() * this.fruitImages.length)]
                    : this.images.badObject,
                objectType,
                this.gameSpeed
            );
            this.fallingObjects.push(object);
            this.lastSpawn = Date.now();
        }
    }

    update() {
        if (this.isPaused) return;

        this.updateDifficulty();
        this.spawnObject();
        this.partyPoppers = this.partyPoppers.filter(popper => popper.update());

        this.fallingObjects = this.fallingObjects.filter(obj => {
            obj.update(this.gameSpeed);
            
            if (this.checkCollision(this.player, obj)) {
                if (obj.type === 'good') {
                    this.score += 10;
                    this.fruitsCollected++;
                    
                    if (this.fruitsCollected >= 5) {
                        this.level++;
                        this.fruitsCollected = 0;
                        this.showLevelUpMessage();
                    }
                    this.sounds.collect.play();
                } else {
                    this.gameOver("You hit a bomb!");
                }
                return false;
            }
            
            if (obj.y + obj.height >= this.canvas.height) {
                if (obj.type === 'good') {
                    this.gameOver("A fruit hit the ground!");
                    return false;
                }
                return false;
            }
            
            return true;
        });
    }

    checkCollision(player, object) {
        return player.x < object.x + object.width &&
               player.x + player.width > object.x &&
               player.y < object.y + object.height &&
               player.y + player.height > object.y;
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.images.background) {
            this.ctx.drawImage(this.images.background, 0, 0, this.canvas.width, this.canvas.height);
        }
        this.player.draw(this.ctx);
        this.fallingObjects.forEach(obj => obj.draw(this.ctx));
        this.partyPoppers.forEach(popper => popper.draw(this.ctx));
        this.drawUI();
    }

    drawUI() {
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 3;
        this.ctx.font = 'bold 24px Arial';
        
        const nameText = `Player: ${this.playerName}`;
        const scoreText = `Score: ${this.score}`;
        const levelText = `Level: ${this.level}`;
        const fruitsText = `Fruits: ${this.fruitsCollected}/5`;
        
        this.ctx.strokeText(nameText, 25, 35);
        this.ctx.fillText(nameText, 25, 35);

        this.ctx.strokeText(scoreText, 25, 70);
        this.ctx.fillText(scoreText, 25, 70);
        
        this.ctx.strokeText(levelText, 25, 105);
        this.ctx.fillText(levelText, 25, 105);

        this.ctx.strokeText(fruitsText, 25, 140);
        this.ctx.fillText(fruitsText, 25, 140);
    }

    gameOver(message = "Game Over!") {
        this.isGameOver = true;
        this.sounds.background.pause();
        this.sounds.collision.play();
        
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
        document.getElementById('final-score').textContent = this.score;
        
        const messageElement = document.getElementById('game-over-message');
        if (messageElement) {
            messageElement.textContent = message;
        }
    }

    setupEventListeners() {
        // Fallback kontrol keyboard laptop (tetap bisa dites langsung dari PC)
        window.addEventListener('keydown', (e) => {
            if (remoteKeys.hasOwnProperty(e.key)) remoteKeys[e.key] = true;
        });
        
        window.addEventListener('keyup', (e) => {
            if (remoteKeys.hasOwnProperty(e.key)) remoteKeys[e.key] = false;
        });

        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });

        const pauseBtn = document.getElementById('pause-button');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                this.isPaused = !this.isPaused;
                if (this.isPaused) {
                    this.sounds.background.pause();
                } else {
                    this.sounds.background.play();
                }
            });
        }

        const restartBtn = document.getElementById('restart-button');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                document.getElementById('game-over-screen').classList.add('hidden');
                document.getElementById('start-screen').classList.remove('hidden');
                const statusEl = document.getElementById("lobby-status");
                if (statusEl) statusEl.textContent = "Menunggu pemain berikutnya...";
            });
        }
    }

    start() {
        this.setupGame();
        this.sounds.background.play().catch(() => {});
        this.gameLoop();
    }

    gameLoop() {
        if (!this.isGameOver) {
            this.update();
            this.draw();
            requestAnimationFrame(() => this.gameLoop());
        }
    }

    showLevelUpMessage() {
        const levelUpDiv = document.createElement('div');
        levelUpDiv.className = 'level-up-message';
        levelUpDiv.textContent = `Level ${this.level}!`;
        
        document.getElementById('game-screen').appendChild(levelUpDiv);

        if (this.level % 3 === 0) {
            for (let i = 0; i < 5; i++) {
                this.partyPoppers.push(new PartyPopper(
                    this.canvas,
                    Math.random() * this.canvas.width,
                    Math.random() * this.canvas.height
                ));
            }
        }

        setTimeout(() => {
            levelUpDiv.remove();
        }, 2000);
    }
}

window.onload = () => {
    new Game();
};