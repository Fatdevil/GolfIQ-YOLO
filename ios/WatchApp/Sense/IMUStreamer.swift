import CoreMotion
import WatchConnectivity

private struct PackFrameDTO {
  var sampleTs: TimeInterval
  var wallTs: TimeInterval
  var ax: Double?
  var ay: Double?
  var az: Double?
  var gx: Double?
  var gy: Double?
  var gz: Double?

  var isComplete: Bool { ax != nil && ay != nil && az != nil && gx != nil && gy != nil && gz != nil }

  mutating func merge(accel: CMAccelerometerData, wall: TimeInterval) {
    ax = accel.acceleration.x
    ay = accel.acceleration.y
    az = accel.acceleration.z
    wallTs = min(wallTs, wall)
  }

  mutating func merge(gyro: CMGyroData, wall: TimeInterval) {
    gx = gyro.rotationRate.x
    gy = gyro.rotationRate.y
    gz = gyro.rotationRate.z
    wallTs = min(wallTs, wall)
  }
}

private enum Pack {
  private struct Payload: Codable {
    let v: Int
    let hz: Double
    let t0: Double
    let frames: [Float]
  }

  static func build(hz: Double, frames: [PackFrameDTO]) -> Data? {
    let complete = frames.filter { $0.isComplete }.sorted { $0.wallTs < $1.wallTs }
    guard let first = complete.first else { return nil }

    var payloadFrames = [Float]()
    payloadFrames.reserveCapacity(complete.count * 7)

    var prevTs = first.wallTs
    for (index, frame) in complete.enumerated() {
      let ts = frame.wallTs
      let dtMs: Double
      if index == 0 {
        dtMs = 0
      } else {
        dtMs = max(0, (ts - prevTs) * 1_000)
      }
      prevTs = ts

      payloadFrames.append(Float(frame.ax ?? 0))
      payloadFrames.append(Float(frame.ay ?? 0))
      payloadFrames.append(Float(frame.az ?? 0))
      payloadFrames.append(Float(frame.gx ?? 0))
      payloadFrames.append(Float(frame.gy ?? 0))
      payloadFrames.append(Float(frame.gz ?? 0))
      payloadFrames.append(Float(dtMs))
    }

    let batch = Payload(
      v: 1,
      hz: hz,
      t0: first.wallTs * 1_000,
      frames: payloadFrames
    )

    let encoder = JSONEncoder()
    return try? encoder.encode(batch)
  }
}

final class IMUStreamer {
  static let shared = IMUStreamer()
  private let mm = CMMotionManager()
  private var frames = [PackFrameDTO]()
  private var timer: Timer?
  private let hz: Double = 50
  private let batchMs: Double = 150
  private let queue = OperationQueue()
  private let lock = NSLock()
  private lazy var matchWindow: TimeInterval = max(0.75 / hz, 0.01)

  private init() {
    queue.qualityOfService = .utility
    queue.maxConcurrentOperationCount = 1
  }

  func start() {
    guard !mm.isAccelerometerActive, !mm.isGyroActive else { return }
    guard mm.isAccelerometerAvailable, mm.isGyroAvailable else { return }

    mm.accelerometerUpdateInterval = 1.0 / hz
    mm.gyroUpdateInterval = 1.0 / hz

    mm.startAccelerometerUpdates(to: queue) { [weak self] data, _ in
      self?.append(accel: data)
    }

    mm.startGyroUpdates(to: queue) { [weak self] data, _ in
      self?.append(gyro: data)
    }

    DispatchQueue.main.async {
      self.timer?.invalidate()
      self.timer = Timer.scheduledTimer(withTimeInterval: self.batchMs / 1_000.0, repeats: true) { [weak self] _ in
        self?.flush()
      }
    }
  }

  func stop() {
    timer?.invalidate()
    timer = nil
    mm.stopGyroUpdates()
    mm.stopAccelerometerUpdates()

    lock.lock()
    frames.removeAll(keepingCapacity: false)
    lock.unlock()
  }

  private func append(accel: CMAccelerometerData?) {
    guard let accel else { return }
    let wall = Date().timeIntervalSince1970
    let sampleTs = accel.timestamp

    lock.lock()
    defer { lock.unlock() }

    if let index = matchIndex(for: sampleTs) {
      frames[index].merge(accel: accel, wall: wall)
    } else {
      var frame = PackFrameDTO(sampleTs: sampleTs, wallTs: wall)
      frame.merge(accel: accel, wall: wall)
      insert(frame)
    }
    pruneIfNeeded(now: wall)
  }

  private func append(gyro: CMGyroData?) {
    guard let gyro else { return }
    let wall = Date().timeIntervalSince1970
    let sampleTs = gyro.timestamp

    lock.lock()
    defer { lock.unlock() }

    if let index = matchIndex(for: sampleTs) {
      frames[index].merge(gyro: gyro, wall: wall)
    } else {
      var frame = PackFrameDTO(sampleTs: sampleTs, wallTs: wall)
      frame.merge(gyro: gyro, wall: wall)
      insert(frame)
    }
    pruneIfNeeded(now: wall)
  }

  private func matchIndex(for sampleTs: TimeInterval) -> Int? {
    var bestIndex: Int?
    var bestDelta = TimeInterval.greatestFiniteMagnitude
    for (index, frame) in frames.enumerated() {
      let delta = abs(frame.sampleTs - sampleTs)
      if delta < bestDelta, delta <= matchWindow {
        bestDelta = delta
        bestIndex = index
      }
    }
    return bestIndex
  }

  private func insert(_ frame: PackFrameDTO) {
    let index = frames.firstIndex { $0.sampleTs > frame.sampleTs } ?? frames.endIndex
    frames.insert(frame, at: index)
  }

  private func pruneIfNeeded(now: TimeInterval) {
    let horizon = now - max(batchMs / 1_000.0 * 4, 0.5)
    if let firstIndex = frames.firstIndex(where: { $0.wallTs >= horizon }) {
      if firstIndex > 0 {
        frames.removeFirst(firstIndex)
      }
    } else if !frames.isEmpty {
      frames.removeAll(keepingCapacity: true)
    }
  }

  private func flush() {
    let ready: [PackFrameDTO]

    lock.lock()
    let split = frames.partitioned { $0.isComplete }
    ready = split.included
    frames = split.excluded
    lock.unlock()

    guard !ready.isEmpty, let batch = Pack.build(hz: hz, frames: ready) else { return }

    if WCSession.default.isPaired, WCSession.default.isReachable {
      WCSession.default.sendMessageData(batch, replyHandler: nil, errorHandler: nil)
    }
  }
}

private extension Array {
  typealias PartitionResult = (included: [Element], excluded: [Element])

  func partitioned(_ isIncluded: (Element) -> Bool) -> PartitionResult {
    var included: [Element] = []
    var excluded: [Element] = []
    included.reserveCapacity(count)
    excluded.reserveCapacity(count)
    for element in self {
      if isIncluded(element) {
        included.append(element)
      } else {
        excluded.append(element)
      }
    }
    return (included, excluded)
  }
}
