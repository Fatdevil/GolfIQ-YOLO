declare const require: undefined | ((name: string) => unknown);

const TARGET_INTERVAL_MS = 1000 / 30;

type HeadingCallback = (headingDeg: number) => void;

type HeadingSource = (cb: HeadingCallback) => () => void;

let testSource: HeadingSource | null = null;

function normalize(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function toDegrees(x: number, y: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return 0;
  }
  const radians = Math.atan2(y, x);
  const degrees = (radians * 180) / Math.PI;
  return normalize(degrees);
}

function magnetometerSource(): HeadingSource | null {
  if (typeof require === "undefined") {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sensors = require("expo-sensors");
    const magnetometer = sensors?.Magnetometer;
    if (!magnetometer) {
      return null;
    }
    if (typeof magnetometer.setUpdateInterval === "function") {
      magnetometer.setUpdateInterval(TARGET_INTERVAL_MS);
    }

    return (cb: HeadingCallback) => {
      let lastEmit = 0;
      const subscription = magnetometer.addListener((event: { x: number; y: number; z: number }) => {
        const nowTs = Date.now();
        if (nowTs - lastEmit < TARGET_INTERVAL_MS * 0.75) {
          return;
        }
        lastEmit = nowTs;
        cb(toDegrees(event.x, event.y));
      });

      return () => {
        if (subscription?.remove) {
          subscription.remove();
        }
      };
    };
  } catch (err) {
    return null;
  }
}

function syntheticSource(): HeadingSource {
  return (cb: HeadingCallback) => {
    let angle = 0;
    const step = () => {
      angle = normalize(angle + 4.5);
      cb(angle);
    };
    const interval = setInterval(step, TARGET_INTERVAL_MS);
    return () => {
      clearInterval(interval);
    };
  };
}

function resolveSource(): HeadingSource {
  if (testSource) {
    return testSource;
  }
  const magnetometer = magnetometerSource();
  if (magnetometer) {
    return magnetometer;
  }
  return syntheticSource();
}

export function subscribeHeading(cb: HeadingCallback): () => void {
  const source = resolveSource();
  return source(cb);
}

export function __setHeadingSourceForTests(source: HeadingSource | null): void {
  testSource = source;
}
