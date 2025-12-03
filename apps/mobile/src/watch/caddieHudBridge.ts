export type RiskProfile = 'safe' | 'normal' | 'aggressive';
export type ShotShapeIntent = 'fade' | 'draw' | 'straight';

export interface CaddieHudPayload {
  roundId?: string;
  holeNumber?: number;
  par?: number | null;

  rawDistanceM: number;
  playsLikeDistanceM: number;

  club: string;
  intent: ShotShapeIntent;
  riskProfile: RiskProfile;

  coreCarryMinM?: number | null;
  coreCarryMaxM?: number | null;
  coreSideMinM?: number | null;
  coreSideMaxM?: number | null;
  tailLeftProb?: number | null;
  tailRightProb?: number | null;
}

export type CaddieHudMessage =
  | { type: 'hud.update'; payload: CaddieHudPayload }
  | { type: 'hud.clear' };

let outboundHandler: ((msg: CaddieHudMessage) => void) | null = null;

export function registerCaddieHudSender(handler: (msg: CaddieHudMessage) => void): void {
  outboundHandler = handler;
}

export function isCaddieHudAvailable(): boolean {
  return outboundHandler !== null;
}

function send(msg: CaddieHudMessage): void {
  if (!outboundHandler) {
    console.debug('CaddieHUD: outbound handler not registered', msg);
    return;
  }
  outboundHandler(msg);
}

export function sendCaddieHudUpdate(payload: CaddieHudPayload): void {
  send({ type: 'hud.update', payload });
}

export function sendCaddieHudClear(): void {
  send({ type: 'hud.clear' });
}
