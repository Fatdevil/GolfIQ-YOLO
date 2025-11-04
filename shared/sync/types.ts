import type { Lie, RoundState, ShotEvent } from "../round/types";

export type CloudRound = Pick<RoundState, "id" | "courseId" | "startedAt" | "finishedAt" | "currentHole" | "tournamentSafe"> & {
  updatedAt: number;
  holes: Record<
    number,
    {
      par: number;
      index?: number;
      pin?: { lat: number; lon: number };
      manualScore?: number;
      manualPutts?: number;
    }
  >;
};

export type CloudShot = Pick<ShotEvent, "id" | "hole" | "seq" | "kind"> & {
  roundId: string;
  updatedAt: number;
  start: ShotEvent["start"];
  end?: ShotEvent["end"];
  startLie: Lie;
  endLie?: Lie;
  club?: string;
  source?: string;
  carry_m?: number;
  toPinStart_m?: number;
  toPinEnd_m?: number;
  sg?: number;
  playsLikePct?: number;
};

export type CloudEvent = {
  eventId: string;
  participantId: string;
  participantName: string;
  roundId: string;
  gross: number;
  net?: number | null;
  sg?: number | null;
  hcp?: number | null;
  holes: { start: number; end: number };
  updatedAt: number;
};
