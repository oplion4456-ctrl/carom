package com.antigravity.carrom

import com.antigravity.carrom.entities.CarromCoin
import com.antigravity.carrom.entities.CarromSpecs
import com.antigravity.carrom.entities.Striker
import com.antigravity.carrom.physics.BodyType
import com.antigravity.carrom.physics.CollisionListener
import com.antigravity.carrom.physics.PhysicsWorld
import com.antigravity.carrom.physics.RigidBody2D
import com.antigravity.carrom.physics.Vector2D
import kotlin.math.min

enum class GameState {
    STRIKER_POSITIONING,
    STRIKER_AIMING,
    PHYSICS_SIMULATING,
    EVALUATING_TURN,
    GAME_OVER
}

enum class Player { WHITE, BLACK }

class CarromGameController(
    val boardSize: Float = 740f
) : CollisionListener {

    val physicsWorld = PhysicsWorld(boardSize, boardSize, pocketRadius = 32f)
    var gameState = GameState.STRIKER_POSITIONING
    var activePlayer = Player.WHITE

    lateinit var striker: Striker
    val coins = mutableListOf<CarromCoin>()

    private val playerBaselineY = boardSize * 0.82f
    private val baselineMinX = boardSize * 0.15f
    private val baselineMaxX = boardSize * 0.85f

    var dragStartPoint = Vector2D()
    var dragCurrentPoint = Vector2D()
    val maxDragDistance = 150f
    val impulseForceMultiplier = 45f

    var whiteScore = 0
    var blackScore = 0
    
    var queenPocketedThisTurn = false
    var queenWaitingForCover = false
    var queenOwner: Player? = null

    private val pocketedThisTurn = mutableListOf<BodyType>()
    private var strikerPocketedThisTurn = false

    init {
        physicsWorld.listener = this
        resetBoard()
    }

    fun resetBoard() {
        physicsWorld.bodies.clear()
        coins.clear()
        
        striker = Striker(boardSize / 2f, playerBaselineY)
        physicsWorld.addBody(striker.body)

        val centerX = boardSize / 2f
        val centerY = boardSize / 2f
        val coinGap = CarromSpecs.COIN_RADIUS * 2f

        val queen = CarromCoin(BodyType.QUEEN, centerX, centerY)
        coins.add(queen)
        physicsWorld.addBody(queen.body)

        val numRingCoins = 12
        val radiusOffset = coinGap + 2f
        for (i in 0 until numRingCoins) {
            val angle = i * (2 * Math.PI / numRingCoins)
            val cx = centerX + (radiusOffset * Math.cos(angle)).toFloat()
            val cy = centerY + (radiusOffset * Math.sin(angle)).toFloat()
            
            val type = if (i % 2 == 0) BodyType.WHITE_COIN else BodyType.BLACK_COIN
            val coin = CarromCoin(type, cx, cy)
            coins.add(coin)
            physicsWorld.addBody(coin.body)
        }

        gameState = GameState.STRIKER_POSITIONING
    }

    fun update(dt: Float) {
        when (gameState) {
            GameState.PHYSICS_SIMULATING -> {
                physicsWorld.step(dt)

                if (areAllBodiesStationary()) {
                    gameState = GameState.EVALUATING_TURN
                    evaluateTurnOutcome()
                }
            }
            else -> {}
        }
    }

    private fun areAllBodiesStationary(): Boolean {
        for (body in physicsWorld.bodies) {
            if (body.isPocketed) continue
            if (body.velocity.lengthSquared() > 0f) {
                return false
            }
        }
        return true
    }

    fun handlePositioningTouch(touchX: Float) {
        if (gameState != GameState.STRIKER_POSITIONING) return
        val clampedX = touchX.coerceIn(baselineMinX, baselineMaxX)
        striker.body.position.set(clampedX, playerBaselineY)
    }

    fun confirmPositioning() {
        if (gameState == GameState.STRIKER_POSITIONING) {
            gameState = GameState.STRIKER_AIMING
        }
    }

    fun handleAimStart(x: Float, y: Float) {
        if (gameState != GameState.STRIKER_AIMING) return
        dragStartPoint.set(striker.body.position)
        dragCurrentPoint.set(x, y)
    }

    fun handleAimDrag(x: Float, y: Float) {
        if (gameState != GameState.STRIKER_AIMING) return
        dragCurrentPoint.set(x, y)
    }

    fun releaseAndShoot() {
        if (gameState != GameState.STRIKER_AIMING) return

        val aimDir = dragStartPoint.copy().subtract(dragCurrentPoint)
        var distance = aimDir.length()

        if (distance > maxDragDistance) {
            distance = maxDragDistance
        }

        if (distance > 10f) {
            aimDir.normalize()
            val forceMagnitude = (distance / maxDragDistance) * impulseForceMultiplier
            
            val impulse = aimDir.multiply(forceMagnitude)
            striker.body.velocity.clear()
            striker.body.applyImpulse(impulse)
            
            gameState = GameState.PHYSICS_SIMULATING
            pocketedThisTurn.clear()
            strikerPocketedThisTurn = false
            queenPocketedThisTurn = false
        } else {
            gameState = GameState.STRIKER_AIMING
        }
    }

    override fun onPocketTriggered(body: RigidBody2D, pocketIndex: Int) {
        if (body.type == BodyType.STRIKER) {
            strikerPocketedThisTurn = true
        } else {
            pocketedThisTurn.add(body.type)
            if (body.type == BodyType.QUEEN) {
                queenPocketedThisTurn = true
            }
        }
    }

    override fun onBodyCollision(bodyA: RigidBody2D, bodyB: RigidBody2D) {}

    private fun evaluateTurnOutcome() {
        var switchTurn = true

        if (strikerPocketedThisTurn) {
            handleFoulStrikerSunk()
            finalizeTurn(switchTurn = true)
            return
        }

        val whitesPocketed = pocketedThisTurn.count { it == BodyType.WHITE_COIN }
        val blacksPocketed = pocketedThisTurn.count { it == BodyType.BLACK_COIN }

        if (queenWaitingForCover) {
            val didCover = if (activePlayer == Player.WHITE) whitesPocketed > 0 else blacksPocketed > 0
            if (didCover) {
                queenWaitingForCover = false
                queenOwner = activePlayer
                if (activePlayer == Player.WHITE) whiteScore += 3 else blackScore += 3
                switchTurn = false
            } else {
                queenWaitingForCover = false
                respawnQueen()
                val scoredOwnCoin = if (activePlayer == Player.WHITE) whitesPocketed > 0 else blacksPocketed > 0
                switchTurn = !scoredOwnCoin
            }
        } else if (queenPocketedThisTurn) {
            queenWaitingForCover = true
            val hasImmediateCover = if (activePlayer == Player.WHITE) whitesPocketed > 0 else blacksPocketed > 0
            if (hasImmediateCover) {
                queenWaitingForCover = false
                queenOwner = activePlayer
                if (activePlayer == Player.WHITE) whiteScore += 3 else blackScore += 3
                switchTurn = false
            } else {
                switchTurn = false
            }
        } else {
            if (activePlayer == Player.WHITE) {
                if (whitesPocketed > 0) {
                    whiteScore += whitesPocketed
                    switchTurn = false
                }
            } else {
                if (blacksPocketed > 0) {
                    blackScore += blacksPocketed
                    switchTurn = false
                }
            }
        }

        finalizeTurn(switchTurn)
    }

    private fun handleFoulStrikerSunk() {
        if (activePlayer == Player.WHITE && whiteScore > 0) {
            whiteScore--
            respawnCoin(BodyType.WHITE_COIN)
        } else if (activePlayer == Player.BLACK && blackScore > 0) {
            blackScore--
            respawnCoin(BodyType.BLACK_COIN)
        }
    }

    private fun respawnQueen() {
        val queenBody = physicsWorld.bodies.find { it.type == BodyType.QUEEN }
        queenBody?.let {
            it.isPocketed = false
            it.position.set(boardSize / 2f, boardSize / 2f)
            it.velocity.clear()
        }
    }

    private fun respawnCoin(type: BodyType) {
        val coinBody = physicsWorld.bodies.find { it.type == type && it.isPocketed }
        coinBody?.let {
            it.isPocketed = false
            it.position.set(boardSize / 2f + (Math.random() * 10 - 5).toFloat(), boardSize / 2f + (Math.random() * 10 - 5).toFloat())
            it.velocity.clear()
        }
    }

    private fun finalizeTurn(switchTurn: Boolean) {
        striker.body.isPocketed = false
        striker.body.position.set(boardSize / 2f, playerBaselineY)
        striker.body.velocity.clear()

        if (switchTurn) {
            activePlayer = if (activePlayer == Player.WHITE) Player.BLACK else Player.WHITE
        }

        val remainingCoins = coins.count { !it.body.isPocketed && it.body.type != BodyType.QUEEN }
        if (remainingCoins == 0) {
            gameState = GameState.GAME_OVER
        } else {
            gameState = GameState.STRIKER_POSITIONING
        }
    }
}
