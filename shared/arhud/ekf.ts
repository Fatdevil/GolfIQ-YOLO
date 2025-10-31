import { diffRad, wrapRad } from "./angles";

export type EkfParams = {
  q_yaw: number;
  q_bias: number;
  r_mag: number;
};

export const EKF_DEFAULTS: EkfParams = {
  q_yaw: 1e-3,
  q_bias: 5e-5,
  r_mag: 4e-3,
};

type Covariance = {
  p00: number;
  p01: number;
  p10: number;
  p11: number;
};

export class YawEkf {
  private readonly params: EkfParams;
  private readonly cov: Covariance = { p00: 1, p01: 0, p10: 0, p11: 1 };
  private yawValue = 0;
  private biasValue = 0;
  private initialised = false;

  constructor(params?: Partial<EkfParams>) {
    this.params = { ...EKF_DEFAULTS, ...params };
  }

  reset(yaw0: number): void {
    const wrapped = wrapRad(Number.isFinite(yaw0) ? yaw0 : 0);
    this.yawValue = wrapped;
    this.biasValue = 0;
    this.cov.p00 = 1;
    this.cov.p01 = 0;
    this.cov.p10 = 0;
    this.cov.p11 = 1;
    this.initialised = true;
  }

  predict(gyroZ: number, dt: number): void {
    if (!this.initialised) {
      return;
    }
    if (!Number.isFinite(gyroZ) || !Number.isFinite(dt) || dt <= 0) {
      return;
    }

    const yawPred = wrapRad(this.yawValue + (gyroZ - this.biasValue) * dt);
    this.yawValue = yawPred;

    const { p00, p01, p10, p11 } = this.cov;
    const dtNeg = -dt;

    const a00 = p00 + dtNeg * p10;
    const a01 = p01 + dtNeg * p11;
    const a10 = p10;
    const a11 = p11;

    const nextP00 = a00 + dtNeg * a01 + this.params.q_yaw * dt;
    const nextP01 = a01;
    const nextP10 = a10 + dtNeg * a11;
    const nextP11 = a11 + this.params.q_bias * dt;

    this.cov.p00 = nextP00;
    this.cov.p01 = nextP01;
    this.cov.p10 = nextP10;
    this.cov.p11 = nextP11;
    this.symmetrise();
  }

  update(magYaw: number, quality?: number): void {
    if (!this.initialised) {
      if (Number.isFinite(magYaw)) {
        this.reset(magYaw);
      }
      return;
    }
    if (!Number.isFinite(magYaw)) {
      return;
    }

    const qualityClamped = Number.isFinite(quality)
      ? Math.min(1, Math.max(0, quality as number))
      : 1;
    const varianceScale = qualityClamped > 0 ? 1 / (qualityClamped * qualityClamped) : 1e6;
    const measurementVariance = this.params.r_mag * varianceScale;

    const innovation = diffRad(magYaw, this.yawValue);
    const s = this.cov.p00 + measurementVariance;
    if (s <= 0) {
      return;
    }

    const k0 = this.cov.p00 / s;
    const k1 = this.cov.p10 / s;

    this.yawValue = wrapRad(this.yawValue + k0 * innovation);
    this.biasValue += k1 * innovation;

    const hp0 = this.cov.p00;
    const hp1 = this.cov.p01;

    this.cov.p00 -= k0 * hp0;
    this.cov.p01 -= k0 * hp1;
    this.cov.p10 -= k1 * hp0;
    this.cov.p11 -= k1 * hp1;
    this.symmetrise();
  }

  get yaw(): number {
    return wrapRad(this.yawValue);
  }

  get bias(): number {
    return this.biasValue;
  }

  private symmetrise(): void {
    const p01 = (this.cov.p01 + this.cov.p10) / 2;
    this.cov.p01 = p01;
    this.cov.p10 = p01;
  }
}
