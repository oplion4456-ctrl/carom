# AntiGravity 2D Carrom Engine

A high-performance, realistic 2D Carrom game architecture for Android written in Kotlin. This project features a custom lightweight 2D physics world specifically designed to mimic polished wood-on-wood sliding dynamics.

## Key Features

1. **AntiGravity Physics Subsystem:**
   - Vector math (`Vector2D`) optimized for frame ticks.
   - Rigid Body modeling (`RigidBody2D`) representing masses, restitution, and linear wood damping friction.
   - Circle-to-circle impulse solver and positional penetration correction.
   - Circular trigger pockets with automatic pocket overlap "sinking" logic.

2. **Wood Dynamics Tuning:**
   - Striker designed to be $\approx 2.7\times$ heavier and $1.5\times$ larger than standard coins to allow authentic momentum transfer.
   - Custom Linear Damping simulating physical wooden powder board slide speeds.

3. **2-Step Touch Input Engine:**
   - **Positioning:** Constrained horizontal slide limits along the bottom baseline.
   - **Aiming:** Vector pull (slingshot) drag release to project mechanical velocity impulses.

4. **Carrom Rule Engine:**
   - Turn state-machine transitions (`Positioning`, `Aiming`, `Simulating`, `Evaluating`).
   - Sunk striker foul penalties (coin respawn inside center with randomized offsets to avoid overlap).
   - Queen Cover Rule sequence automation (scoring queen triggers cover check on next shot).

## Project Structure

```text
AntiGravityCarrom/
├── src/main/kotlin/com/antigravity/carrom/
│   ├── physics/
│   │   ├── Vector2D.kt          # Math vector library
│   │   ├── RigidBody2D.kt       # Rigid body representations
│   │   └── PhysicsWorld.kt      # Collision, constraint, and pocket solvers
│   ├── entities/
│   │   └── CarromEntities.kt    # Regulation configurations for Striker/Coins
│   ├── view/
│   │   └── CarromSurfaceView.kt # Multi-threaded game loop rendering surface
│   └── CarromGameController.kt  # State transitions, controls, and scoring logic
├── .gitignore
└── README.md
```

## Running & Integration

This code is written to be directly imported into an Android Studio project. To display the board:
1. Copy the source directories into your Android Project (`app/src/main/java/` or `app/src/main/kotlin/`).
2. Add `<com.antigravity.carrom.view.CarromSurfaceView>` into your Activity's XML layout file.
3. Launch on an Android Emulator or physical device.
