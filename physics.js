// AntiGravity 2D Physics Engine - JavaScript Port for Carrom Game
// Highly optimized and physically calibrated for polished wood-on-wood dynamics.

class Vector2D {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    set(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }

    setFromVec(other) {
        this.x = other.x;
        this.y = other.y;
        return this;
    }

    add(other) {
        this.x += other.x;
        this.y += other.y;
        return this;
    }

    subtract(other) {
        this.x -= other.x;
        this.y -= other.y;
        return this;
    }

    multiply(scalar) {
        this.x *= scalar;
        this.y *= scalar;
        return this;
    }

    dot(other) {
        return this.x * other.x + this.y * other.y;
    }

    lengthSquared() {
        return this.x * this.x + this.y * this.y;
    }

    length() {
        return Math.sqrt(this.lengthSquared());
    }

    normalize() {
        const len = this.length();
        if (len > 0) {
            this.x /= len;
            this.y /= len;
        }
        return this;
    }

    copy() {
        return new Vector2D(this.x, this.y);
    }

    clear() {
        this.x = 0;
        this.y = 0;
    }
}

class RigidBody2D {
    constructor(type, radius, mass, x, y) {
        this.type = type; // 'STRIKER' | 'WHITE_COIN' | 'BLACK_COIN' | 'QUEEN'
        this.radius = radius;
        this.mass = mass;
        this.position = new Vector2D(x, y);
        this.velocity = new Vector2D(0, 0);
        this.acceleration = new Vector2D(0, 0);
        
        // Calibrated bounciness and slide damping representing wood-on-wood sliding
        this.restitution = type === 'STRIKER' ? 0.72 : 0.65;
        this.linearDamping = 1.15; // Realistic friction sliding resistance
        this.isPocketed = false;
    }

    get invMass() {
        return this.mass === 0 ? 0 : 1 / this.mass;
    }

    applyImpulse(impulse) {
        if (this.isPocketed) return;
        this.velocity.x += impulse.x * this.invMass;
        this.velocity.y += impulse.y * this.invMass;
    }

    update(dt) {
        if (this.isPocketed) return;

        // Semi-implicit Euler integration
        this.velocity.x += this.acceleration.x * dt;
        this.velocity.y += this.acceleration.y * dt;

        this.position.x += this.velocity.x * dt;
        this.position.y += this.velocity.y * dt;

        // Linear powder sliding resistance
        this.velocity.multiply(1 - (this.linearDamping * dt));

        // Threshold limit to stop dynamic creep
        const minVelocity = 2.0;
        if (this.velocity.lengthSquared() < minVelocity * minVelocity) {
            this.velocity.clear();
        }

        this.acceleration.clear();
    }
}

class PhysicsWorld {
    constructor(boardSize, pocketRadius, onPocketedCallback, onCollisionCallback) {
        this.boardSize = boardSize;
        this.pocketRadius = pocketRadius;
        this.bodies = [];
        this.onPocketed = onPocketedCallback;
        this.onCollision = onCollisionCallback;

        // Corner pockets positions (slightly offset inward to align with board templates)
        const pocketOffset = pocketRadius * 0.95;
        this.pockets = [
            new Vector2D(pocketOffset, pocketOffset),
            new Vector2D(boardSize - pocketOffset, pocketOffset),
            new Vector2D(pocketOffset, boardSize - pocketOffset),
            new Vector2D(boardSize - pocketOffset, boardSize - pocketOffset)
        ];
    }

    addBody(body) {
        this.bodies.push(body);
    }

    step(dt) {
        this.bodies.forEach(b => b.update(dt));
        this.checkPocketing();
        this.resolveWallCollisions();
        this.resolveCircleCollisions();
    }

    checkPocketing() {
        for (const body of this.bodies) {
            if (body.isPocketed) continue;

            for (let i = 0; i < this.pockets.length; i++) {
                const pocket = this.pockets[i];
                const dx = body.position.x - pocket.x;
                const dy = body.position.y - pocket.y;
                const distSq = dx * dx + dy * dy;

                // Center of gravity drop condition (center of coin overlaps pocket boundary)
                const sinkThreshold = this.pocketRadius * 0.85;
                if (distSq < sinkThreshold * sinkThreshold) {
                    body.isPocketed = true;
                    body.velocity.clear();
                    if (this.onPocketed) this.onPocketed(body, i);
                    break;
                }
            }
        }
    }

    resolveWallCollisions() {
        const wallDamping = 0.80; // Wood border contact dampening
        const borderLimit = this.boardSize;

        for (const body of this.bodies) {
            if (body.isPocketed) continue;

            let hit = false;
            let impactSpeed = 0;

            // Left Border
            if (body.position.x - body.radius < 0) {
                body.position.x = body.radius;
                impactSpeed = Math.abs(body.velocity.x);
                body.velocity.x = -body.velocity.x * body.restitution * wallDamping;
                hit = true;
            }
            // Right Border
            else if (body.position.x + body.radius > borderLimit) {
                body.position.x = borderLimit - body.radius;
                impactSpeed = Math.abs(body.velocity.x);
                body.velocity.x = -body.velocity.x * body.restitution * wallDamping;
                hit = true;
            }

            // Top Border
            if (body.position.y - body.radius < 0) {
                body.position.y = body.radius;
                impactSpeed = Math.abs(body.velocity.y);
                body.velocity.y = -body.velocity.y * body.restitution * wallDamping;
                hit = true;
            }
            // Bottom Border
            else if (body.position.y + body.radius > borderLimit) {
                body.position.y = borderLimit - body.radius;
                impactSpeed = Math.abs(body.velocity.y);
                body.velocity.y = -body.velocity.y * body.restitution * wallDamping;
                hit = true;
            }

            // High-precision threshold check to trigger audio to avoid friction ticking
            if (hit && this.onCollision && impactSpeed > 15) {
                this.onCollision(body, null, impactSpeed);
            }
        }
    }

    resolveCircleCollisions() {
        const count = this.bodies.length;
        for (let i = 0; i < count; i++) {
            for (let j = i + 1; j < count; j++) {
                const a = this.bodies[i];
                const b = this.bodies[j];

                if (a.isPocketed || b.isPocketed) continue;

                const dx = b.position.x - a.position.x;
                const dy = b.position.y - a.position.y;
                const distanceSq = dx * dx + dy * dy;
                const radiusSum = a.radius + b.radius;

                if (distanceSq < radiusSum * radiusSum) {
                    const distance = Math.sqrt(distanceSq);

                    const nx = distance > 0 ? dx / distance : 1;
                    const ny = distance > 0 ? dy / distance : 0;

                    const rvx = b.velocity.x - a.velocity.x;
                    const rvy = b.velocity.y - a.velocity.y;
                    const velAlongNormal = rvx * nx + rvy * ny;

                    // Only resolve if moving towards each other (prevents overlapping stickiness)
                    if (velAlongNormal < 0) {
                        const e = Math.min(a.restitution, b.restitution);

                        const totalInvMass = a.invMass + b.invMass;
                        let impulseScalar = -(1 + e) * velAlongNormal;
                        impulseScalar /= totalInvMass;

                        const impulseX = impulseScalar * nx;
                        const impulseY = impulseScalar * ny;

                        a.velocity.x -= impulseX * a.invMass;
                        a.velocity.y -= impulseY * a.invMass;

                        b.velocity.x += impulseX * b.invMass;
                        b.velocity.y += impulseY * b.invMass;

                        // Positional correction (resolves intersection clipping)
                        const percent = 0.85; // penetration percentage correction
                        const slop = 0.01;
                        const penetration = radiusSum - distance;
                        if (penetration > slop) {
                            const correctionMagnitude = (Math.max(0, penetration - slop) / totalInvMass) * percent;
                            const correctionX = correctionMagnitude * nx;
                            const correctionY = correctionMagnitude * ny;

                            a.position.x -= correctionX * a.invMass;
                            a.position.y -= correctionY * a.invMass;

                            b.position.x += correctionX * b.invMass;
                            b.position.y += correctionY * b.invMass;
                        }

                        // Trigger dynamic audio feedback
                        const impactSpeed = Math.abs(velAlongNormal);
                        if (this.onCollision && impactSpeed > 10) {
                            this.onCollision(a, b, impactSpeed);
                        }
                    }
                }
            }
        }
    }
}
