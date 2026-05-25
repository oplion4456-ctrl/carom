// AntiGravity Carrom - Web Application Controller & Renderer

class CarromGame {
    constructor() {
        this.canvas = document.getElementById('carromCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.boardSize = this.canvas.width;

        // Configurations
        this.pocketRadius = 26;
        this.coinRadius = 13;
        this.strikerRadius = 18;
        this.coinMass = 5.5;
        this.strikerMass = 15;

        // Gameplay states
        this.gameState = 'POSITIONING'; // 'POSITIONING' | 'AIMING' | 'SIMULATING' | 'EVALUATING' | 'GAME_OVER'
        this.activePlayer = 'WHITE'; // 'WHITE' | 'BLACK'

        // Baseline boundaries (Bottom player baseline)
        this.baselineY = this.boardSize * 0.82;
        this.baselineMinX = this.boardSize * 0.16;
        this.baselineMaxX = this.boardSize * 0.84;

        // Scores
        this.whiteScore = 0;
        this.blackScore = 0;

        // Queen cover rule trackers
        this.queenPocketedThisTurn = false;
        this.queenWaitingForCover = false;
        this.queenOwner = null;

        // Turn scoring tracking
        this.pocketedThisTurn = [];
        this.strikerPocketedThisTurn = false;

        // Interactive dragging values
        this.isAimDragging = false;
        this.dragStart = new Vector2D();
        this.dragCurrent = new Vector2D();
        this.maxDragDistance = 120;
        this.forceMultiplier = 60; // Slingshot force multiplier

        // Initialize Physics World
        this.physicsWorld = new PhysicsWorld(
            this.boardSize,
            this.pocketRadius,
            this.handlePocketTriggered.bind(this),
            this.handleCollision.bind(this)
        );

        this.striker = null;
        this.coins = [];

        // Bind events
        this.setupInputListeners();
        this.resetBoard();

        // Start animation frame
        this.lastTime = performance.now();
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    resetBoard() {
        this.physicsWorld.bodies = [];
        this.coins = [];
        this.pocketedThisTurn = [];
        this.strikerPocketedThisTurn = false;
        this.queenPocketedThisTurn = false;

        // Spawn Striker at bottom center
        this.striker = new RigidBody2D('STRIKER', this.strikerRadius, this.strikerMass, this.boardSize / 2, this.baselineY);
        this.physicsWorld.addBody(this.striker);

        // Spawn Queen at center
        const centerX = this.boardSize / 2;
        const centerY = this.boardSize / 2;
        const queen = new RigidBody2D('QUEEN', this.coinRadius, this.coinMass, centerX, centerY);
        this.coins.push(queen);
        this.physicsWorld.addBody(queen);

        // Ring formation (6 White, 6 Black alternating)
        const ringCount = 12;
        const radiusOffset = this.coinRadius * 2 + 1; // spacing
        for (let i = 0; i < ringCount; i++) {
            const angle = (i * 2 * Math.PI) / ringCount;
            const cx = centerX + radiusOffset * Math.cos(angle);
            const cy = centerY + radiusOffset * Math.sin(angle);
            const type = i % 2 === 0 ? 'WHITE_COIN' : 'BLACK_COIN';
            
            const coin = new RigidBody2D(type, this.coinRadius, this.coinMass, cx, cy);
            this.coins.push(coin);
            this.physicsWorld.addBody(coin);
        }

        this.gameState = 'POSITIONING';
        this.updateUI();
    }

    setupInputListeners() {
        // Event helper for mouse & touch coordinates
        const getCoordinates = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: (clientX - rect.left) * (this.canvas.width / rect.width),
                y: (clientY - rect.top) * (this.canvas.height / rect.height)
            };
        };

        const handleDown = (e) => {
            sounds.init(); // lazy init
            const coords = getCoordinates(e);

            if (this.gameState === 'POSITIONING') {
                // Confirm position and proceed to Aiming on click
                this.updatePositioning(coords.x);
                this.gameState = 'AIMING';
                this.updateUI();
            } else if (this.gameState === 'AIMING') {
                // Check click near striker to begin drag vector
                const dx = coords.x - this.striker.position.x;
                const dy = coords.y - this.striker.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Allow starting drag anywhere inside board, centering from the striker
                this.isAimDragging = true;
                this.dragStart.set(this.striker.position.x, this.striker.position.y);
                this.dragCurrent.set(coords.x, coords.y);
            }
        };

        const handleMove = (e) => {
            const coords = getCoordinates(e);

            if (this.gameState === 'POSITIONING') {
                this.updatePositioning(coords.x);
            } else if (this.gameState === 'AIMING' && this.isAimDragging) {
                this.dragCurrent.set(coords.x, coords.y);
            }
        };

        const handleUp = () => {
            if (this.gameState === 'AIMING' && this.isAimDragging) {
                this.isAimDragging = false;
                
                // Calculate shot vector (opposite of drag direction)
                const aimDir = this.dragStart.copy().subtract(this.dragCurrent);
                let distance = aimDir.length();

                if (distance > this.maxDragDistance) {
                    distance = this.maxDragDistance;
                }

                if (distance > 10) { // minimum release distance to trigger shot
                    aimDir.normalize();
                    const force = (distance / this.maxDragDistance) * this.forceMultiplier;
                    const impulse = aimDir.multiply(force);

                    this.striker.velocity.clear();
                    this.striker.applyImpulse(impulse);

                    this.gameState = 'SIMULATING';
                    this.pocketedThisTurn = [];
                    this.strikerPocketedThisTurn = false;
                    this.queenPocketedThisTurn = false;
                    this.updateUI();
                }
            }
        };

        // Mouse listeners
        this.canvas.addEventListener('mousedown', handleDown);
        this.canvas.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);

        // Touch listeners
        this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleDown(e); });
        this.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); handleMove(e); });
        window.addEventListener('touchend', handleUp);

        // Restart
        document.getElementById('restartBtn').addEventListener('click', () => {
            this.whiteScore = 0;
            this.blackScore = 0;
            this.queenWaitingForCover = false;
            this.queenOwner = null;
            this.resetBoard();
        });
    }

    updatePositioning(x) {
        const clampedX = Math.max(this.baselineMinX, Math.min(this.baselineMaxX, x));
        this.striker.position.x = clampedX;
        this.striker.position.y = this.baselineY;
        this.striker.velocity.clear();
    }

    handlePocketTriggered(body, pocketIndex) {
        sounds.playPocketSink();
        if (body.type === 'STRIKER') {
            this.strikerPocketedThisTurn = true;
        } else {
            this.pocketedThisTurn.push(body.type);
            if (body.type === 'QUEEN') {
                this.queenPocketedThisTurn = true;
            }
        }
    }

    handleCollision(bodyA, bodyB, speed) {
        if (!bodyB) {
            sounds.playWallThud(speed);
        } else {
            sounds.playClack(speed);
        }
    }

    animate(now) {
        const dt = Math.min((now - this.lastTime) / 1000, 0.03); // cap dt to prevent clipping
        this.lastTime = now;

        if (this.gameState === 'SIMULATING') {
            this.physicsWorld.step(dt);

            // Turn evaluation once all objects are stationary
            if (this.areAllBodiesStationary()) {
                this.gameState = 'EVALUATING';
                this.evaluateTurnOutcome();
            }
        }

        this.render();
        requestAnimationFrame(this.animate);
    }

    areAllBodiesStationary() {
        for (const body of this.physicsWorld.bodies) {
            if (body.isPocketed) continue;
            if (body.velocity.lengthSquared() > 0) return false;
        }
        return true;
    }

    evaluateTurnOutcome() {
        let switchTurn = true;

        if (this.strikerPocketedThisTurn) {
            this.handleFoulStrikerSunk();
            this.finalizeTurn(true);
            return;
        }

        const whitesPocketed = this.pocketedThisTurn.filter(t => t === 'WHITE_COIN').length;
        const blacksPocketed = this.pocketedThisTurn.filter(t => t === 'BLACK_COIN').length;

        if (this.queenWaitingForCover) {
            const didCover = this.activePlayer === 'WHITE' ? whitesPocketed > 0 : blacksPocketed > 0;
            if (didCover) {
                this.queenWaitingForCover = false;
                this.queenOwner = this.activePlayer;
                if (this.activePlayer === 'WHITE') this.whiteScore += 3; else this.blackScore += 3;
                switchTurn = false;
            } else {
                this.queenWaitingForCover = false;
                this.respawnQueen();
                const scoredOwn = this.activePlayer === 'WHITE' ? whitesPocketed > 0 : blacksPocketed > 0;
                switchTurn = !scoredOwn;
            }
        } else if (this.queenPocketedThisTurn) {
            this.queenWaitingForCover = true;
            const hasImmediateCover = this.activePlayer === 'WHITE' ? whitesPocketed > 0 : blacksPocketed > 0;
            if (hasImmediateCover) {
                this.queenWaitingForCover = false;
                this.queenOwner = this.activePlayer;
                if (this.activePlayer === 'WHITE') this.whiteScore += 3; else this.blackScore += 3;
                switchTurn = false;
            } else {
                switchTurn = false; // keep turn to attempt cover on next shot
            }
        } else {
            // Standard Scoring
            if (this.activePlayer === 'WHITE') {
                if (whitesPocketed > 0) {
                    this.whiteScore += whitesPocketed;
                    switchTurn = false;
                }
            } else {
                if (blacksPocketed > 0) {
                    this.blackScore += blacksPocketed;
                    switchTurn = false;
                }
            }
        }

        this.finalizeTurn(switchTurn);
    }

    handleFoulStrikerSunk() {
        if (this.activePlayer === 'WHITE' && this.whiteScore > 0) {
            this.whiteScore--;
            this.respawnCoin('WHITE_COIN');
        } else if (this.activePlayer === 'BLACK' && this.blackScore > 0) {
            this.blackScore--;
            this.respawnCoin('BLACK_COIN');
        }
    }

    respawnQueen() {
        const queen = this.physicsWorld.bodies.find(b => b.type === 'QUEEN');
        if (queen) {
            queen.isPocketed = false;
            queen.position.set(this.boardSize / 2, this.boardSize / 2);
            queen.velocity.clear();
        }
    }

    respawnCoin(type) {
        const coin = this.physicsWorld.bodies.find(b => b.type === type && b.isPocketed);
        if (coin) {
            coin.isPocketed = false;
            // Respawn with tiny random offset to prevent direct stack overlays
            coin.position.set(
                this.boardSize / 2 + (Math.random() * 10 - 5),
                this.boardSize / 2 + (Math.random() * 10 - 5)
            );
            coin.velocity.clear();
        }
    }

    finalizeTurn(switchTurn) {
        // Reset striker position
        this.striker.isPocketed = false;
        this.striker.position.set(this.boardSize / 2, this.baselineY);
        this.striker.velocity.clear();

        if (switchTurn) {
            this.activePlayer = this.activePlayer === 'WHITE' ? 'BLACK' : 'WHITE';
        }

        // Verify remaining coins
        const remainingCoins = this.coins.filter(c => !c.isPocketed && c.type !== 'QUEEN').length;
        if (remainingCoins === 0) {
            this.gameState = 'GAME_OVER';
        } else {
            this.gameState = 'POSITIONING';
        }

        this.updateUI();
    }

    updateUI() {
        document.getElementById('gameStateBadge').innerText = this.gameState;
        document.getElementById('activePlayerDisplay').innerText = `${this.activePlayer} Player`;
        document.getElementById('activePlayerDisplay').style.color = this.activePlayer === 'WHITE' ? '#FFF' : '#FFD54F';

        document.getElementById('whiteScoreVal').innerText = this.whiteScore;
        document.getElementById('blackScoreVal').innerText = this.blackScore;

        // Toggle active row styles
        if (this.activePlayer === 'WHITE') {
            document.getElementById('whiteScoreRow').classList.add('active-player');
            document.getElementById('blackScoreRow').classList.remove('active-player');
        } else {
            document.getElementById('blackScoreRow').classList.add('active-player');
            document.getElementById('whiteScoreRow').classList.remove('active-player');
        }

        // Queen cover status warning block
        const statusBox = document.getElementById('queenStatusBox');
        if (this.queenWaitingForCover) {
            statusBox.style.display = 'flex';
            document.getElementById('queenStatusText').innerText = 'Queen Pocketed! Score a coin to cover.';
        } else {
            statusBox.style.display = 'none';
        }

        if (this.gameState === 'GAME_OVER') {
            const winner = this.whiteScore > this.blackScore ? 'WHITE' : 'BLACK';
            alert(`GAME OVER! ${winner} is victorious!`);
        }
    }

    render() {
        this.ctx.clearRect(0, 0, this.boardSize, this.boardSize);

        // 1. Draw elegant wooden board pattern
        this.ctx.fillStyle = '#E3B994'; // Warm maple color
        this.ctx.fillRect(0, 0, this.boardSize, this.boardSize);

        // Subtle wooden radial shadow
        const shadowGrad = this.ctx.createRadialGradient(
            this.boardSize / 2, this.boardSize / 2, 50,
            this.boardSize / 2, this.boardSize / 2, this.boardSize * 0.7
        );
        shadowGrad.addColorStop(0, 'rgba(239, 199, 161, 0.4)');
        shadowGrad.addColorStop(1, 'rgba(161, 108, 77, 0.45)');
        this.ctx.fillStyle = shadowGrad;
        this.ctx.fillRect(0, 0, this.boardSize, this.boardSize);

        // 2. Draw outer boundary lines
        this.ctx.strokeStyle = '#5c3e35';
        this.ctx.lineWidth = 4;
        const outerOffset = 50;
        this.ctx.strokeRect(outerOffset, outerOffset, this.boardSize - outerOffset * 2, this.boardSize - outerOffset * 2);

        // 3. Draw standard concentric center rings
        const cx = this.boardSize / 2;
        const cy = this.boardSize / 2;
        
        this.ctx.strokeStyle = 'rgba(139, 69, 19, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 60, 0, 2 * Math.PI);
        this.ctx.stroke();

        this.ctx.strokeStyle = 'rgba(213, 0, 0, 0.5)'; // Crimson center
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 18, 0, 2 * Math.PI);
        this.ctx.stroke();

        // 4. Draw Baselines on all 4 sides
        this.ctx.strokeStyle = 'rgba(139, 69, 19, 0.6)';
        this.ctx.lineWidth = 2;
        
        // Draw baseline offsets
        const baselineOffset = this.boardSize * 0.18;
        const baseMin = this.baselineMinX;
        const baseMax = this.baselineMaxX;

        // Bottom
        this.drawBaselineLines(baseMin, baseMax, this.baselineY);
        // Top
        this.drawBaselineLines(baseMin, baseMax, this.boardSize - this.baselineY);
        // Left
        this.drawBaselineLinesVertical(this.baselineY, this.boardSize - this.baselineY, this.boardSize - this.baselineY);
        // Right
        this.drawBaselineLinesVertical(this.baselineY, this.boardSize - this.baselineY, this.baselineY);

        // 5. Draw deep dark Pockets
        this.physicsWorld.pockets.forEach(pocket => {
            // Shadow drop for depth
            this.ctx.fillStyle = '#111';
            this.ctx.beginPath();
            this.ctx.arc(pocket.x, pocket.y, this.pocketRadius, 0, 2 * Math.PI);
            this.ctx.fill();

            // Pocket rim line
            this.ctx.strokeStyle = '#4a2f27';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.arc(pocket.x, pocket.y, this.pocketRadius, 0, 2 * Math.PI);
            this.ctx.stroke();
        });

        // 6. Draw game pieces
        this.physicsWorld.bodies.forEach(body => {
            if (body.isPocketed) return;

            // Draw clean dynamic shadows
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            this.ctx.beginPath();
            this.ctx.arc(body.position.x + 3, body.position.y + 4, body.radius, 0, 2 * Math.PI);
            this.ctx.fill();

            // Draw coin body
            const grad = this.ctx.createRadialGradient(
                body.position.x - body.radius * 0.3,
                body.position.y - body.radius * 0.3,
                1,
                body.position.x,
                body.position.y,
                body.radius
            );

            if (body.type === 'STRIKER') {
                grad.addColorStop(0, '#A9FFD2');
                grad.addColorStop(0.3, '#00E676'); // Glow neon green
                grad.addColorStop(1, '#009640');
                this.ctx.fillStyle = grad;
                this.ctx.strokeStyle = '#004D20';
            } else if (body.type === 'WHITE_COIN') {
                grad.addColorStop(0, '#FFFFFF');
                grad.addColorStop(0.7, '#ECEFF1');
                grad.addColorStop(1, '#B0BEC5'); // Sleek ivory
                this.ctx.fillStyle = grad;
                this.ctx.strokeStyle = '#78909C';
            } else if (body.type === 'BLACK_COIN') {
                grad.addColorStop(0, '#5D4037');
                grad.addColorStop(0.6, '#3E2723');
                grad.addColorStop(1, '#1A0C08'); // Charcoal
                this.ctx.fillStyle = grad;
                this.ctx.strokeStyle = '#000000';
            } else if (body.type === 'QUEEN') {
                grad.addColorStop(0, '#FF8A80');
                grad.addColorStop(0.3, '#FF1744'); // Vibrant ruby red
                grad.addColorStop(1, '#B71C1C');
                this.ctx.fillStyle = grad;
                this.ctx.strokeStyle = '#5F0909';
            }

            this.ctx.beginPath();
            this.ctx.arc(body.position.x, body.position.y, body.radius, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.lineWidth = 1.5;
            this.ctx.stroke();

            // Internal concentric styling rings to look like real carrom men
            this.ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            if (body.type === 'WHITE_COIN') this.ctx.strokeStyle = 'rgba(0,0,0,0.08)';
            this.ctx.beginPath();
            this.ctx.arc(body.position.x, body.position.y, body.radius * 0.5, 0, 2 * Math.PI);
            this.ctx.stroke();
        });

        // 7. Render Aiming Vector Dotted Line
        if (this.gameState === 'AIMING' && this.isAimDragging) {
            const start = this.striker.position;
            const aimDir = this.dragStart.copy().subtract(this.dragCurrent);
            let dist = aimDir.length();

            if (dist > this.maxDragDistance) {
                dist = this.maxDragDistance;
            }

            if (dist > 10) {
                aimDir.normalize();

                // Draw aiming guideline (projected forward)
                const endX = start.x + aimDir.x * dist * 2.5;
                const endY = start.y + aimDir.y * dist * 2.5;

                this.ctx.save();
                this.ctx.strokeStyle = '#FF3D00'; // neon red line
                this.ctx.lineWidth = 3;
                this.ctx.setLineDash([5, 5]);
                this.ctx.shadowColor = '#FF3D00';
                this.ctx.shadowBlur = 8;
                this.ctx.beginPath();
                this.ctx.moveTo(start.x, start.y);
                this.ctx.lineTo(endX, endY);
                this.ctx.stroke();
                this.ctx.restore();

                // Draw slingshot pulling rubber band (pulling back)
                this.ctx.save();
                this.ctx.strokeStyle = 'rgba(255, 213, 79, 0.7)'; // neon yellow
                this.ctx.lineWidth = 2.5;
                this.ctx.beginPath();
                this.ctx.moveTo(start.x, start.y);
                const clampCurrentX = start.x - aimDir.x * dist;
                const clampCurrentY = start.y - aimDir.y * dist;
                this.ctx.lineTo(clampCurrentX, clampCurrentY);
                this.ctx.stroke();

                // Draw small finger drag node
                this.ctx.fillStyle = '#FFD54F';
                this.ctx.beginPath();
                this.ctx.arc(clampCurrentX, clampCurrentY, 6, 0, 2 * Math.PI);
                this.ctx.fill();
                this.ctx.restore();
            }
        }
    }

    drawBaselineLines(minX, maxX, y) {
        this.ctx.beginPath();
        this.ctx.moveTo(minX, y);
        this.ctx.lineTo(maxX, y);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(minX, y, 6, 0, 2 * Math.PI);
        this.ctx.arc(maxX, y, 6, 0, 2 * Math.PI);
        this.ctx.fillStyle = 'rgba(213,0,0,0.6)';
        this.ctx.fill();
    }

    drawBaselineLinesVertical(minY, maxY, x) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, minY);
        this.ctx.lineTo(x, maxY);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(x, minY, 6, 0, 2 * Math.PI);
        this.ctx.arc(x, maxY, 6, 0, 2 * Math.PI);
        this.ctx.fillStyle = 'rgba(213,0,0,0.6)';
        this.ctx.fill();
    }
}

// Start game instance on load
window.addEventListener('DOMContentLoaded', () => {
    window.game = new CarromGame();
});
