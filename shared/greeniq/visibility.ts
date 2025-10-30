export function puttFeedbackVisible(opts: {
  tournamentSafe: boolean;
  holeComplete: boolean;
  override: boolean;
}): boolean {
  const { tournamentSafe, holeComplete, override } = opts;
  return holeComplete || (!tournamentSafe && override);
}

export function puttOverrideEnabled(tournamentSafe: boolean): boolean {
  return !tournamentSafe;
}
