/**
 * The short sound that tells of a new order (docs/PLAN.md, stage 4). Made with Web Audio, so it
 * needs no file. Browsers allow sound only after the person has used the page once; before that
 * it stays silent, and nothing fails.
 */
let context: AudioContext | null = null;

export function playNewOrderSound(): void {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    const start = context.currentTime;
    for (const [index, frequency] of [880, 1175].entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + index * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, start + index * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.18 + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + index * 0.18);
      oscillator.stop(start + index * 0.18 + 0.18);
    }
  } catch {
    // No audio device or not allowed yet: the new order still shows on the board.
  }
}
