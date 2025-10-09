import Foundation

final class TelemetryClient {
    struct MetricRecord: Codable {
        let name: String
        let value: Double
        let deviceClass: String
        let sampled: Bool
    }

    struct DeviceProfilePayload: Codable {
        let id: String
        let tier: String
        let estimatedFps: Double
        let defaultRuntime: String
        let activeRuntime: String
    }

    private(set) var metrics: [MetricRecord] = []
    private(set) var deviceProfiles: [DeviceProfilePayload] = []
    private(set) var impactTriggerCount: Int = 0
    private(set) var events: [(name: String, payload: [String: Any])] = []
    private var analyticsConfigSignatures: Set<String> = []

    func emit(name: String, value: Double, deviceClass: String, sampled: Bool) {
        metrics.append(MetricRecord(name: name, value: value, deviceClass: deviceClass, sampled: sampled))
    }

    func postDeviceProfile(profile: DeviceProfile, activeRuntime: String) {
        deviceProfiles.append(
            DeviceProfilePayload(
                id: profile.id,
                tier: profile.tier.rawValue,
                estimatedFps: profile.estimatedFps,
                defaultRuntime: profile.defaultRuntime.rawValue,
                activeRuntime: activeRuntime
            )
        )
    }

    func logImpactTriggerEvent(magnitudeDb: Double) {
        impactTriggerCount += 1
        emit(name: "impact_trigger", value: magnitudeDb, deviceClass: "audio", sampled: true)
    }

    func logHudCalibration() {
        emit(name: "arhud_calibrate", value: 1.0, deviceClass: "arhud", sampled: false)
    }

    func logHudRecenter() {
        emit(name: "arhud_recenter", value: 1.0, deviceClass: "arhud", sampled: false)
    }

    func logHudFps(_ fps: Double) {
        emit(name: "arhud_fps", value: fps, deviceClass: "arhud", sampled: true)
    }

    func logBundleRefresh(status: String, etag: String?, ageDays: Int) {
        var payload: [String: Any] = [
            "status": status,
            "age_days": ageDays
        ]
        if let etag = etag {
            payload["etag"] = etag
        }
        send(event: "bundle_refresh", payload: payload)
    }

    func send(event: String, payload: [String: Any]) {
        events.append((name: event, payload: payload))
    }

    func sendFieldMarker(event: String, hole: Int?, timestamp: TimeInterval) {
        var payload: [String: Any] = [
            "event": event,
            "timestamp": timestamp
        ]
        if let hole, hole > 0 {
            payload["hole"] = hole
        }
        send(event: "field_marker", payload: payload)
    }

    func sendFieldRunSummary(holesPlayed: Int, recenterCount: Int, averageFps: Double, batteryDelta: Double) {
        let payload: [String: Any] = [
            "holes": holesPlayed,
            "recenter_count": recenterCount,
            "avg_fps": averageFps,
            "battery_delta": batteryDelta
        ]
        send(event: "field_run_summary", payload: payload)
    }

    func sendThermalBattery(thermal: String, batteryPct: Double, drop15m: Double, action: String) {
        send(
            event: "thermal_battery",
            payload: [
                "thermal": thermal,
                "battery_pct": batteryPct,
                "drop_15m_pct": drop15m,
                "action": action
            ]
        )
    }

    func logRemoteConfigActive(
        hash: String,
        profile: DeviceProfile,
        runtime: [String: Any],
        inputSize: Int,
        reducedRate: Bool
    ) {
        var payload: [String: Any] = [
            "configHash": hash,
            "device": [
                "id": profile.id,
                "tier": profile.tier.rawValue,
                "os": profile.osVersion,
                "estimatedFps": profile.estimatedFps
            ],
            "runtime": runtime,
            "inputSize": inputSize,
            "reducedRate": reducedRate
        ]
        if profile.estimatedFps > 0 {
            payload["latencyMs"] = 1000.0 / profile.estimatedFps
        }
        send(event: "remote_config_active", payload: payload)
    }

    func logPlaysLikeEval(
        D: Double,
        deltaH: Double,
        wParallel: Double,
        eff: Double,
        kS: Double,
        kHW: Double,
        quality: String
    ) {
        let payload: [String: Any] = [
            "D": D,
            "deltaH": deltaH,
            "wParallel": wParallel,
            "eff": eff,
            "kS": kS,
            "kHW": kHW,
            "quality": quality
        ]
        send(event: "plays_like_eval", payload: payload)
    }

    func logPlaysLikeAssign(variant: String, tier: String, kS: Double, alphaHead: Double, alphaTail: Double) {
        let payload: [String: Any] = [
            "variant": variant,
            "tier": tier,
            "kS": kS,
            "alphaHead": alphaHead,
            "alphaTail": alphaTail
        ]
        send(event: "plays_like_assign", payload: payload)
    }

    func logPlaysLikeUi(action: String, dtMs: Double) {
        let payload: [String: Any] = [
            "action": action,
            "dt_ms": dtMs
        ]
        send(event: "plays_like_ui", payload: payload)
    }

    func logAnalyticsConfig(
        analyticsEnabled: Bool,
        crashEnabled: Bool,
        dsnPresent: Bool,
        configHash: String
    ) {
        let signature = "\(configHash):\(analyticsEnabled):\(crashEnabled):\(dsnPresent)"
        guard !analyticsConfigSignatures.contains(signature) else { return }
        analyticsConfigSignatures.insert(signature)
        send(
            event: "analytics_cfg",
            payload: [
                "configHash": configHash,
                "enabled": analyticsEnabled || crashEnabled,
                "analyticsEnabled": analyticsEnabled,
                "crashEnabled": crashEnabled,
                "dsn_present": dsnPresent
            ]
        )
    }
}
