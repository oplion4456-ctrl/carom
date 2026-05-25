// Web Audio API Sound Synthesizer for Tactile Game Sound Effects
class AudioSynthesizer {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (this.ctx) return;
        // Lazily initialize context on first user interaction to bypass browser security policies
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            this.ctx = new AudioContextClass();
        }
    }

    /**
     * Wood-on-wood collision click/clack sound.
     */
    playClack(speed) {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;

        // Scale volume with collision speed
        const volume = Math.min(speed / 300, 1.0);
        if (volume < 0.05) return; // Silent for micro-taps

        const now = this.ctx.currentTime;

        // 1. Clack (high pitch, ultra short decay)
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(650, now);
        osc1.frequency.exponentialRampToValueAtTime(150, now + 0.04);
        
        gain1.gain.setValueAtTime(volume * 0.4, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        // 2. Thump (body resonance, slightly longer decay)
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(140, now);
        osc2.frequency.exponentialRampToValueAtTime(80, now + 0.06);

        gain2.gain.setValueAtTime(volume * 0.6, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        // Connect
        osc1.connect(gain1);
        gain1.connect(this.ctx.destination);

        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);

        // Start/Stop
        osc1.start(now);
        osc1.stop(now + 0.06);
        osc2.start(now);
        osc2.stop(now + 0.13);
    }

    /**
     * Wood board border wall hit (lower frequency thud).
     */
    playWallThud(speed) {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;

        const volume = Math.min(speed / 200, 0.7);
        if (volume < 0.05) return;

        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(95, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);

        gain.gain.setValueAtTime(volume * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.2);
    }

    /**
     * Sinking coin into a pocket (satisfying "shwoop-thud").
     */
    playPocketSink() {
        this.init();
        if (!this.ctx || this.ctx.state === 'suspended') return;

        const now = this.ctx.currentTime;

        // Slide down
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.25);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        // Low-pass filtered noise to represent pocket net shuffle
        const bufferSize = this.ctx.sampleRate * 0.25;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(350, now);
        filter.frequency.exponentialRampToValueAtTime(100, now + 0.25);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.18, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        // Connect
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        noiseNode.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);

        // Start/Stop
        osc.start(now);
        osc.stop(now + 0.26);

        noiseNode.start(now);
        noiseNode.stop(now + 0.26);
    }
}

// Export a single instance
const sounds = new AudioSynthesizer();
