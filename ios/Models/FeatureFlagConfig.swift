import Foundation

struct FeatureFlagConfig: Codable {
    enum Source: String, Codable {
        case `default`
        case featureService
        case remoteConfig
        case override
    }

    private enum CodingKeys: String, CodingKey {
        case hudEnabled
        case hudTracerEnabled
        case fieldTestModeEnabled
        case hudWindHintEnabled
        case hudTargetLineEnabled
        case hudBatterySaverEnabled
        case handsFreeImpactEnabled
        case source
        case inputSize
        case reducedRate
        case analyticsEnabled
        case crashEnabled
    }

    var hudEnabled: Bool
    var hudTracerEnabled: Bool
    var fieldTestModeEnabled: Bool
    var hudWindHintEnabled: Bool
    var hudTargetLineEnabled: Bool
    var hudBatterySaverEnabled: Bool
    var handsFreeImpactEnabled: Bool
    var analyticsEnabled: Bool
    var crashEnabled: Bool
    var inputSize: Int
    var reducedRate: Bool
    var source: Source

    init(
        hudEnabled: Bool,
        hudTracerEnabled: Bool,
        fieldTestModeEnabled: Bool,
        hudWindHintEnabled: Bool,
        hudTargetLineEnabled: Bool,
        hudBatterySaverEnabled: Bool,
        handsFreeImpactEnabled: Bool,
        analyticsEnabled: Bool,
        crashEnabled: Bool,
        inputSize: Int,
        reducedRate: Bool,
        source: Source
    ) {
        self.hudEnabled = hudEnabled
        self.hudTracerEnabled = hudTracerEnabled
        self.fieldTestModeEnabled = fieldTestModeEnabled
        self.hudWindHintEnabled = hudWindHintEnabled
        self.hudTargetLineEnabled = hudTargetLineEnabled
        self.hudBatterySaverEnabled = hudBatterySaverEnabled
        self.handsFreeImpactEnabled = handsFreeImpactEnabled
        self.analyticsEnabled = analyticsEnabled
        self.crashEnabled = crashEnabled
        self.inputSize = inputSize
        self.reducedRate = reducedRate
        self.source = source
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        hudEnabled = try container.decodeIfPresent(Bool.self, forKey: .hudEnabled) ?? false
        hudTracerEnabled = try container.decodeIfPresent(Bool.self, forKey: .hudTracerEnabled) ?? false
        fieldTestModeEnabled = try container.decodeIfPresent(Bool.self, forKey: .fieldTestModeEnabled) ?? false
        hudWindHintEnabled = try container.decode(Bool.self, forKey: .hudWindHintEnabled)
        hudTargetLineEnabled = try container.decode(Bool.self, forKey: .hudTargetLineEnabled)
        hudBatterySaverEnabled = try container.decode(Bool.self, forKey: .hudBatterySaverEnabled)
        handsFreeImpactEnabled = try container.decode(Bool.self, forKey: .handsFreeImpactEnabled)
        analyticsEnabled = try container.decodeIfPresent(Bool.self, forKey: .analyticsEnabled) ?? true
        crashEnabled = try container.decodeIfPresent(Bool.self, forKey: .crashEnabled) ?? true
        inputSize = try container.decodeIfPresent(Int.self, forKey: .inputSize) ?? 320
        reducedRate = try container.decodeIfPresent(Bool.self, forKey: .reducedRate) ?? false
        source = try container.decodeIfPresent(Source.self, forKey: .source) ?? .default
    }

    static func forTier(_ tier: DeviceProfile.Tier) -> FeatureFlagConfig {
        switch tier {
        case .a:
            return FeatureFlagConfig(
                hudEnabled: false,
                hudTracerEnabled: false,
                fieldTestModeEnabled: false,
                hudWindHintEnabled: true,
                hudTargetLineEnabled: true,
                hudBatterySaverEnabled: false,
                handsFreeImpactEnabled: true,
                analyticsEnabled: true,
                crashEnabled: true,
                inputSize: 320,
                reducedRate: false,
                source: .default
            )
        case .b:
            return FeatureFlagConfig(
                hudEnabled: false,
                hudTracerEnabled: false,
                fieldTestModeEnabled: false,
                hudWindHintEnabled: true,
                hudTargetLineEnabled: true,
                hudBatterySaverEnabled: true,
                handsFreeImpactEnabled: true,
                analyticsEnabled: true,
                crashEnabled: true,
                inputSize: 320,
                reducedRate: true,
                source: .default
            )
        case .c:
            return FeatureFlagConfig(
                hudEnabled: false,
                hudTracerEnabled: false,
                fieldTestModeEnabled: false,
                hudWindHintEnabled: false,
                hudTargetLineEnabled: false,
                hudBatterySaverEnabled: true,
                handsFreeImpactEnabled: false,
                analyticsEnabled: true,
                crashEnabled: true,
                inputSize: 224,
                reducedRate: true,
                source: .default
            )
        }
    }
}
