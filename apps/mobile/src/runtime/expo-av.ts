class MockSound {
  static async createAsync(_source: any): Promise<{ sound: MockSound }> {
    return { sound: new MockSound() };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setOnPlaybackStatusUpdate(_cb: (status: { isLoaded: boolean; isPlaying: boolean }) => void): void {}

  async unloadAsync(): Promise<void> {
    return Promise.resolve();
  }

  async pauseAsync(): Promise<void> {
    return Promise.resolve();
  }

  async playAsync(): Promise<void> {
    return Promise.resolve();
  }
}

export const Audio = {
  Sound: MockSound,
};

export default { Audio };
