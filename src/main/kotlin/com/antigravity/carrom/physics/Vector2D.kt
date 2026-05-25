package com.antigravity.carrom.physics

import kotlin.math.sqrt

/**
 * High-performance, lightweight 2D Vector class for physics math operations.
 */
data class Vector2D(var x: Float = 0f, var y: Float = 0f) {

    fun set(x: Float, y: Float): Vector2D {
        this.x = x
        this.y = y
        return this
    }

    fun set(other: Vector2D): Vector2D {
        this.x = other.x
        this.y = other.y
        return this
    }

    fun add(other: Vector2D): Vector2D {
        this.x += other.x
        this.y += other.y
        return this
    }

    fun subtract(other: Vector2D): Vector2D {
        this.x -= other.x
        this.y -= other.y
        return this
    }

    fun multiply(scalar: Float): Vector2D {
        this.x *= scalar
        this.y *= scalar
        return this
    }

    fun dot(other: Vector2D): Float = this.x * other.x + this.y * other.y

    fun lengthSquared(): Float = x * x + y * y

    fun length(): Float = sqrt(lengthSquared())

    fun normalize(): Vector2D {
        val len = length()
        if (len > 0f) {
            x /= len
            y /= len
        }
        return this
    }

    fun copy(): Vector2D = Vector2D(x, y)

    fun clear() {
        x = 0f
        y = 0f
    }
    
    operator fun plus(other: Vector2D) = Vector2D(x + other.x, y + other.y)
    operator fun minus(other: Vector2D) = Vector2D(x - other.x, y - other.y)
    operator fun times(scalar: Float) = Vector2D(x * scalar, y * scalar)
}
