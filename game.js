// ==========================================
// 1. SETUP SIGNALR & KONTROL INPUT REMOTE
// ==========================================
const BACKEND_URL = "https://delighted-steam-impurity.ngrok-free.dev";

// Baca parameter durasi dari URL yang dikirim oleh OmniSign (Default 30 detik)
const urlParams = new URLSearchParams(window.location.search);
const TOTAL_DURATION_FROM_URL = parseInt(urlParams.get("duration")) || 30;

const connection = new signalR.HubConnectionBuilder()
    .withUrl(BACKEND_URL + "/hubs/game?ngrok-skip-browser-warning=true", {
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling
    })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Information)
    .build();

// Remote keys state
const remoteKeys = {
    ArrowLeft: false,
    ArrowRight: false,
    Space: false
};

function setStatus(elementId, text, color = null) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = text;
        if (color) el.style.color = color;
    }
}

// 1. Menerima pergerakan tombol dari HP (Hanya pemain aktif yang lolos dari backend)
connection.on("ReceiveMove", (param1, param2) => {
    if (typeof param1 === "string" && typeof param2 === "boolean") {
        if (remoteKeys.hasOwnProperty(param1)) {
            remoteKeys[param1] = param2;
        }
    } else if (typeof param1 === "string") {
        const action = param1;
        if (action === "left_down") remoteKeys.ArrowLeft = true;
        else if (action === "left_up") remoteKeys.ArrowLeft = false;
        else if (action === "right_down") remoteKeys.ArrowRight = true;
        else if (action === "right_up") remoteKeys.ArrowRight = false;
    }
});

// 2. Menerima giliran pemain aktif berikutnya dari backend
connection.on("GameStartForPlayer", (playerName) => {
    const overlay = document.getElementById("announcement-overlay");
    const title = document.getElementById("announcement-title");
    const sub = document.getElementById("announcement-sub");

    const startScreen = document.getElementById("start-screen");
    const gameScreen = document.getElementById("game-screen");
    const gameOverScreen = document.getElementById("game-over-screen");

    if (startScreen) startScreen.classList.add("hidden");
    if (gameOverScreen) gameOverScreen.classList.add("hidden");
    if (gameScreen) gameScreen.classList.remove("hidden");

    if (overlay) {
        overlay.classList.remove("hidden");
        if (title) title.textContent = `Giliran ${playerName}!`;
        if (sub) sub.textContent = "Bersiap mengendalikan keranjang dari HP...";
    }

    setTimeout(() => {
        if (overlay) overlay.classList.add("hidden");
        if (window.activeGame) {
            window.activeGame.playerName = playerName;
            window.activeGame.resizeCanvas();
            window.activeGame.start();
        }
    }, 2500);
});

// 3. Menerima sinyal ketika tidak ada pemain di antrean (Layar Standby)
connection.on("NoActivePlayer", () => {
    const startScreen = document.getElementById("start-screen");
    const gameScreen = document.getElementById("game-screen");
    const gameOverScreen = document.getElementById("game-over-screen");

    if (window.activeGame && window.activeGame.isGameOver) {
        return;
    }

    if (gameScreen) gameScreen.classList.add("hidden");
    if (gameOverScreen) gameOverScreen.classList.add("hidden");
    if (startScreen) startScreen.classList.remove("hidden");

    setStatus("lobby-status", "Antrean kosong. Silakan scan QR untuk bermain!");
});

// Jalankan koneksi SignalR
async function startSignalR() {
    try {
        await connection.start();
        console.log("SignalR Connected!");
        setStatus("status-text", "Terhubung ke Server!", "#4ade80");
        setStatus("connection-status", "SignalR Connected!", "#4ade80");
        await connection.invoke("RegisterScreen");
    } catch (err) {
        console.error("Gagal Konek SignalR:", err);
        setStatus("status-text", "Gagal terhubung ke server. Coba refresh.", "#f87171");
        setStatus("connection-status", "SignalR Disconnected", "#f87171");
    }
}

startSignalR();

// Render QR Code mengarah ke file controller.html (Statis, 1 QR untuk semua)
window.addEventListener("DOMContentLoaded", () => {
    const qrContainer = document.getElementById("qrcode");
    if (qrContainer) {
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
        this.width = 250;
        this.height = 230;
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - this.height - 100;
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
        this.width = 80;
        this.height = 80;
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
        this.keys = remoteKeys;
        window.activeGame = this;
        this.loadAssets();
        this.partyPoppers = [];
        this.setupGame();
        this.setupEventListeners();
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        if (this.player) {
            this.player.canvas = this.canvas;
            this.player.y = this.canvas.height - this.player.height - 15;
        }
    }

    loadAssets() {
        // 1. Gambar Background dari aset lokal
        const bgImg = new Image();
        bgImg.src = "assets/bg-catch-fruit.jpg";

        // 2. Gambar Keranjang Player dari aset lokal
        const basketImg = new Image();
        basketImg.src = "assets/keranjang-buah.png";

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
            background: bgImg,
            player: basketImg,
            badObject: createBadObjectImage()
        };
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

        // Setup Timer Dinamis dari URL OmniSign
        this.timeLeft = TOTAL_DURATION_FROM_URL;
        if (this.gameTimerInterval) clearInterval(this.gameTimerInterval);
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
                } else {
                    this.gameOver("Menabrak Bom!");
                }
                return false;
            }
            
            if (obj.y + obj.height >= this.canvas.height) {
                if (obj.type === 'good') {
                    this.gameOver("Buah Terjatuh!");
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
        
        // Render Gambar Background
        if (this.images.background && this.images.background.complete) {
            this.ctx.drawImage(this.images.background, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            // Fallback warna biru jika gambar masih proses loading
            this.ctx.fillStyle = '#1a7bb5';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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
        const timeText = `Time: ${this.timeLeft}s`;
        const levelText = `Level: ${this.level}`;
        const fruitsText = `Fruits: ${this.fruitsCollected}/5`;
        
        this.ctx.strokeText(nameText, 25, 35);
        this.ctx.fillText(nameText, 25, 35);

        this.ctx.strokeText(scoreText, 25, 70);
        this.ctx.fillText(scoreText, 25, 70);
        
        this.ctx.strokeText(timeText, 25, 105);
        this.ctx.fillText(timeText, 25, 105);

        this.ctx.strokeText(levelText, 25, 140);
        this.ctx.fillText(levelText, 25, 140);

        this.ctx.strokeText(fruitsText, 25, 175);
        this.ctx.fillText(fruitsText, 25, 175);
    }

   gameOver(message = "Game Over!") {
        if (this.isGameOver) return;
        this.isGameOver = true;
        
        if (this.gameTimerInterval) clearInterval(this.gameTimerInterval);
        
        const startScreen = document.getElementById('start-screen');
        const gameScreen = document.getElementById('game-screen');
        const gameOverScreen = document.getElementById('game-over-screen');

        // Sembunyikan gameplay & lobby
        if (startScreen) startScreen.classList.add('hidden');
        if (gameScreen) gameScreen.classList.add('hidden');
        
        // Tampilkan pop-up skor Game Over di videotron
        if (gameOverScreen) gameOverScreen.classList.remove('hidden');
        document.getElementById('final-score').textContent = this.score;
        
        const messageElement = document.getElementById('game-over-message');
        if (messageElement) {
            messageElement.textContent = `Pemain ${this.playerName} Selesai! (${message})`;
        }

        // 1. KIRIM LANGSUNG KE BACKEND (HP langsung realtime berubah ke menu Main Lagi/Keluar)
        if (connection.state === signalR.HubConnectionState.Connected) {
            connection.invoke("TriggerGameOver", message)
                .catch(err => console.error("Error trigger game over:", err));
        }

        // 2. Beri waktu 3.5 detik untuk penonton melihat skor di layar videotron
        setTimeout(() => {
            // Tutup pop-up Game Over
            if (gameOverScreen) gameOverScreen.classList.add('hidden');

            // Reset flag agar NoActivePlayer tidak terblokir
            this.isGameOver = false;

            // Kembalikan videotron ke layar QR awal (jika belum ada antrean berikutnya)
            if (startScreen) {
                startScreen.classList.remove('hidden');
                setStatus("lobby-status", "Antrean selesai. Silakan scan QR untuk bermain!");
            }
        }, 3500);
    }
    setupEventListeners() {
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
            });
        }
    }

    start() {
        this.setupGame();

        this.gameTimerInterval = setInterval(() => {
            if (!this.isPaused && !this.isGameOver) {
                this.timeLeft--;
                if (this.timeLeft <= 0) {
                    this.gameOver("Waktu Habis!");
                }
            }
        }, 1000);

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
