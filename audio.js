// Web Audio API Sound Synthesizer for Tactile Game Sound Effects
// Highly optimized to generate realistic hardwood clacks and low thuds without files.

class AudioSynthesizer {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (this.ctx) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            this.ctx = new AudioContextClass();
        }
    }

    resume() {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Wood-on-wood collision click/clack sound.
     */
    playClack(speed) {
        this.resume();
        if (!this.ctx) return;

        const volume = Math.min(speed / 400, 1.0);
        if (volume < 0.05) return;

        const now = this.ctx.currentTime;

        // 1. High frequency organic timber snap (triangle)
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(750, now);
        osc1.frequency.exponentialRampToValueAtTime(180, now + 0.03);
        
        gain1.gain.setValueAtTime(volume * 0.45, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        // 2. Mid timber resonance body thump (sine)
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(160, now);
        osc2.frequency.exponentialRampToValueAtTime(70, now + 0.07);

        gain2.gain.setValueAtTime(volume * 0.55, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        // Routing
        osc1.connect(gain1);
        gain1.connect(this.ctx.destination);

        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.05);
        osc2.start(now);
        osc2.stop(now + 0.10);
    }

    /**
     * Wood board border wall hit (lower frequency heavy thud).
     */
    playWallThud(speed) {
        this.resume();
        if (!this.ctx) return;

        const volume = Math.min(speed / 300, 0.75);
        if (volume < 0.05) return;

        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);

        gain.gain.setValueAtTime(volume * 0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.16);
    }

    /**
     * Sinking coin into a pocket (satisfying low pass net shuffle "shwup").
     */
    playPocketSink() {
        this.resume();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        // Low sweep
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.22);

        gain.gain.setValueAtTime(0.65, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        // White noise node representing leather net impact
        const bufferSize = this.ctx.sampleRate * 0.20;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.exponentialRampToValueAtTime(80, now + 0.20);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.20, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        noiseNode.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.23);

        noiseNode.start(now);
        noiseNode.stop(now + 0.23);
    }
}

const sounds = new AudioSynthesizer();
