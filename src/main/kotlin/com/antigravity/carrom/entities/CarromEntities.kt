package com.antigravity.carrom.entities

import com.antigravity.carrom.physics.BodyType
import com.antigravity.carrom.physics.RigidBody2D

object CarromSpecs {
    const val COIN_RADIUS = 15f
    const val STRIKER_RADIUS = 22f

    const val COIN_MASS = 5.5f
    const val STRIKER_MASS = 15.0f

    const val WOOD_RESTITUTION = 0.65f
    const val WOOD_LINEAR_DAMPING = 1.1f
    const val STRIKER_REBOUND = 0.70f
}

sealed class CarromPiece(val body: RigidBody2D)

class Striker(x: Float, y: Float) : CarromPiece(
    RigidBody2D(
        type = BodyType.STRIKER,
        radius = CarromSpecs.STRIKER_RADIUS,
        mass = CarromSpecs.STRIKER_MASS,
        initialX = x,
        initialY = y
    ).apply {
        restitution = CarromSpecs.STRIKER_REBOUND
        linearDamping = CarromSpecs.WOOD_LINEAR_DAMPING
    }
)

class CarromCoin(val coinType: BodyType, x: Float, y: Float) : CarromPiece(
    RigidBody2D(
        type = coinType,
        radius = CarromSpecs.COIN_RADIUS,
        mass = CarromSpecs.COIN_MASS,
        initialX = x,
        initialY = y
    ).apply {
        restitution = CarromSpecs.WOOD_RESTITUTION
        linearDamping = CarromSpecs.WOOD_LINEAR_DAMPING
    }
) {
    init {
        require(coinType == BodyType.WHITE_COIN || coinType == BodyType.BLACK_COIN || coinType == BodyType.QUEEN)
    }
}
