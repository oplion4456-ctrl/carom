// AntiGravity Carrom - Web Application Controller & Renderer
// Procedural Hardwood Championship Theme & Friction Physics Interface

class CarromGame {
    constructor() {
        this.canvas = document.getElementById('carromCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.boardSize = this.canvas.width;

        // Championship parameters
        this.pocketRadius = 26;
        this.coinRadius = 13;
        this.strikerRadius = 19; // striker is larger
        this.coinMass = 5.5;
        this.strikerMass = 15.0; // ~3x heavier for energetic breaks

        // Physics world init
        this.physicsWorld = new PhysicsWorld(
            this.boardSize,
            this.pocketRadius,
            this.handlePocketTriggered.bind(this),
            this.handleCollision.bind(this)
        );

        this.gameState = 'POSITIONING'; // 'POSITIONING' | 'SIMULATING' | 'EVALUATING' | 'GAME_OVER'
        this.activePlayer = 'WHITE'; // 'WHITE' | 'BLACK'

        // Bottom baseline coordinates
        this.baselineY = this.boardSize * 0.82;
        this.baselineMinX = this.boardSize * 0.16;
        this.baselineMaxX = this.boardSize * 0.84;

        // Interactive dragging values for Slingshot Aiming
        this.isAimDragging = false;
        this.dragStart = new Vector2D();
        this.dragCurrent = new Vector2D();
        this.maxDragDistance = 130;
        this.forceMultiplier = 75; // Power adjustment

        // Scores
        this.whiteScore = 0;
        this.blackScore = 0;

        // Queen cover rule metrics
        this.queenPocketedThisTurn = false;
        this.queenWaitingForCover = false;
        this.queenOwner = null;

        // Turn metrics
        this.pocketedThisTurn = [];
        this.strikerPocketedThisTurn = false;

        this.striker = null;
        this.coins = [];

        // Procedural wood grain parameters (generated once for persistence)
        this.generateWoodGrains();

        this.setupSlider();
        this.setupInputListeners();
        this.resetBoard();

        // Start render ticker
        this.lastTime = performance.now();
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    /**
     * Generates random curves and speckles to procedurally draw highly realistic wood grain.
     */
    generateWoodGrains() {
        this.woodGrains = [];
        // Concentric timber ring arcs
        for (let i = 0; i < 8; i++) {
            const rx = this.boardSize * (0.1 + Math.random() * 0.8);
            const ry = this.boardSize * (1.1 + Math.random() * 0.4);
            const radius = this.boardSize * (0.8 + Math.random() * 0.6);
            const startAngle = Math.PI * 1.0;
            const endAngle = Math.PI * 2.0;
            const opacity = 0.02 + Math.random() * 0.025;
            this.woodGrains.push({ type: 'arc', rx, ry, radius, startAngle, endAngle, opacity });
        }
        // Micro wood-pore grain lines
        this.woodPores = [];
        for (let i = 0; i < 400; i++) {
            const x = Math.random() * this.boardSize;
            const y = Math.random() * this.boardSize;
            const length = 5 + Math.random() * 15;
            const angleOffset = (Math.random() - 0.5) * 0.08; // slightly aligned
            this.woodPores.push({ x, y, length, angleOffset });
        }
    }

    resetBoard() {
        this.physicsWorld.bodies = [];
        this.coins = [];
        this.pocketedThisTurn = [];
        this.strikerPocketedThisTurn = false;
        this.queenPocketedThisTurn = false;

        // Striker
        this.striker = new RigidBody2D('STRIKER', this.strikerRadius, this.strikerMass, this.boardSize / 2, this.baselineY);
        this.physicsWorld.addBody(this.striker);

        // Queen at center
        const centerX = this.boardSize / 2;
        const centerY = this.boardSize / 2;
        const queen = new RigidBody2D('QUEEN', this.coinRadius, this.coinMass, centerX, centerY);
        this.coins.push(queen);
        this.physicsWorld.addBody(queen);

        // Coins (Alternating White and Black in circular grid)
        const ringCount = 12;
        const ringRadius = this.coinRadius * 2 + 1; // standard alignment
        for (let i = 0; i < ringCount; i++) {
            const angle = (i * 2 * Math.PI) / ringCount;
            const cx = centerX + ringRadius * Math.cos(angle);
            const cy = centerY + ringRadius * Math.sin(angle);
            const type = i % 2 === 0 ? 'WHITE_COIN' : 'BLACK_COIN';
            
            const coin = new RigidBody2D(type, this.coinRadius, this.coinMass, cx, cy);
            this.coins.push(coin);
            this.physicsWorld.addBody(coin);
        }

        // Align the range slider input to center
        document.getElementById('strikerSlider').value = 50;

        this.gameState = 'POSITIONING';
        this.updateUI();
    }

    setupSlider() {
        const slider = document.getElementById('strikerSlider');
        
        // Horizontal baseline slide positioning
        const updateFromSlider = () => {
            if (this.gameState === 'POSITIONING') {
                const val = parseFloat(slider.value) / 100;
                const range = this.baselineMaxX - this.baselineMinX;
                const newX = this.baselineMinX + range * val;
                
                this.striker.position.x = newX;
                this.striker.position.y = this.baselineY;
                this.striker.velocity.clear();
            }
        };

        slider.addEventListener('input', updateFromSlider);
    }

    setupInputListeners() {
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
            sounds.resume();
            const coords = getCoordinates(e);

            if (this.gameState === 'POSITIONING') {
                // If clicked directly near the striker, start aiming instantly
                const dx = coords.x - this.striker.position.x;
                const dy = coords.y - this.striker.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Allow a generous tap boundary around the striker to pull back
                if (dist < this.strikerRadius * 2.2) {
                    this.isAimDragging = true;
                    this.dragStart.set(this.striker.position.x, this.striker.position.y);
                    this.dragCurrent.set(coords.x, coords.y);
                    
                    // Visual update
                    document.getElementById('gameStateBadge').innerText = 'Aiming';
                    document.getElementById('gameStateBadge').style.borderColor = 'var(--gold)';
                    document.getElementById('gameStateBadge').style.color = 'var(--gold)';
                }
            }
        };

        const handleMove = (e) => {
            if (this.isAimDragging) {
                const coords = getCoordinates(e);
                this.dragCurrent.set(coords.x, coords.y);
            }
        };

        const handleUp = () => {
            if (this.isAimDragging) {
                this.isAimDragging = false;
                
                const aimDir = this.dragStart.copy().subtract(this.dragCurrent);
                let distance = aimDir.length();

                if (distance > this.maxDragDistance) {
                    distance = this.maxDragDistance;
                }

                if (distance > 12) { // release trigger threshold
                    aimDir.normalize();
                    const force = (distance / this.maxDragDistance) * this.forceMultiplier;
                    const impulse = aimDir.multiply(force);

                    this.striker.velocity.clear();
                    this.striker.applyImpulse(impulse);

                    this.gameState = 'SIMULATING';
                    this.pocketedThisTurn = [];
                    this.strikerPocketedThisTurn = false;
                    this.queenPocketedThisTurn = false;
                } else {
                    // return back to positioning if pull was negligible
                    this.gameState = 'POSITIONING';
                }
                this.updateUI();
            }
        };

        this.canvas.addEventListener('mousedown', handleDown);
        this.canvas.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);

        this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleDown(e); });
        this.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); handleMove(e); });
        window.addEventListener('touchend', handleUp);
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
        const dt = Math.min((now - this.lastTime) / 1000, 0.02); // locked step to prevent wall tunneling
        this.lastTime = now;

        if (this.gameState === 'SIMULATING') {
            this.physicsWorld.step(dt);

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
            // Standard scoring rule
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
            coin.position.set(
                this.boardSize / 2 + (Math.random() * 14 - 7),
                this.boardSize / 2 + (Math.random() * 14 - 7)
            );
            coin.velocity.clear();
        }
    }

    finalizeTurn(switchTurn) {
        this.striker.isPocketed = false;
        this.striker.position.set(this.boardSize / 2, this.baselineY);
        this.striker.velocity.clear();

        if (switchTurn) {
            this.activePlayer = this.activePlayer === 'WHITE' ? 'BLACK' : 'WHITE';
        }

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
        
        // Reset border badge styling
        document.getElementById('gameStateBadge').style.borderColor = 'rgba(255, 110, 64, 0.25)';
        document.getElementById('gameStateBadge').style.color = '#FF7043';

        document.getElementById('activePlayerDisplay').innerText = `${this.activePlayer} Player`;
        
        const turnDot = document.getElementById('turnIndicatorDot');
        if (this.activePlayer === 'WHITE') {
            document.getElementById('whiteScoreDisplay');
            document.getElementById('whiteScoreRow').classList.add('active-player');
            document.getElementById('blackScoreRow').classList.remove('active-player');
            
            turnDot.style.background = '#FFFFFF';
            turnDot.style.boxShadow = '0 0 12px #FFFFFF';
            document.getElementById('activePlayerDisplay').style.color = '#FFFFFF';
        } else {
            document.getElementById('blackScoreRow').classList.add('active-player');
            document.getElementById('whiteScoreRow').classList.remove('active-player');
            
            turnDot.style.background = 'var(--gold)';
            turnDot.style.boxShadow = '0 0 12px var(--gold)';
            document.getElementById('activePlayerDisplay').style.color = 'var(--gold)';
        }

        document.getElementById('whiteScoreVal').innerText = this.whiteScore;
        document.getElementById('blackScoreVal').innerText = this.blackScore;

        const statusBox = document.getElementById('queenStatusBox');
        if (this.queenWaitingForCover) {
            statusBox.style.display = 'flex';
            document.getElementById('queenStatusText').innerText = 'Queen Sunk! Score a coin to cover.';
        } else {
            statusBox.style.display = 'none';
        }

        if (this.gameState === 'GAME_OVER') {
            const winner = this.whiteScore > this.blackScore ? 'WHITE' : 'BLACK';
            alert(`🏆 MATCH OVER! ${winner} Player wins the Championship!`);
            this.whiteScore = 0;
            this.blackScore = 0;
            this.queenWaitingForCover = false;
            this.queenOwner = null;
            this.resetBoard();
        }
    }

    render() {
        this.ctx.clearRect(0, 0, this.boardSize, this.boardSize);

        // ========================================================
        // 1. PROCEDURAL HARDWOOD MAPLE BOARD BACKGROUND
        // ========================================================
        this.ctx.fillStyle = '#EBC29D'; // Soft Maple base tone
        this.ctx.fillRect(0, 0, this.boardSize, this.boardSize);

        // Rich radial wooden shadow to create physical depth
        const woodGradient = this.ctx.createRadialGradient(
            this.boardSize / 2, this.boardSize / 2, 40,
            this.boardSize / 2, this.boardSize / 2, this.boardSize * 0.72
        );
        woodGradient.addColorStop(0, '#F5D3B3');
        woodGradient.addColorStop(0.5, '#E5B891');
        woodGradient.addColorStop(1, '#B9855B'); // richer, darker rim shadow
        this.ctx.fillStyle = woodGradient;
        this.ctx.fillRect(0, 0, this.boardSize, this.boardSize);

        // Render fine vertical maple timber grains
        this.ctx.strokeStyle = 'rgba(102, 51, 15, 0.04)';
        this.ctx.lineWidth = 1;
        this.woodPores.forEach(pore => {
            this.ctx.beginPath();
            this.ctx.moveTo(pore.x, pore.y);
            this.ctx.lineTo(pore.x + pore.length * pore.angleOffset, pore.y + pore.length);
            this.ctx.stroke();
        });

        // Render natural circular timber rings (arc rings)
        this.woodGrains.forEach(ring => {
            this.ctx.strokeStyle = `rgba(139, 69, 19, ${ring.opacity})`;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(ring.rx, ring.ry, ring.radius, ring.startAngle, ring.endAngle);
            this.ctx.stroke();
        });

        // ========================================================
        // 2. CHAMPIONSHIP LAYOUT DESIGN (AUTHENTIC CARROM TEMPLATE)
        // ========================================================

        // Drawing baseline coordinates
        const baseMin = this.baselineMinX;
        const baseMax = this.baselineMaxX;
        const baseMinY = this.boardSize - this.baselineY;

        // Diagonal Iconic Arrows (Corner baselines directly to pockets)
        const pocketOffset = this.pocketRadius * 0.95;
        this.drawChampionshipArrows(baseMin, this.baselineY, pocketOffset, this.boardSize - pocketOffset); // Bottom-Left
        this.drawChampionshipArrows(baseMax, this.baselineY, this.boardSize - pocketOffset, this.boardSize - pocketOffset); // Bottom-Right
        this.drawChampionshipArrows(baseMin, baseMinY, pocketOffset, pocketOffset); // Top-Left
        this.drawChampionshipArrows(baseMax, baseMinY, this.boardSize - pocketOffset, pocketOffset); // Top-Right

        // Four double baselines lines
        this.ctx.strokeStyle = 'rgba(110, 48, 25, 0.75)';
        this.ctx.lineWidth = 2.0;

        // Bottom rail lines
        this.drawDoubleBaselineLines(baseMin, baseMax, this.baselineY, this.baselineY - 14);
        // Top rail lines
        this.drawDoubleBaselineLines(baseMin, baseMax, baseMinY, baseMinY + 14);
        // Left rail lines
        this.drawDoubleBaselineLinesVertical(baseMinY, this.baselineY, baseMinY, baseMinY + 14);
        // Right rail lines
        this.drawDoubleBaselineLinesVertical(baseMinY, this.baselineY, this.baselineY, this.baselineY - 14);

        // Central Concentric Design (Concentric Ring Decal)
        const cx = this.boardSize / 2;
        const cy = this.boardSize / 2;
        
        // Large Outer boundary circle
        this.ctx.strokeStyle = 'rgba(110, 48, 25, 0.7)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 60, 0, 2 * Math.PI);
        this.ctx.stroke();

        // Intricate Inner Rose Decal
        this.ctx.strokeStyle = 'rgba(213, 0, 0, 0.55)'; // bright Crimson
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 20, 0, 2 * Math.PI);
        this.ctx.stroke();

        // Core gold target center circle
        this.ctx.fillStyle = 'rgba(255, 213, 79, 0.65)';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
        this.ctx.fill();

        // 12 spokes / petals of the center rose
        this.ctx.strokeStyle = 'rgba(213, 0, 0, 0.35)';
        this.ctx.lineWidth = 1.5;
        for (let i = 0; i < 12; i++) {
            const angle = (i * 2 * Math.PI) / 12;
            this.ctx.beginPath();
            this.ctx.moveTo(cx + 6 * Math.cos(angle), cy + 6 * Math.sin(angle));
            this.ctx.lineTo(cx + 20 * Math.cos(angle), cy + 20 * Math.sin(angle));
            this.ctx.stroke();
        }

        // ========================================================
        // 3. DEEP POCKET RENDERING
        // ========================================================
        this.physicsWorld.pockets.forEach(pocket => {
            // Drop depth shadow
            this.ctx.fillStyle = '#0D0807';
            this.ctx.beginPath();
            this.ctx.arc(pocket.x, pocket.y, this.pocketRadius, 0, 2 * Math.PI);
            this.ctx.fill();

            // Pocket netting mesh pattern
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            this.ctx.lineWidth = 1;
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
                this.ctx.beginPath();
                this.ctx.moveTo(pocket.x, pocket.y);
                this.ctx.lineTo(
                    pocket.x + this.pocketRadius * Math.cos(angle),
                    pocket.y + this.pocketRadius * Math.sin(angle)
                );
                this.ctx.stroke();
            }

            // Dark inner boundary line
            this.ctx.strokeStyle = '#271713';
            this.ctx.lineWidth = 3.5;
            this.ctx.beginPath();
            this.ctx.arc(pocket.x, pocket.y, this.pocketRadius, 0, 2 * Math.PI);
            this.ctx.stroke();
        });

        // ========================================================
        // 4. RENDERING PIECES WITH HIGH-FIDELITY GRADIENTS
        // ========================================================
        this.physicsWorld.bodies.forEach(body => {
            if (body.isPocketed) return;

            // soft natural directional drop shadow
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            this.ctx.beginPath();
            this.ctx.arc(body.position.x + 2.5, body.position.y + 3.5, body.radius, 0, 2 * Math.PI);
            this.ctx.fill();

            // Dynamic metallic / polymer radial sheen gradient
            const gradient = this.ctx.createRadialGradient(
                body.position.x - body.radius * 0.32,
                body.position.y - body.radius * 0.32,
                1.5,
                body.position.x,
                body.position.y,
                body.radius
            );

            if (body.type === 'STRIKER') {
                gradient.addColorStop(0, '#E8F5E9');
                gradient.addColorStop(0.3, '#00E676'); // Shiny vibrant green polymer
                gradient.addColorStop(1, '#004D20');
                this.ctx.fillStyle = gradient;
                this.ctx.strokeStyle = '#003314';
            } else if (body.type === 'WHITE_COIN') {
                gradient.addColorStop(0, '#FFFFFF');
                gradient.addColorStop(0.7, '#E0F7FA'); // elegant brushed ivory white
                gradient.addColorStop(1, '#80DEEA');
                this.ctx.fillStyle = gradient;
                this.ctx.strokeStyle = '#4DD0E1';
            } else if (body.type === 'BLACK_COIN') {
                gradient.addColorStop(0, '#5D4037');
                gradient.addColorStop(0.65, '#2D150F'); // dense rosewood black
                gradient.addColorStop(1, '#0A0302');
                this.ctx.fillStyle = gradient;
                this.ctx.strokeStyle = '#000000';
            } else if (body.type === 'QUEEN') {
                gradient.addColorStop(0, '#FFCDD2');
                gradient.addColorStop(0.3, '#E91E63'); // Radiant magenta crimson ruby center
                gradient.addColorStop(1, '#880E4F');
                this.ctx.fillStyle = gradient;
                this.ctx.strokeStyle = '#4A002A';
            }

            this.ctx.beginPath();
            this.ctx.arc(body.position.x, body.position.y, body.radius, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.lineWidth = 1.8;
            this.ctx.stroke();

            // Concentric carvings / engravings in wood pieces
            this.ctx.strokeStyle = 'rgba(0,0,0,0.18)';
            if (body.type === 'WHITE_COIN') this.ctx.strokeStyle = 'rgba(0,180,210,0.2)';
            if (body.type === 'STRIKER') this.ctx.strokeStyle = 'rgba(255,255,255,0.45)';

            this.ctx.beginPath();
            this.ctx.arc(body.position.x, body.position.y, body.radius * 0.48, 0, 2 * Math.PI);
            this.ctx.stroke();

            // Add center target dot to pieces
            this.ctx.fillStyle = this.ctx.strokeStyle;
            this.ctx.beginPath();
            this.ctx.arc(body.position.x, body.position.y, 2.5, 0, 2 * Math.PI);
            this.ctx.fill();
        });

        // ========================================================
        // 5. AIMING RENDER OVERLAY (SLINGSHOT & FORECAST LINES)
        // ========================================================
        if (this.isAimDragging) {
            const start = this.striker.position;
            const aimDir = this.dragStart.copy().subtract(this.dragCurrent);
            let dist = aimDir.length();

            if (dist > this.maxDragDistance) {
                dist = this.maxDragDistance;
            }

            if (dist > 12) {
                aimDir.normalize();

                // Dotted neon red aim direction projection forecast line (pointing forward)
                const endX = start.x + aimDir.x * dist * 2.8;
                const endY = start.y + aimDir.y * dist * 2.8;

                this.ctx.save();
                this.ctx.strokeStyle = '#FF3D00';
                this.ctx.lineWidth = 3.5;
                this.ctx.setLineDash([6, 6]);
                this.ctx.shadowColor = '#FF3D00';
                this.ctx.shadowBlur = 10;
                
                this.ctx.beginPath();
                this.ctx.moveTo(start.x, start.y);
                this.ctx.lineTo(endX, endY);
                this.ctx.stroke();
                this.ctx.restore();

                // Solid yellow neon tension lines (dragging pull-back elastic representation)
                this.ctx.save();
                this.ctx.strokeStyle = '#FFCA28';
                this.ctx.lineWidth = 3;
                this.ctx.shadowColor = '#FFD54F';
                this.ctx.shadowBlur = 6;

                const clampCurrentX = start.x - aimDir.x * dist;
                const clampCurrentY = start.y - aimDir.y * dist;

                this.ctx.beginPath();
                this.ctx.moveTo(start.x, start.y);
                this.ctx.lineTo(clampCurrentX, clampCurrentY);
                this.ctx.stroke();

                // Draw solid pointer anchor disc
                this.ctx.fillStyle = '#FFD54F';
                this.ctx.beginPath();
                this.ctx.arc(clampCurrentX, clampCurrentY, 6, 0, 2 * Math.PI);
                this.ctx.fill();
                this.ctx.restore();
            }
        }
    }

    /**
     * Draws double horizontal lines representing the baseline track
     */
    drawDoubleBaselineLines(minX, maxX, y1, y2) {
        this.ctx.beginPath();
        this.ctx.moveTo(minX, y1);
        this.ctx.lineTo(maxX, y1);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(minX, y2);
        this.ctx.lineTo(maxX, y2);
        this.ctx.stroke();

        // Draw elegant red circle plugins (plugs) at both ends of each baseline rail
        this.ctx.fillStyle = 'rgba(213,0,0,0.85)';
        this.ctx.beginPath();
        this.ctx.arc(minX, (y1 + y2) / 2, 9, 0, 2 * Math.PI);
        this.ctx.arc(maxX, (y1 + y2) / 2, 9, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        this.ctx.stroke();
    }

    /**
     * Draws double vertical lines representing side rails
     */
    drawDoubleBaselineLinesVertical(minY, maxY, x1, x2) {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, minY);
        this.ctx.lineTo(x1, maxY);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(x2, minY);
        this.ctx.lineTo(x2, maxY);
        this.ctx.stroke();

        this.ctx.fillStyle = 'rgba(213,0,0,0.85)';
        this.ctx.beginPath();
        this.ctx.arc((x1 + x2) / 2, minY, 9, 0, 2 * Math.PI);
        this.ctx.arc((x1 + x2) / 2, maxY, 9, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        this.ctx.stroke();
    }

    /**
     * Draws the diagonal arrow lines with beautiful red points
     */
    drawChampionshipArrows(xStart, yStart, xEnd, yEnd) {
        this.ctx.strokeStyle = 'rgba(102, 51, 15, 0.45)';
        this.ctx.lineWidth = 1.8;
        this.ctx.beginPath();
        this.ctx.moveTo(xStart, yStart);
        this.ctx.lineTo(xEnd, yEnd);
        this.ctx.stroke();

        // Little arrow tip near the pocket end
        const angle = Math.atan2(yEnd - yStart, xEnd - xStart);
        const arrowDist = 32;
        const arrowX = xEnd - arrowDist * Math.cos(angle);
        const arrowY = yEnd - arrowDist * Math.sin(angle);

        this.ctx.fillStyle = 'rgba(213, 0, 0, 0.7)';
        this.ctx.beginPath();
        this.ctx.arc(arrowX, arrowY, 5, 0, 2 * Math.PI);
        this.ctx.fill();
    }
}

// Start game instance on DOM load
window.addEventListener('DOMContentLoaded', () => {
    window.game = new CarromGame();
});
