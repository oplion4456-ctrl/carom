# AntiGravity 2D Carrom Engine

A high-performance, realistic 2D Carrom game engine architecture implemented across both **Android (Kotlin)** and **Web (JavaScript/HTML5)** environments. This repository features a bespoke 2D physics world specifically designed to mimic polished wood-on-wood sliding dynamics, dynamic impulse collisions, and regulation carrom game rules.

---

## 📁 Repository Structure

```text
AntiGravityCarrom/
├── src/main/kotlin/com/antigravity/carrom/  # 🤖 Android Kotlin Subsystem
│   ├── physics/
│   │   ├── Vector2D.kt                      # Optimized vector mathematics
│   │   ├── RigidBody2D.kt                   # Circular rigid body properties
│   │   └── PhysicsWorld.kt                  # Collision, boundary, and pocket solvers
│   ├── entities/
│   │   └── CarromEntities.kt                # Regulation Striker and Coins specs
│   ├── view/
│   │   └── CarromSurfaceView.kt             # Multi-threaded SurfaceView canvas thread
│   └── CarromGameController.kt              # Main engine logic and turn arbitration
│
├── web/                                     # 🌐 Web Playable Simulator
│   ├── index.html                           # Visual dashboard layout
│   ├── styles.css                           # Glassmorphic dark premium UI styles
│   ├── physics.js                           # Web port of the physics solver
│   ├── audio.js                             # Web Audio API real-time sound synthesizer
│   └── game.js                              # Canvas loop renderer & event controllers
│
├── .gitignore
└── README.md
```

---

## 🚀 Platform Overviews

### 1. Web Interactive Simulator (`/web`)
Open **`web/index.html`** in any modern web browser or host locally (e.g. `python -m http.server 8000`) to play the game immediately!
* **Aesthetics:** Rendered using dynamic CSS glassmorphism and real-time custom canvas gradient shadows mimicking ivory white coins, charcoal black pieces, a ruby-red Queen, and a neon-green dynamic Striker.
* **Aiming Visuals:** Includes a 2-stage interaction flow. Slide along the baseline to position, then drag back like a slingshot to reveal a red dotted aiming trajectory projection line showing vector direction and force.
* **Dynamic Audio Synthesizer:** Incorporates synthesized, real-time sound effects using the browser's Web Audio API oscillators—generating high-pitched triangle clacks for coin hits, low sine-thuds for wall bounces, and pitch-sliding noise filters for pocket drops.

### 2. Android Kotlin SDK (`/src`)
A clean, modular architectural reference for integration into premium native Android applications.
* **SurfaceView Canvas Loop:** Decoupled from the primary Android Main UI thread, running a dedicated simulation update loop locked at 60 FPS to prevent stuttering.
* **Physics Precision:** Solves circle-to-circle elastic collision impulses using semi-implicit Euler integration, positional penetration correction, wood linear damping ($1.1f$), and pocket boundaries.

---

## 🛠️ Wood Dynamics Tuning

To mimic polished wooden boards, the physics parameters have been calibrated to the following specs:
* **Mass Relationship:** The striker is $\approx 2.7\times$ heavier ($15.0f$) and $1.5\times$ larger ($22f$) than coins ($5.5f$ mass, $15f$ radius) to ensure high-momentum energy transfers.
* **Linear wood friction:** Applied as a continuous kinetic damping modifier:
  $$\vec{v}_{\text{new}} = \vec{v}_{\text{old}} \times (1 - 1.1 \cdot dt)$$
* **Pocket overlap threshold:** Sinks a coin only once the center enters past the rim ($r_{\text{overlap}} < R_{\text{pocket}} \times 0.8$) to simulate realistic gravity drop.

---

## 📜 Standard Carrom Rules Built-In
Both platforms automate standard professional rules:
1. **Foul Striker Sunk:** Sinking the striker incurs a -1 penalty point, and one scored coin is returned to the center circle.
2. **The Queen Cover Rule:** Pocketing the Queen shifts state to "Waiting for Cover". Scoring on the very next shot covers it (+3 points, keep turn); failing to score returns the Queen to the center.
3. **Turn cycling:** Keeps turn on scored shots, cycles to other player on misses.
