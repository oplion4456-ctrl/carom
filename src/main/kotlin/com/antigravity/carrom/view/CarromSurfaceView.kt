package com.antigravity.carrom.view

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.SurfaceHolder
import android.view.SurfaceView
import com.antigravity.carrom.CarromGameController
import com.antigravity.carrom.GameState
import com.antigravity.carrom.physics.BodyType

class CarromSurfaceView(context: Context, attrs: AttributeSet?) : 
    SurfaceView(context, attrs), SurfaceHolder.Callback, Runnable {

    private var gameThread: Thread? = null
    private var isRunning = false
    private val controller = CarromGameController(740f)

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    init {
        holder.addCallback(this)
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        isRunning = true
        gameThread = Thread(this).apply { start() }
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        isRunning = false
        try {
            gameThread?.join()
        } catch (e: InterruptedException) {
            e.printStackTrace()
        }
    }

    override fun run() {
        var lastTime = System.nanoTime()

        while (isRunning) {
            val now = System.nanoTime()
            val dt = (now - lastTime) / 1_000_000_000f
            lastTime = now

            controller.update(kotlin.math.min(dt, 0.03f))

            if (holder.surface.isValid) {
                val canvas = holder.lockCanvas()
                if (canvas != null) {
                    try {
                        synchronized(holder) {
                            drawGame(canvas)
                        }
                    } finally {
                        holder.unlockCanvasAndPost(canvas)
                    }
                }
            }

            try {
                Thread.sleep(16)
            } catch (e: InterruptedException) {}
        }
    }

    private fun drawGame(canvas: Canvas) {
        canvas.drawColor(Color.parseColor("#2C221E"))

        paint.color = Color.parseColor("#42322C")
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 20f
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)

        paint.style = Paint.Style.FILL
        paint.color = Color.BLACK
        for (pocket in controller.physicsWorld.pockets) {
            canvas.drawCircle(pocket.x, pocket.y, controller.physicsWorld.pocketRadius, paint)
        }

        for (body in controller.physicsWorld.bodies) {
            if (body.isPocketed) continue

            paint.color = when (body.type) {
                BodyType.STRIKER -> Color.parseColor("#00E676")
                BodyType.WHITE_COIN -> Color.WHITE
                BodyType.BLACK_COIN -> Color.parseColor("#212121")
                BodyType.QUEEN -> Color.parseColor("#D50000")
            }
            canvas.drawCircle(body.position.x, body.position.y, body.radius, paint)
        }

        if (controller.gameState == GameState.STRIKER_AIMING) {
            paint.color = Color.parseColor("#FFD600")
            paint.strokeWidth = 5f
            paint.style = Paint.Style.STROKE
            
            val start = controller.striker.body.position
            val aimDir = controller.dragStartPoint.copy().subtract(controller.dragCurrentPoint)
            val endX = start.x + aimDir.x * 2.5f
            val endY = start.y + aimDir.y * 2.5f

            canvas.drawLine(start.x, start.y, endX, endY, paint)
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val x = event.x
        val y = event.y

        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                if (controller.gameState == GameState.STRIKER_POSITIONING) {
                    controller.handlePositioningTouch(x)
                } else if (controller.gameState == GameState.STRIKER_AIMING) {
                    controller.handleAimStart(x, y)
                }
            }
            MotionEvent.ACTION_MOVE -> {
                if (controller.gameState == GameState.STRIKER_POSITIONING) {
                    controller.handlePositioningTouch(x)
                } else if (controller.gameState == GameState.STRIKER_AIMING) {
                    controller.handleAimDrag(x, y)
                }
            }
            MotionEvent.ACTION_UP -> {
                if (controller.gameState == GameState.STRIKER_POSITIONING) {
                    controller.confirmPositioning()
                } else if (controller.gameState == GameState.STRIKER_AIMING) {
                    controller.releaseAndShoot()
                }
            }
        }
        return true
    }
}
