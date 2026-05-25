package com.antigravity.carrom.physics

import java.util.UUID

enum class BodyType {
    STRIKER,
    WHITE_COIN,
    BLACK_COIN,
    QUEEN
}

/**
 * Represents a circular physics body on the 2D carrom board plane.
 */
class RigidBody2D(
    val id: String = UUID.randomUUID().toString(),
    val type: BodyType,
    var radius: Float,
    var mass: Float,
    initialX: Float,
    initialY: Float
) {
    val position = Vector2D(initialX, initialY)
    val velocity = Vector2D(0f, 0f)
    val acceleration = Vector2D(0f, 0f)
    
    var restitution: Float = 0.65f   // Bounciness coefficient
    var linearDamping: Float = 0.95f // Continuous kinetic resistance of the powder/wood surface
    var isStatic: Boolean = false
    var isPocketed: Boolean = false

    val invMass: Float
        get() = if (isStatic || mass == 0f) 0f else 1f / mass

    fun applyImpulse(impulse: Vector2D) {
        if (isStatic) return
        velocity.x += impulse.x * invMass
        velocity.y += impulse.y * invMass
    }

    fun update(dt: Float) {
        if (isStatic || isPocketed) return

        velocity.x += acceleration.x * dt
        velocity.y += acceleration.y * dt
        
        position.x += velocity.x * dt
        position.y += velocity.y * dt

        velocity.multiply(1f - (linearDamping * dt))

        val minVelocityThreshold = 1.5f
        if (velocity.lengthSquared() < minVelocityThreshold * minVelocityThreshold) {
            velocity.clear()
        }

        acceleration.clear()
    }
}
