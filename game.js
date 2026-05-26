// AntiGravity Carrom - Web Application Controller & Renderer
// Procedural Maple Board (Pre-rendered for high FPS), Multi-Bounce Rays, Professional AI, and HUD

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
        this.gameState = 'POSITIONING';
        this.activePlayer = 'WHITE';
        this.opponentMode = 'LOCAL';

        // Bottom baseline
        this.baselineY = this.boardSize * 0.82;
        this.baselineMinX = this.boardSize * 0.16;
        this.baselineMaxX = this.boardSize * 0.84;

        // Slingshot variables
        this.isAimDragging = false;
        this.dragStart = new Vector2D();
        this.dragCurrent = new Vector2D();
        this.maxDragDistance = 130;

        // Scores (White = 10 points per coin, Black = 5 points per coin)
        this.whiteScore = 0;
        this.blackScore = 0;
        this.whiteCoinValue = 10;
        this.blackCoinValue = 5;
        this.queenValue = 30;

        // Queen cover rules
        this.queenPocketedThisTurn = false;
        this.queenWaitingForCover = false;
        this.queenOwner = null;

        // Telemetry tracking
        this.collisionCount = 0;
        this.pocketedThisTurn = [];
        this.strikerPocketedThisTurn = false;

        // Floating points animation array
        this.floatingTexts = [];

        // AI variables
        this.aiThinkTimer = 0;
        this.aiTargetX = 0;
        this.aiShootImpulse = new Vector2D();
        this.aiDragVisualDist = 0;

        // Friction tuning setting (0.75 for fast, 1.15 for heavy)
        this.frictionDamping = 0.75;

        // Generate wood grains and pre-render background to completely resolve lag
        this.generateWoodGrains();
        this.preRenderBoardBackground();

        this.setupSlider();
        this.setupEntryScreen();
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

    /**
     * Pre-renders the complete wooden board background to an offscreen canvas.
     * This moves ~500 expensive drawing paths per frame down to exactly 1 drawImage call,
     * completely eliminating any visual lag or stuttering.
     */
    preRenderBoardBackground() {
        this.bgCanvas = document.createElement('canvas');
        this.bgCanvas.width = this.boardSize;
        this.bgCanvas.height = this.boardSize;
        const bgCtx = this.bgCanvas.getContext('2d');

        // 1. Hardwood Maple Base
        bgCtx.fillStyle = '#EBC29D';
        bgCtx.fillRect(0, 0, this.boardSize, this.boardSize);

        const woodGradient = bgCtx.createRadialGradient(
            this.boardSize / 2, this.boardSize / 2, 40,
            this.boardSize / 2, this.boardSize / 2, this.boardSize * 0.72
        );
        woodGradient.addColorStop(0, '#F5D3B3');
        woodGradient.addColorStop(0.5, '#E5B891');
        woodGradient.addColorStop(1, '#B9855B');
        bgCtx.fillStyle = woodGradient;
        bgCtx.fillRect(0, 0, this.boardSize, this.boardSize);

        // Render fine vertical maple grains
        bgCtx.strokeStyle = 'rgba(102, 51, 15, 0.04)';
        bgCtx.lineWidth = 1;
        this.woodPores.forEach(pore => {
            bgCtx.beginPath();
            bgCtx.moveTo(pore.x, pore.y);
            bgCtx.lineTo(pore.x + pore.length * pore.angleOffset, pore.y + pore.length);
            bgCtx.stroke();
        });

        // Render curved timber ring lines
        this.woodGrains.forEach(ring => {
            bgCtx.strokeStyle = `rgba(139, 69, 19, ${ring.opacity})`;
            bgCtx.lineWidth = 2;
            bgCtx.beginPath();
            bgCtx.arc(ring.rx, ring.ry, ring.radius, ring.startAngle, ring.endAngle);
            bgCtx.stroke();
        });

        // 2. Championship Diagonal lines & baseline borders
        const baseMin = this.baselineMinX;
        const baseMax = this.baselineMaxX;
        const baseMinY = this.boardSize - this.baselineY;
        const pocketOffset = this.pocketRadius * 0.95;

        this.drawChampionshipArrows(bgCtx, baseMin, this.baselineY, pocketOffset, this.boardSize - pocketOffset); // Bottom-Left
        this.drawChampionshipArrows(bgCtx, baseMax, this.baselineY, this.boardSize - pocketOffset, this.boardSize - pocketOffset); // Bottom-Right
        this.drawChampionshipArrows(bgCtx, baseMin, baseMinY, pocketOffset, pocketOffset); // Top-Left
        this.drawChampionshipArrows(bgCtx, baseMax, baseMinY, this.boardSize - pocketOffset, pocketOffset); // Top-Right

        bgCtx.strokeStyle = 'rgba(110, 48, 25, 0.75)';
        bgCtx.lineWidth = 2.0;

        this.drawDoubleBaselineLines(bgCtx, baseMin, baseMax, this.baselineY, this.baselineY - 14);
        this.drawDoubleBaselineLines(bgCtx, baseMin, baseMax, baseMinY, baseMinY + 14);
        this.drawDoubleBaselineLinesVertical(bgCtx, baseMinY, this.baselineY, baseMinY, baseMinY + 14);
        this.drawDoubleBaselineLinesVertical(bgCtx, baseMinY, this.baselineY, this.baselineY, this.baselineY - 14);

        // Center rings decal
        const cx = this.boardSize / 2;
        const cy = this.boardSize / 2;
        
        bgCtx.strokeStyle = 'rgba(110, 48, 25, 0.7)';
        bgCtx.lineWidth = 2;
        bgCtx.beginPath();
        bgCtx.arc(cx, cy, 60, 0, 2 * Math.PI);
        bgCtx.stroke();

        bgCtx.strokeStyle = 'rgba(213, 0, 0, 0.55)';
        bgCtx.beginPath();
        bgCtx.arc(cx, cy, 20, 0, 2 * Math.PI);
        bgCtx.stroke();

        bgCtx.fillStyle = 'rgba(255, 213, 79, 0.65)';
        bgCtx.beginPath();
        bgCtx.arc(cx, cy, 6, 0, 2 * Math.PI);
        bgCtx.fill();

        bgCtx.strokeStyle = 'rgba(213, 0, 0, 0.35)';
        bgCtx.lineWidth = 1.5;
        for (let i = 0; i < 12; i++) {
            const angle = (i * 2 * Math.PI) / 12;
            bgCtx.beginPath();
            bgCtx.moveTo(cx + 6 * Math.cos(angle), cy + 6 * Math.sin(angle));
            bgCtx.lineTo(cx + 20 * Math.cos(angle), cy + 20 * Math.sin(angle));
            bgCtx.stroke();
        }

        // 3. Render pockets
        this.physicsWorld.pockets.forEach(pocket => {
            bgCtx.fillStyle = '#0D0807';
            bgCtx.beginPath();
            bgCtx.arc(pocket.x, pocket.y, this.pocketRadius, 0, 2 * Math.PI);
            bgCtx.fill();

            bgCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            bgCtx.lineWidth = 1;
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
                bgCtx.beginPath();
                bgCtx.moveTo(pocket.x, pocket.y);
                bgCtx.lineTo(
                    pocket.x + this.pocketRadius * Math.cos(angle),
                    pocket.y + this.pocketRadius * Math.sin(angle)
                );
                bgCtx.stroke();
            }

            bgCtx.strokeStyle = '#271713';
            bgCtx.lineWidth = 3.5;
            bgCtx.beginPath();
            bgCtx.arc(pocket.x, pocket.y, this.pocketRadius, 0, 2 * Math.PI);
            bgCtx.stroke();
        });
    }

    resetBoard() {
        this.physicsWorld.bodies = [];
        this.coins = [];
        this.pocketedThisTurn = [];
        this.floatingTexts = [];
        this.strikerPocketedThisTurn = false;
        this.queenPocketedThisTurn = false;
        this.collisionCount = 0;

        // Spawn Striker
        this.striker = new RigidBody2D('STRIKER', this.strikerRadius, this.strikerMass, this.boardSize / 2, this.baselineY);
        this.striker.linearDamping = this.frictionDamping;
        this.physicsWorld.addBody(this.striker);

        // Spawn Queen
        const centerX = this.boardSize / 2;
        const centerY = this.boardSize / 2;
        const queen = new RigidBody2D('QUEEN', this.coinRadius, this.coinMass, centerX, centerY);
        queen.linearDamping = this.frictionDamping;
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
            coin.linearDamping = this.frictionDamping;
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

    setupEntryScreen() {
        const entryScreen = document.getElementById('entryScreen');
        const gameContainer = document.getElementById('gameArenaContainer');
        const enterArenaBtn = document.getElementById('enterArenaBtn');
        
        const modeLocal = document.getElementById('entryModeLocal');
        const modeAi = document.getElementById('entryModeAi');
        const frictionHeavy = document.getElementById('entryFrictionHeavy');
        const frictionFast = document.getElementById('entryFrictionFast');
        
        let selectedMode = 'LOCAL';
        let selectedFriction = 'FAST';

        modeLocal.addEventListener('click', () => {
            selectedMode = 'LOCAL';
            modeLocal.classList.add('active');
            modeAi.classList.remove('active');
        });

        modeAi.addEventListener('click', () => {
            selectedMode = 'AI';
            modeAi.classList.add('active');
            modeLocal.classList.remove('active');
        });

        frictionHeavy.addEventListener('click', () => {
            selectedFriction = 'HEAVY';
            frictionHeavy.classList.add('active');
            frictionFast.classList.remove('active');
        });

        frictionFast.addEventListener('click', () => {
            selectedFriction = 'FAST';
            frictionFast.classList.add('active');
            frictionHeavy.classList.remove('active');
        });

        enterArenaBtn.addEventListener('click', () => {
            // Apply settings to actual game state
            this.opponentMode = selectedMode;
            document.getElementById('hudOpponentMode').innerText = selectedMode === 'LOCAL' ? '2-Player' : 'Championship AI';
            
            if (selectedMode === 'LOCAL') {
                document.getElementById('blackPlayerName').innerText = 'Black Score';
            } else {
                document.getElementById('blackPlayerName').innerText = 'Championship AI';
            }

            if (selectedFriction === 'FAST') {
                this.frictionDamping = 0.75;
                document.getElementById('hudFrictionMode').innerText = 'Hyper Speed';
            } else {
                this.frictionDamping = 1.15;
                document.getElementById('hudFrictionMode').innerText = 'Heavy Board';
            }

            // Animate transition
            entryScreen.classList.add('fade-out');
            setTimeout(() => {
                gameContainer.classList.remove('hidden');
                // Allow display:flex to apply, then transition opacity
                setTimeout(() => {
                    gameContainer.style.opacity = '1';
                    gameContainer.style.transform = 'translateY(0)';
                }, 50);
                this.resetBoard(); // Reset board one more time to apply damping
            }, 800);
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
                    const force = (distance / this.maxDragDistance) * 2500; // up to 2500 px/s
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

        this.canvas.addEventListener('touchstart', (e) => {
            if (e.cancelable) e.preventDefault();
            handleDown(e);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            if (e.cancelable) e.preventDefault();
            handleMove(e);
        }, { passive: false });

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
        
        let pointsEarned = 0;
        let color = '#FFF';

        if (body.type === 'STRIKER') {
            this.strikerPocketedThisTurn = true;
        } else {
            this.pocketedThisTurn.push(body.type);
            if (body.type === 'QUEEN') {
                this.queenPocketedThisTurn = true;
                pointsEarned = this.queenValue;
                color = '#FF1744';
            } else if (body.type === 'WHITE_COIN') {
                pointsEarned = this.whiteCoinValue; // 10 Points
                color = '#00E5FF';
            } else if (body.type === 'BLACK_COIN') {
                pointsEarned = this.blackCoinValue; // 5 Points
                color = '#FFCA28';
            }

            // Spawn floating text points indicator
            if (pointsEarned > 0) {
                this.floatingTexts.push({
                    x: body.position.x,
                    y: body.position.y - 12,
                    text: `+${pointsEarned}`,
                    color: color,
                    opacity: 1.0
                });
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
                    
                    const baseForceRequired = Math.sqrt(2 * distanceTotal * 1.15) * 6.5;
                    const clampedForce = Math.min(Math.max(baseForceRequired, 280), 2500);

                    const errorAngle = (Math.random() - 0.5) * 0.025;
                    const finalShotVector = pathStrikerToCoin.normalize().multiply(clampedForce * this.strikerMass);
                    
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

    // ==========================================
    //      EVALUATE SCORING (CALIBRATED VALUES)
    // ==========================================

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
                
                // Queen cover awards 30 points
                if (this.activePlayer === 'WHITE') {
                    this.whiteScore += this.queenValue;
                } else {
                    this.blackScore += this.queenValue;
                }
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
                
                // Queen scored and immediately covered
                if (this.activePlayer === 'WHITE') {
                    this.whiteScore += this.queenValue;
                } else {
                    this.blackScore += this.queenValue;
                }
                switchTurn = false;
            } else {
                switchTurn = false; 
            }
        } else {
            // Standard point assignments: White = 10 Points, Black = 5 Points
            if (this.activePlayer === 'WHITE') {
                if (whitesPocketed > 0) {
                    this.whiteScore += whitesPocketed * this.whiteCoinValue;
                    switchTurn = false;
                }
            } else {
                if (blacksPocketed > 0) {
                    this.blackScore += blacksPocketed * this.blackCoinValue;
                    switchTurn = false;
                }
            }
        }

        this.finalizeTurn(switchTurn);
    }

    handleFoulStrikerSunk() {
        // Penalty: White costs 10 pts, Black costs 5 pts
        if (this.activePlayer === 'WHITE') {
            if (this.whiteScore >= this.whiteCoinValue) {
                this.whiteScore -= this.whiteCoinValue;
            }
            this.respawnCoin('WHITE_COIN');
            this.floatingTexts.push({
                x: this.striker.position.x,
                y: this.striker.position.y - 12,
                text: `-${this.whiteCoinValue} Foul`,
                color: '#FF1744',
                opacity: 1.0
            });
        } else {
            if (this.blackScore >= this.blackCoinValue) {
                this.blackScore -= this.blackCoinValue;
            }
            this.respawnCoin('BLACK_COIN');
            this.floatingTexts.push({
                x: this.striker.position.x,
                y: this.striker.position.y - 12,
                text: `-${this.blackCoinValue} Foul`,
                color: '#FF1744',
                opacity: 1.0
            });
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
            alert(`🏆 MATCH OVER! ${winner} Player wins the Championship with ${Math.max(this.whiteScore, this.blackScore)} Points!`);
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

        // ==========================================
        // 1. DRAW PRE-RENDERED HARDWOOD BOARD (0 Lags!)
        // ==========================================
        this.ctx.drawImage(this.bgCanvas, 0, 0);

        // ==========================================
        // 2. PREDICTIVE MULTI-BOUNCE TRAJECTORY PATH
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
            pLen = pDir.length() * 0.15;
        }

        if (shouldPredict && pLen > 12) {
            pDir.normalize();
            // Slingshot pull line
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

            // Trace 3-Bounce Raycast prediction
            this.ctx.save();
            this.ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
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

        // ==========================================
        // 3. DRAW COINS & STRIKER
        // ==========================================
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

        // ==========================================
        // 4. DRAW FLOATING POINTS INDICATORS
        // ==========================================
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const txt = this.floatingTexts[i];
            this.ctx.save();
            this.ctx.font = 'bold 16px Outfit, Inter, sans-serif';
            this.ctx.fillStyle = txt.color;
            this.ctx.globalAlpha = txt.opacity;
            this.ctx.textAlign = 'center';
            this.ctx.shadowBlur = 4;
            this.ctx.shadowColor = txt.color;
            
            this.ctx.fillText(txt.text, txt.x, txt.y);
            this.ctx.restore();

            // Float upward and fade away
            txt.y -= 1.2;
            txt.opacity -= 0.02;

            if (txt.opacity <= 0) {
                this.floatingTexts.splice(i, 1);
            }
        }

        // ==========================================
        // 5. DRAW AI "THINKING" OVERLAY
        // ==========================================
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

    drawDoubleBaselineLines(ctx, minX, maxX, y1, y2) {
        ctx.beginPath();
        ctx.moveTo(minX, y1);
        ctx.lineTo(maxX, y1);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(minX, y2);
        ctx.lineTo(maxX, y2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(213,0,0,0.85)';
        ctx.beginPath();
        ctx.arc(minX, (y1 + y2) / 2, 9, 0, 2 * Math.PI);
        ctx.arc(maxX, (y1 + y2) / 2, 9, 0, 2 * Math.PI);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.stroke();
    }

    drawDoubleBaselineLinesVertical(ctx, minY, maxY, x1, x2) {
        ctx.beginPath();
        ctx.moveTo(x1, minY);
        ctx.lineTo(x1, maxY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x2, minY);
        ctx.lineTo(x2, maxY);
        ctx.stroke();

        ctx.fillStyle = 'rgba(213,0,0,0.85)';
        ctx.beginPath();
        ctx.arc((x1 + x2) / 2, minY, 9, 0, 2 * Math.PI);
        ctx.arc((x1 + x2) / 2, maxY, 9, 0, 2 * Math.PI);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.stroke();
    }

    drawChampionshipArrows(ctx, xStart, yStart, xEnd, yEnd) {
        ctx.strokeStyle = 'rgba(102, 51, 15, 0.45)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(xStart, yStart);
        ctx.lineTo(xEnd, yEnd);
        ctx.stroke();

        const angle = Math.atan2(yEnd - yStart, xEnd - xStart);
        const arrowDist = 32;
        const arrowX = xEnd - arrowDist * Math.cos(angle);
        const arrowY = yEnd - arrowDist * Math.sin(angle);

        ctx.fillStyle = 'rgba(213, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.arc(arrowX, arrowY, 5, 0, 2 * Math.PI);
        ctx.fill();
    }
}

// Instantiate game on DOM ready
window.addEventListener('DOMContentLoaded', () => {
    window.game = new CarromGame();
});
