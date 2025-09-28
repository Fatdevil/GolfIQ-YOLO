export class TraceSampler {
  constructor(private rate: number = 0.1) {
    if (rate < 0 || rate > 1) {
      throw new Error("rate must be between 0 and 1");
    }
  }

  shouldSample(random: number = Math.random()): boolean {
    return random < this.rate;
  }
}