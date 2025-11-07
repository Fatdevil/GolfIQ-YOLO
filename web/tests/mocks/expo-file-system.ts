export default {
  async readAsStringAsync() {
    return '';
  },
  async writeAsStringAsync() {
    // no-op for tests
  },
  async getInfoAsync() {
    return { exists: false };
  },
};
