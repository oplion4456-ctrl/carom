// AntiGravity Carrom - Web Application Controller & Renderer
// Championship Hardwood Board, Professional AI, and Real-Time Telemetry HUD

class CarromGame {
    constructor() {
        this.canvas = document.getElementById('carromCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.boardSize = this.canvas.width;

        // Championship parameters
        this.pocketRadius = 26;
        this.coinRadius = 13;
        this.strikerRadius = 19;
        this.coinMass = 5.5;
        this.strikerMass = 15.0;

        // Initialize Physics World
        this.physicsWorld = new PhysicsWorld(
            this.boardSize,
            this.pocketRadius,
            this.handlePocketTriggered.bind(this),
            this.handleCollision.bind(this)
        );

        // Core states
        this.gameState = 'POSITIONING'; // 'POSITIONING' | 'AIMING' | 'SIMULATING' | 'EVALUATING' | 'AI_THINKING' | 'GAME_OVER'
        this.activePlayer = 'WHITE'; // 'WHITE' | 'BLACK'
        this.opponentMode = 'LOCAL'; // 'LOCAL' | 'AI'

        // Bottom baseline
        this.baselineY = this.boardSize * 0.82;
        this.baselineMinX = this.boardSize * 0.16;
        this.baselineMaxX = this.boardSize * 0.84;

        // Slingshot variables
        this.isAimDragging = false;
        this.dragStart = new Vector2D();
        this.dragCurrent = new Vector2D();
        this.maxDragDistance = 130;

        // Scores
        this.whiteScore = 0;
        this.blackScore = 0;

        // Queen cover rules
        this.queenPocketedThisTurn = false;
        this.queenWaitingForCover = false;
        this.queenOwner = null;

        // Telemetry tracking
        this.collisionCount = 0;
        this.pocketedThisTurn = [];
        this.strikerPocketedThisTurn = false;

        // AI specific variables
        this.aiThinkTimer = 0;
        this.aiTargetX = 0;
        this.aiShootImpulse = new Vector2D();
        this.aiDragVisualDist = 0; // for animating pull-back

        // Setup grains and controls
        this.generateWoodGrains();
        this.setupSlider();
        this.setupModeSelector();
        this.setupInputListeners();
        this.resetBoard();

        // Start render ticker
        this.lastTime = performance.now();
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    generateWoodGrains() {
        this.woodGrains = [];
        for (let i = 0; i < 9; i++) {
            const rx = this.boardSize * (0.05 + Math.random() * 0.9);
            const ry = this.boardSize * (1.1 + Math.random() * 0.4);
            const radius = this.boardSize * (0.75 + Math.random() * 0.5);
            const startAngle = Math.PI * 1.0;
            const endAngle = Math.PI * 2.0;
            const opacity = 0.025 + Math.random() * 0.02;
            this.woodGrains.push({ rx, ry, radius, startAngle, endAngle, opacity });
        }
        this.woodPores = [];
        for (let i = 0; i < 350; i++) {
            const x = Math.random() * this.boardSize;
            const y = Math.random() * this.boardSize;
            const length = 6 + Math.random() * 12;
            const angleOffset = (Math.random() - 0.5) * 0.06;
            this.woodPores.push({ x, y, length, angleOffset });
        }
    }

    resetBoard() {
        this.physicsWorld.bodies = [];
        this.coins = [];
        this.pocketedThisTurn = [];
        this.strikerPocketedThisTurn = false;
        this.queenPocketedThisTurn = false;
        this.collisionCount = 0;

        // Spawn Striker
        this.striker = new RigidBody2D('STRIKER', this.strikerRadius, this.strikerMass, this.boardSize / 2, this.baselineY);
        this.physicsWorld.addBody(this.striker);

        // Spawn Queen
        const centerX = this.boardSize / 2;
        const centerY = this.boardSize / 2;
        const queen = new RigidBody2D('QUEEN', this.coinRadius, this.coinMass, centerX, centerY);
        this.coins.push(queen);
        this.physicsWorld.addBody(queen);

        // Grid circle arrangement
        const ringCount = 12;
        const ringRadius = this.coinRadius * 2 + 1.5;
        for (let i = 0; i < ringCount; i++) {
            const angle = (i * 2 * Math.PI) / ringCount;
            const cx = centerX + ringRadius * Math.cos(angle);
            const cy = centerY + ringRadius * Math.sin(angle);
            const type = i % 2 === 0 ? 'WHITE_COIN' : 'BLACK_COIN';
            
            const coin = new RigidBody2D(type, this.coinRadius, this.coinMass, cx, cy);
            this.coins.push(coin);
            this.physicsWorld.addBody(coin);
        }

        document.getElementById('strikerSlider').value = 50;
        this.gameState = 'POSITIONING';
        this.updateUI();
    }

    setupSlider() {
        const slider = document.getElementById('strikerSlider');
        slider.addEventListener('input', () => {
            if (this.gameState === 'POSITIONING' && !(this.opponentMode === 'AI' && this.activePlayer === 'BLACK')) {
                const val = parseFloat(slider.value) / 100;
                const range = this.baselineMaxX - this.baselineMinX;
                const newX = this.baselineMinX + range * val;
                
                this.striker.position.x = newX;
                this.striker.position.y = this.baselineY;
                this.striker.velocity.clear();
            }
        });
    }

    setupModeSelector() {
        const localBtn = document.getElementById('modeLocalBtn');
        const aiBtn = document.getElementById('modeAiBtn');
        const blackName = document.getElementById('blackPlayerName');

        localBtn.addEventListener('click', () => {
            this.opponentMode = 'LOCAL';
            localBtn.classList.add('active');
            aiBtn.classList.remove('active');
            blackName.innerText = 'Black Score';
            this.resetBoard();
        });

        aiBtn.addEventListener('click', () => {
            this.opponentMode = 'AI';
            aiBtn.classList.add('active');
            localBtn.classList.remove('active');
            blackName.innerText = 'Championship AI';
            this.resetBoard();
        });
    }

    setupInputListeners() {
        const getCoordinates = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            let clientX = 0;
            let clientY = 0;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            return {
                x: (clientX - rect.left) * (this.canvas.width / rect.width),
                y: (clientY - rect.top) * (this.canvas.height / rect.height)
            };
        };

        const handleDown = (e) => {
            if (this.opponentMode === 'AI' && this.activePlayer === 'BLACK') return;
            const coords = getCoordinates(e);

            if (this.gameState === 'POSITIONING') {
                const dx = coords.x - this.striker.position.x;
                const dy = coords.y - this.striker.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < this.strikerRadius * 2.3) {
                    this.isAimDragging = true;
                    this.dragStart.set(this.striker.position.x, this.striker.position.y);
                    this.dragCurrent.set(coords.x, coords.y);
                    
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

        const handleUp = (e) => {
            if (this.isAimDragging) {
                this.isAimDragging = false;
                
                const aimDir = this.dragStart.copy().subtract(this.dragCurrent);
                let distance = aimDir.length();

                if (distance > this.maxDragDistance) {
                    distance = this.maxDragDistance;
                }

                if (distance > 12) {
                    aimDir.normalize();
                    // CALIBRATED FORCE SCALE: Multiplies speed by striker mass to negate mass division!
                    const force = (distance / this.maxDragDistance) * 850; // Speed up to 850 px/s
                    const impulse = aimDir.multiply(force * this.striker.mass);

                    this.striker.velocity.clear();
                    this.striker.applyImpulse(impulse);

                    this.gameState = 'SIMULATING';
                    this.pocketedThisTurn = [];
                    this.strikerPocketedThisTurn = false;
                    this.queenPocketedThisTurn = false;
                } else {
                    this.gameState = 'POSITIONING';
                }
                this.updateUI();
            }
        };

        this.canvas.addEventListener('mousedown', handleDown);
        this.canvas.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);

        // Use { passive: false } on canvas active touch listeners to prevent browser cancel warnings
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.cancelable) e.preventDefault();
            handleDown(e);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            if (e.cancelable) e.preventDefault();
            handleMove(e);
        }, { passive: false });

        // Never call preventDefault on window-level passive event listeners
        window.addEventListener('touchend', (e) => {
            handleUp(e);
        });

        document.getElementById('restartBtn').addEventListener('click', () => {
            this.whiteScore = 0;
            this.blackScore = 0;
            this.queenWaitingForCover = false;
            this.queenOwner = null;
            this.resetBoard();
        });
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
        this.collisionCount++;
        if (!bodyB) {
            sounds.playWallThud(speed);
        } else {
            sounds.playClack(speed);
        }
    }

    animate(now) {
        const dt = Math.min((now - this.lastTime) / 1000, 0.02);
        this.lastTime = now;

        if (this.gameState === 'SIMULATING') {
            this.physicsWorld.step(dt);

            if (this.areAllBodiesStationary()) {
                this.gameState = 'EVALUATING';
                this.evaluateTurnOutcome();
            }
        } else if (this.gameState === 'AI_THINKING') {
            this.processAiTurn(dt);
        }

        this.updateTelemetry();
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

    // ==========================================
    //      PROFESSIONAL COMPUTER AI ENGINE
    // ==========================================

    triggerAiTurn() {
        this.gameState = 'AI_THINKING';
        this.aiThinkTimer = 0;
        this.aiDragVisualDist = 0;
        this.updateUI();

        let targetType = 'BLACK_COIN';
        if (this.queenWaitingForCover) {
            targetType = 'QUEEN';
        }

        let targetCoins = this.physicsWorld.bodies.filter(b => b.type === targetType && !b.isPocketed);
        if (targetCoins.length === 0 && targetType === 'BLACK_COIN') {
            targetCoins = this.physicsWorld.bodies.filter(b => b.type === 'QUEEN' && !b.isPocketed);
        }

        if (targetCoins.length === 0) return;

        let bestScore = -Infinity;
        let chosenCoin = null;
        let chosenPocket = null;
        let bestAimX = this.boardSize / 2;
        let bestImpulse = new Vector2D(0, -50);

        for (const coin of targetCoins) {
            for (const pocket of this.physicsWorld.pockets) {
                const dirToCoin = coin.position.copy().subtract(pocket);
                const coinDist = dirToCoin.length();
                if (coinDist === 0) continue;

                dirToCoin.normalize();

                const strikeOffset = this.coinRadius + this.strikerRadius - 1;
                const strikePos = coin.position.copy().add(dirToCoin.multiply(strikeOffset));

                if (strikePos.y > this.baselineY) continue; 

                if (Math.abs(dirToCoin.y) < 0.1) continue; 

                const t = (this.baselineY - strikePos.y) / dirToCoin.y;
                if (t < 0) continue; 

                const baselineX = strikePos.x + t * dirToCoin.x;

                if (baselineX >= this.baselineMinX && baselineX <= this.baselineMaxX) {
                    const pathStrikerToCoin = strikePos.copy().subtract(new Vector2D(baselineX, this.baselineY));
                    const distanceTotal = pathStrikerToCoin.length() + coinDist;
                    
                    // High-accuracy velocity calculations compensating friction
                    const baseForceRequired = Math.sqrt(2 * distanceTotal * 1.15) * 6.5;
                    const clampedForce = Math.min(Math.max(baseForceRequired, 280), 800);

                    const errorAngle = (Math.random() - 0.5) * 0.025;
                    const finalShotVector = pathStrikerToCoin.normalize().multiply(clampedForce * this.strikerMass); // Multiplied by mass!
                    
                    const cosE = Math.cos(errorAngle);
                    const sinE = Math.sin(errorAngle);
                    const rotatedForce = new Vector2D(
                        finalShotVector.x * cosE - finalShotVector.y * sinE,
                        finalShotVector.x * sinE + finalShotVector.y * cosE
                    );

                    const score = 1000 - distanceTotal - (Math.abs(baselineX - this.boardSize / 2) * 0.2);
                    if (score > bestScore) {
                        bestScore = score;
                        chosenCoin = coin;
                        chosenPocket = pocket;
                        bestAimX = baselineX;
                        bestImpulse.setFromVec(rotatedForce);
                    }
                }
            }
        }

        if (!chosenCoin) {
            const firstActive = targetCoins[0];
            bestAimX = firstActive.position.x;
            const targetVec = firstActive.position.copy().subtract(new Vector2D(bestAimX, this.baselineY));
            bestImpulse = targetVec.normalize().multiply(500 * this.strikerMass);
        }

        this.aiTargetX = Math.max(this.baselineMinX, Math.min(this.baselineMaxX, bestAimX));
        this.aiShootImpulse.setFromVec(bestImpulse);
    }

    processAiTurn(dt) {
        this.aiThinkTimer += dt;

        const speed = 250; 
        const dx = this.aiTargetX - this.striker.position.x;
        if (Math.abs(dx) > 3) {
            this.striker.position.x += Math.sign(dx) * speed * dt;
            const range = this.baselineMaxX - this.baselineMinX;
            const percent = ((this.striker.position.x - this.baselineMinX) / range) * 100;
            document.getElementById('strikerSlider').value = percent;
        }

        if (this.aiThinkTimer > 0.8) {
            this.aiDragVisualDist = Math.min(this.aiDragVisualDist + 180 * dt, this.maxDragDistance * 0.8);
        }

        if (this.aiThinkTimer > 1.35) {
            this.striker.velocity.clear();
            this.striker.applyImpulse(this.aiShootImpulse);

            this.gameState = 'SIMULATING';
            this.pocketedThisTurn = [];
            this.strikerPocketedThisTurn = false;
            this.queenPocketedThisTurn = false;
            this.updateUI();
        }
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
                switchTurn = false; 
            }
        } else {
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
                this.boardSize / 2 + (Math.random() * 12 - 6),
                this.boardSize / 2 + (Math.random() * 12 - 6)
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
            if (this.opponentMode === 'AI' && this.activePlayer === 'BLACK') {
                this.triggerAiTurn();
            } else {
                this.gameState = 'POSITIONING';
            }
        }

        this.updateUI();
    }

    updateUI() {
        document.getElementById('gameStateBadge').innerText = this.gameState;

        const badge = document.getElementById('gameStateBadge');
        if (this.gameState === 'AI_THINKING') {
            badge.style.borderColor = 'var(--neon-cyan)';
            badge.style.color = 'var(--neon-cyan)';
        } else {
            badge.style.borderColor = 'rgba(255, 110, 64, 0.25)';
            badge.style.color = '#FF7043';
        }

        document.getElementById('activePlayerDisplay').innerText = 
            (this.opponentMode === 'AI' && this.activePlayer === 'BLACK') ? 'Championship AI' : `${this.activePlayer} Player`;
        
        const turnDot = document.getElementById('turnIndicatorDot');
        if (this.activePlayer === 'WHITE') {
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

    updateTelemetry() {
        const activeCount = this.physicsWorld.bodies.filter(b => !b.isPocketed).length;
        document.getElementById('hudActiveBodies').innerText = activeCount;

        let totalKE = 0;
        this.physicsWorld.bodies.forEach(b => {
            if (b.isPocketed) return;
            const speedSq = b.velocity.lengthSquared();
            totalKE += 0.5 * b.mass * speedSq;
        });
        const scaleKE = totalKE / 20000;
        document.getElementById('hudKineticEnergy').innerText = `${scaleKE.toFixed(3)} J`;

        const strikerVel = this.striker.velocity.length();
        document.getElementById('hudStrikerVel').innerText = `${strikerVel.toFixed(1)} px/s`;

        document.getElementById('hudCollisions').innerText = this.collisionCount;

        const statusText = document.getElementById('hudTrajectoryStatus');
        if (this.gameState === 'SIMULATING') {
            statusText.innerText = 'Analyzing slide...';
            statusText.style.color = '#FF1744';
        } else if (this.gameState === 'AI_THINKING') {
            statusText.innerText = 'Targeting...';
            statusText.style.color = 'var(--gold)';
        } else {
            statusText.innerText = 'Ready';
            statusText.style.color = 'var(--neon-cyan)';
        }
    }

    render() {
        this.ctx.clearRect(0, 0, this.boardSize, this.boardSize);

        // 1. Warm procedural hardwood background
        this.ctx.fillStyle = '#EBC29D';
        this.ctx.fillRect(0, 0, this.boardSize, this.boardSize);

        const woodGradient = this.ctx.createRadialGradient(
            this.boardSize / 2, this.boardSize / 2, 40,
            this.boardSize / 2, this.boardSize / 2, this.boardSize * 0.72
        );
        woodGradient.addColorStop(0, '#F5D3B3');
        woodGradient.addColorStop(0.5, '#E5B891');
        woodGradient.addColorStop(1, '#B9855B');
        this.ctx.fillStyle = woodGradient;
        this.ctx.fillRect(0, 0, this.boardSize, this.boardSize);

        this.ctx.strokeStyle = 'rgba(102, 51, 15, 0.04)';
        this.ctx.lineWidth = 1;
        this.woodPores.forEach(pore => {
            this.ctx.beginPath();
            this.ctx.moveTo(pore.x, pore.y);
            this.ctx.lineTo(pore.x + pore.length * pore.angleOffset, pore.y + pore.length);
            this.ctx.stroke();
        });

        this.woodGrains.forEach(ring => {
            this.ctx.strokeStyle = `rgba(139, 69, 19, ${ring.opacity})`;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(ring.rx, ring.ry, ring.radius, ring.startAngle, ring.endAngle);
            this.ctx.stroke();
        });

        // 2. Championship Diagonal lines & baseline borders
        const baseMin = this.baselineMinX;
        const baseMax = this.baselineMaxX;
        const baseMinY = this.boardSize - this.baselineY;
        const pocketOffset = this.pocketRadius * 0.95;

        this.drawChampionshipArrows(baseMin, this.baselineY, pocketOffset, this.boardSize - pocketOffset); // Bottom-Left
        this.drawChampionshipArrows(baseMax, this.baselineY, this.boardSize - pocketOffset, this.boardSize - pocketOffset); // Bottom-Right
        this.drawChampionshipArrows(baseMin, baseMinY, pocketOffset, pocketOffset); // Top-Left
        this.drawChampionshipArrows(baseMax, baseMinY, this.boardSize - pocketOffset, pocketOffset); // Top-Right

        this.ctx.strokeStyle = 'rgba(110, 48, 25, 0.75)';
        this.ctx.lineWidth = 2.0;

        this.drawDoubleBaselineLines(baseMin, baseMax, this.baselineY, this.baselineY - 14);
        this.drawDoubleBaselineLines(baseMin, baseMax, baseMinY, baseMinY + 14);
        this.drawDoubleBaselineLinesVertical(baseMinY, this.baselineY, baseMinY, baseMinY + 14);
        this.drawDoubleBaselineLinesVertical(baseMinY, this.baselineY, this.baselineY, this.baselineY - 14);

        // Center rings decal
        const cx = this.boardSize / 2;
        const cy = this.boardSize / 2;
        
        this.ctx.strokeStyle = 'rgba(110, 48, 25, 0.7)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 60, 0, 2 * Math.PI);
        this.ctx.stroke();

        this.ctx.strokeStyle = 'rgba(213, 0, 0, 0.55)';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 20, 0, 2 * Math.PI);
        this.ctx.stroke();

        this.ctx.fillStyle = 'rgba(255, 213, 79, 0.65)';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
        this.ctx.fill();

        this.ctx.strokeStyle = 'rgba(213, 0, 0, 0.35)';
        this.ctx.lineWidth = 1.5;
        for (let i = 0; i < 12; i++) {
            const angle = (i * 2 * Math.PI) / 12;
            this.ctx.beginPath();
            this.ctx.moveTo(cx + 6 * Math.cos(angle), cy + 6 * Math.sin(angle));
            this.ctx.lineTo(cx + 20 * Math.cos(angle), cy + 20 * Math.sin(angle));
            this.ctx.stroke();
        }

        // 3. Render pockets
        this.physicsWorld.pockets.forEach(pocket => {
            this.ctx.fillStyle = '#0D0807';
            this.ctx.beginPath();
            this.ctx.arc(pocket.x, pocket.y, this.pocketRadius, 0, 2 * Math.PI);
            this.ctx.fill();

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

            this.ctx.strokeStyle = '#271713';
            this.ctx.lineWidth = 3.5;
            this.ctx.beginPath();
            this.ctx.arc(pocket.x, pocket.y, this.pocketRadius, 0, 2 * Math.PI);
            this.ctx.stroke();
        });

        // ==========================================
        // 4. PREDICTIVE MULTI-BOUNCE TRAJECTORY PATH
        // ==========================================
        let shouldPredict = false;
        let pDir = null;
        let pLen = 0;

        if (this.isAimDragging) {
            shouldPredict = true;
            pDir = this.dragStart.copy().subtract(this.dragCurrent);
            pLen = pDir.length();
            if (pLen > this.maxDragDistance) pLen = this.maxDragDistance;
        } else if (this.gameState === 'AI_THINKING' && this.aiThinkTimer > 0.8) {
            shouldPredict = true;
            pDir = this.aiShootImpulse.copy();
            pLen = pDir.length() * 0.15; // visual pull back line scaling
        }

        if (shouldPredict && pLen > 12) {
            pDir.normalize();
            // Slingshot pulling rubber band line (backward direction)
            this.ctx.save();
            this.ctx.strokeStyle = '#FFCA28';
            this.ctx.lineWidth = 3;
            this.ctx.shadowColor = '#FFD54F';
            this.ctx.shadowBlur = 6;
            
            const clampX = this.striker.position.x - pDir.x * (pLen * 0.7);
            const clampY = this.striker.position.y - pDir.y * (pLen * 0.7);
            
            this.ctx.beginPath();
            this.ctx.moveTo(this.striker.position.x, this.striker.position.y);
            this.ctx.lineTo(clampX, clampY);
            this.ctx.stroke();

            this.ctx.fillStyle = '#FFD54F';
            this.ctx.beginPath();
            this.ctx.arc(clampX, clampY, 6, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.restore();

            // Trace 3-Bounce Raycast Trajectory projection
            this.ctx.save();
            this.ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)'; // bright cyan prediction line
            this.ctx.lineWidth = 2.5;
            this.ctx.setLineDash([5, 6]);
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = '#00E5FF';

            let curPos = this.striker.position.copy();
            let curVel = pDir.copy().multiply(pLen * 2.8);

            this.ctx.beginPath();
            this.ctx.moveTo(curPos.x, curPos.y);

            let raySteps = 3;
            for (let step = 0; step < raySteps; step++) {
                let tMin = Infinity;
                let wallNormal = new Vector2D();

                if (curVel.x < 0) {
                    const t = (this.strikerRadius - curPos.x) / curVel.x;
                    if (t > 0 && t < tMin) { tMin = t; wallNormal.set(1, 0); }
                }
                if (curVel.x > 0) {
                    const t = (this.boardSize - this.strikerRadius - curPos.x) / curVel.x;
                    if (t > 0 && t < tMin) { tMin = t; wallNormal.set(-1, 0); }
                }
                if (curVel.y < 0) {
                    const t = (this.strikerRadius - curPos.y) / curVel.y;
                    if (t > 0 && t < tMin) { tMin = t; wallNormal.set(0, 1); }
                }
                if (curVel.y > 0) {
                    const t = (this.boardSize - this.strikerRadius - curPos.y) / curVel.y;
                    if (t > 0 && t < tMin) { tMin = t; wallNormal.set(0, -1); }
                }

                if (tMin < 1.0) {
                    const hitX = curPos.x + curVel.x * tMin;
                    const hitY = curPos.y + curVel.y * tMin;
                    this.ctx.lineTo(hitX, hitY);

                    const dot = curVel.dot(wallNormal);
                    curVel.subtract(wallNormal.multiply(2 * dot));

                    curPos.set(hitX, hitY);
                } else {
                    this.ctx.lineTo(curPos.x + curVel.x, curPos.y + curVel.y);
                    break;
                }
            }
            this.ctx.stroke();
            this.ctx.restore();
        }

        // 5. Draw pieces
        this.physicsWorld.bodies.forEach(body => {
            if (body.isPocketed) return;

            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            this.ctx.beginPath();
            this.ctx.arc(body.position.x + 2.5, body.position.y + 3.5, body.radius, 0, 2 * Math.PI);
            this.ctx.fill();

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
                gradient.addColorStop(0.3, '#00E676');
                gradient.addColorStop(1, '#004D20');
                this.ctx.fillStyle = gradient;
                this.ctx.strokeStyle = '#003314';
            } else if (body.type === 'WHITE_COIN') {
                gradient.addColorStop(0, '#FFFFFF');
                gradient.addColorStop(0.7, '#E0F7FA');
                gradient.addColorStop(1, '#80DEEA');
                this.ctx.fillStyle = gradient;
                this.ctx.strokeStyle = '#4DD0E1';
            } else if (body.type === 'BLACK_COIN') {
                gradient.addColorStop(0, '#5D4037');
                gradient.addColorStop(0.65, '#2D150F');
                gradient.addColorStop(1, '#0A0302');
                this.ctx.fillStyle = gradient;
                this.ctx.strokeStyle = '#000000';
            } else if (body.type === 'QUEEN') {
                gradient.addColorStop(0, '#FFCDD2');
                gradient.addColorStop(0.3, '#E91E63');
                gradient.addColorStop(1, '#880E4F');
                this.ctx.fillStyle = gradient;
                this.ctx.strokeStyle = '#4A002A';
            }

            this.ctx.beginPath();
            this.ctx.arc(body.position.x, body.position.y, body.radius, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.lineWidth = 1.8;
            this.ctx.stroke();

            this.ctx.strokeStyle = 'rgba(0,0,0,0.18)';
            if (body.type === 'WHITE_COIN') this.ctx.strokeStyle = 'rgba(0,180,210,0.2)';
            if (body.type === 'STRIKER') this.ctx.strokeStyle = 'rgba(255,255,255,0.45)';

            this.ctx.beginPath();
            this.ctx.arc(body.position.x, body.position.y, body.radius * 0.48, 0, 2 * Math.PI);
            this.ctx.stroke();

            this.ctx.fillStyle = this.ctx.strokeStyle;
            this.ctx.beginPath();
            this.ctx.arc(body.position.x, body.position.y, 2.5, 0, 2 * Math.PI);
            this.ctx.fill();
        });

        // 6. Draw AI "Thinking" Indicator Overlay directly on Canvas
        if (this.gameState === 'AI_THINKING') {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            this.ctx.fillRect(0, 0, this.boardSize, this.boardSize);

            this.ctx.font = "bold 20px Outfit, Inter, sans-serif";
            this.ctx.fillStyle = '#00E5FF';
            this.ctx.textAlign = 'center';
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = '#00E5FF';
            this.ctx.fillText("Championship AI is targeting shot...", this.boardSize / 2, this.boardSize / 2);
            this.ctx.shadowBlur = 0;
        }
    }

    drawDoubleBaselineLines(minX, maxX, y1, y2) {
        this.ctx.beginPath();
        this.ctx.moveTo(minX, y1);
        this.ctx.lineTo(maxX, y1);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(minX, y2);
        this.ctx.lineTo(maxX, y2);
        this.ctx.stroke();

        this.ctx.fillStyle = 'rgba(213,0,0,0.85)';
        this.ctx.beginPath();
        this.ctx.arc(minX, (y1 + y2) / 2, 9, 0, 2 * Math.PI);
        this.ctx.arc(maxX, (y1 + y2) / 2, 9, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        this.ctx.stroke();
    }

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

    drawChampionshipArrows(xStart, yStart, xEnd, yEnd) {
        this.ctx.strokeStyle = 'rgba(102, 51, 15, 0.45)';
        this.ctx.lineWidth = 1.8;
        this.ctx.beginPath();
        this.ctx.moveTo(xStart, yStart);
        this.ctx.lineTo(xEnd, yEnd);
        this.ctx.stroke();

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

// Instantiate game
window.addEventListener('DOMContentLoaded', () => {
    window.game = new CarromGame();
});
