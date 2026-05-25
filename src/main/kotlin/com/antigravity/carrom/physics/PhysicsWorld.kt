package com.antigravity.carrom.physics

import kotlin.math.max
import kotlin.math.min

interface CollisionListener {
    fun onPocketTriggered(body: RigidBody2D, pocketIndex: Int)
    fun onBodyCollision(bodyA: RigidBody2D, bodyB: RigidBody2D)
}

class PhysicsWorld(
    val boardWidth: Float,
    val boardHeight: Float,
    val pocketRadius: Float
) {
    val bodies = mutableListOf<RigidBody2D>()
    var listener: CollisionListener? = null

    val pockets = arrayOf(
        Vector2D(pocketRadius * 1.1f, pocketRadius * 1.1f),
        Vector2D(boardWidth - pocketRadius * 1.1f, pocketRadius * 1.1f),
        Vector2D(pocketRadius * 1.1f, boardHeight - pocketRadius * 1.1f),
        Vector2D(boardWidth - pocketRadius * 1.1f, boardHeight - pocketRadius * 1.1f)
    )

    fun addBody(body: RigidBody2D) {
        bodies.add(body)
    }

    fun step(dt: Float) {
        bodies.forEach { it.update(dt) }
        checkPocketing()
        resolveWallCollisions()
        resolveCircleCollisions()
    }

    private fun checkPocketing() {
        for (body in bodies) {
            if (body.isPocketed) continue

            for (i in pockets.indices) {
                val pocket = pockets[i]
                val dx = body.position.x - pocket.x
                val dy = body.position.y - pocket.y
                val distSq = dx * dx + dy * dy
                
                val sinkThreshold = pocketRadius * 0.8f
                if (distSq < sinkThreshold * sinkThreshold) {
                    body.isPocketed = true
                    body.velocity.clear()
                    listener?.onPocketTriggered(body, i)
                    break
                }
            }
        }
    }

    private fun resolveWallCollisions() {
        for (body in bodies) {
            if (body.isPocketed || body.isStatic) continue

            if (body.position.x - body.radius < 0f) {
                body.position.x = body.radius
                body.velocity.x = -body.velocity.x * body.restitution
            } else if (body.position.x + body.radius > boardWidth) {
                body.position.x = boardWidth - body.radius
                body.velocity.x = -body.velocity.x * body.restitution
            }

            if (body.position.y - body.radius < 0f) {
                body.position.y = body.radius
                body.velocity.y = -body.velocity.y * body.restitution
            } else if (body.position.y + body.radius > boardHeight) {
                body.position.y = boardHeight - body.radius
                body.velocity.y = -body.velocity.y * body.restitution
            }
        }
    }

    private fun resolveCircleCollisions() {
        val count = bodies.size
        for (i in 0 until count) {
            for (j in i + 1 until count) {
                val a = bodies[i]
                val b = bodies[j]

                if (a.isPocketed || b.isPocketed) continue
                if (a.isStatic && b.isStatic) continue

                val dx = b.position.x - a.position.x
                val dy = b.position.y - a.position.y
                val distanceSq = dx * dx + dy * dy
                val radiusSum = a.radius + b.radius

                if (distanceSq < radiusSum * radiusSum) {
                    val distance = kotlin.math.sqrt(distanceSq)
                    
                    val nx = if (distance > 0f) dx / distance else 1f
                    val ny = if (distance > 0f) dy / distance else 0f
                    
                    val rvx = b.velocity.x - a.velocity.x
                    val rvy = b.velocity.y - a.velocity.y
                    val velAlongNormal = rvx * nx + rvy * ny

                    if (velAlongNormal < 0f) {
                        val e = min(a.restitution, b.restitution)

                        val totalInvMass = a.invMass + b.invMass
                        var impulseScalar = -(1f + e) * velAlongNormal
                        impulseScalar /= totalInvMass

                        val impulseX = impulseScalar * nx
                        val impulseY = impulseScalar * ny

                        if (!a.isStatic) {
                            a.velocity.x -= impulseX * a.invMass
                            a.velocity.y -= impulseY * a.invMass
                        }
                        if (!b.isStatic) {
                            b.velocity.x += impulseX * b.invMass
                            b.velocity.y += impulseY * b.invMass
                        }

                        val percent = 0.8f
                        val slop = 0.01f
                        val penetration = radiusSum - distance
                        if (penetration > slop) {
                            val correctionMagnitude = max(0f, penetration - slop) / totalInvMass * percent
                            val correctionX = correctionMagnitude * nx
                            val correctionY = correctionMagnitude * ny

                            if (!a.isStatic) {
                                a.position.x -= correctionX * a.invMass
                                a.position.y -= correctionY * a.invMass
                            }
                            if (!b.isStatic) {
                                b.position.x += correctionX * b.invMass
                                b.position.y += correctionY * b.invMass
                            }
                        }

                        listener?.onBodyCollision(a, b)
                    }
                }
            }
        }
    }
}
