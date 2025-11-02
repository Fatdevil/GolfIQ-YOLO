import Foundation

struct OverlaySnapshotV1DTO: Codable, Equatable {
  struct Size: Codable, Equatable {
    let w: Double
    let h: Double
  }

  struct Meta: Codable, Equatable {
    let club: String?
    let p50_m: Double?
  }

  let v: Int
  let size: Size
  let ring: [[Double]]
  let corridor: [[Double]]
  let labelsAllowed: Bool
  let meta: Meta?

  var hasValidRing: Bool { ring.count >= 3 }
  var hasValidCorridor: Bool { corridor.count >= 3 }
}
