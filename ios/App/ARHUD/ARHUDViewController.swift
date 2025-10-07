import ARKit
import CoreLocation
import SceneKit
import UIKit

final class ARHUDViewController: UIViewController, ARSCNViewDelegate, CLLocationManagerDelegate {
    private let sceneView = ARSCNView(frame: .zero)
    private let overlayView = ARHUDOverlayView()
    private let courseLoader: ARHUDCourseBundleLoader
    private let telemetry: TelemetryClient
    private let featureFlags: FeatureFlagsService
    private let courseId: String
    private let profileProvider: DeviceProfileProviding
    private let runtimeDescriptor: () -> [String: Any]
    private let remoteConfigBaseURL: URL?
    private var remoteConfigClient: RemoteConfigClient?
    private let thermalWatcher = ThermalWatcher()
    private let batteryMonitor = BatteryMonitor()
    private var fallbackTimer: Timer?
    private let fallbackInterval: TimeInterval = 60
    private var lastFallbackAction: FallbackAction = .none

    private let locationManager = CLLocationManager()
    private var currentCourse: ARHUDCourseBundle?
    private var calibrationAnchor: ARAnchor?
    private var originLocation: CLLocation?
    private var lastCalibrationAltitude: CLLocationDistance?
    private var headingOffset: CLLocationDirection = 0
    private var fpsDisplayLink: CADisplayLink?
    private var fpsSamples: [CFTimeInterval] = []
    private var lastFpsEmission: CFTimeInterval = 0
    private let fpsEmissionInterval: CFTimeInterval = 5.0
    private var geospatialAnchors: [ARAnchor] = []
    private var geospatialAnchorMetadata: [UUID: (label: String, color: UIColor)] = [:]
    private var geospatialSessionActive = false
    private var refreshObserver: NSObjectProtocol?
    private var fieldTestEnabled = false
    private var fieldTestLatencyBucket: String = "–"
    private var lastFpsOverlayUpdate: CFTimeInterval = 0
    private var lastEtagOverlayUpdate: CFTimeInterval = 0
    private var fieldRunSession: FieldRunSession?
    private var analyticsCoordinator: AnalyticsCoordinator?
    private let elevationProvider = PlaysLikeElevationProvider()
    private let windProvider = PlaysLikeWindProvider()
    private let playsLikeOptions = PlaysLikeOptions()

    init(
        courseId: String,
        courseLoader: ARHUDCourseBundleLoader,
        telemetry: TelemetryClient,
        featureFlags: FeatureFlagsService,
        profileProvider: DeviceProfileProviding? = nil,
        runtimeDescriptor: @escaping () -> [String: Any] = { [:] },
        remoteConfigBaseURL: URL? = nil
    ) {
        self.courseId = courseId
        self.courseLoader = courseLoader
        self.telemetry = telemetry
        self.featureFlags = featureFlags
        self.profileProvider = profileProvider ?? DeviceProfileManager(
            microbench: StaticMicrobench(),
            telemetry: telemetry
        )
        self.runtimeDescriptor = runtimeDescriptor
        self.remoteConfigBaseURL = remoteConfigBaseURL ?? courseLoader.baseURL
        let profile = self.profileProvider.deviceProfile()
        self.fieldTestLatencyBucket = Self.computeLatencyBucket(for: profile.estimatedFps)
        featureFlags.applyDeviceTier(profile: profile)
        if let analyticsBaseURL = self.remoteConfigBaseURL {
            let coordinator = AnalyticsCoordinator(
                telemetry: telemetry,
                baseURL: analyticsBaseURL,
                dsnProvider: { ProcessInfo.processInfo.environment["SENTRY_DSN_MOBILE"] }
            )
            coordinator.apply(
                flags: featureFlags.current(),
                configHash: "tier-\(profile.tier.rawValue.lowercased())"
            )
            self.analyticsCoordinator = coordinator
        } else {
            self.analyticsCoordinator = nil
        }
        super.init(nibName: nil, bundle: nil)

        guard featureFlags.current().hudEnabled else {
            assertionFailure("ARHUDViewController should only be presented when hudEnabled flag is true")
            return
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        configureSceneView()
        configureOverlay()
        configureLocationServices()
        configureDisplayLink()
        overlayView.updateModeBadge(.compass)
        updateFieldTestTrackingLabel()
        refreshObserver = NotificationCenter.default.addObserver(
            forName: .arhudBundleRefreshRequested,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.handleManualBundleRefresh()
        }
        loadCourseBundle()
        startRemoteConfig()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        overlayView.isHidden = !featureFlags.current().hudEnabled
        startFallbackMonitoring()
        startSession()
        updateFieldTestUi()
    }

    private func startRemoteConfig() {
        guard let baseURL = remoteConfigBaseURL else { return }
        let client = RemoteConfigClient(
            baseURL: baseURL,
            profileProvider: profileProvider,
            featureFlags: featureFlags,
            telemetry: telemetry,
            runtimeDescriptor: runtimeDescriptor,
            onFlagsApplied: { [weak self] flags, hash in
                self?.handleRemoteFlags(flags: flags, hash: hash)
            }
        )
        remoteConfigClient = client
        client.start()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        sceneView.session.pause()
        fpsDisplayLink?.invalidate()
        stopFallbackMonitoring()
    }

    deinit {
        fpsDisplayLink?.invalidate()
        locationManager.stopUpdatingHeading()
        locationManager.stopUpdatingLocation()
        stopFallbackMonitoring()
        if let refreshObserver {
            NotificationCenter.default.removeObserver(refreshObserver)
        }
    }

    private func configureSceneView() {
        sceneView.delegate = self
        sceneView.automaticallyUpdatesLighting = true
        sceneView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(sceneView)

        NSLayoutConstraint.activate([
            sceneView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            sceneView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            sceneView.topAnchor.constraint(equalTo: view.topAnchor),
            sceneView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func configureOverlay() {
        overlayView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(overlayView)

        NSLayoutConstraint.activate([
            overlayView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlayView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            overlayView.topAnchor.constraint(equalTo: view.topAnchor),
            overlayView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        overlayView.isHidden = !featureFlags.current().hudEnabled
        overlayView.setPlaysLikeVisible(featureFlags.current().playsLikeEnabled)
        overlayView.calibrateButton.addTarget(self, action: #selector(handleCalibrateTapped), for: .touchUpInside)
        overlayView.recenterButton.addTarget(self, action: #selector(handleRecenterTapped), for: .touchUpInside)
        overlayView.markButton.addTarget(self, action: #selector(handleMarkTapped), for: .touchUpInside)
        overlayView.fieldRunStartButton.addTarget(self, action: #selector(handleFieldRunStart), for: .touchUpInside)
        overlayView.fieldRunNextButton.addTarget(self, action: #selector(handleFieldRunNext), for: .touchUpInside)
        overlayView.fieldRunEndButton.addTarget(self, action: #selector(handleFieldRunEnd), for: .touchUpInside)
        updateFieldTestUi(force: true)
    }

    private func configureLocationServices() {
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.headingFilter = 1
        locationManager.requestWhenInUseAuthorization()
        if #available(iOS 14.0, *) {
            locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
            if locationManager.accuracyAuthorization == .reducedAccuracy {
                locationManager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "ARHUDGeo")
            }
        }
        locationManager.startUpdatingLocation()
        locationManager.startUpdatingHeading()
    }

    private func configureDisplayLink() {
        fpsDisplayLink = CADisplayLink(target: self, selector: #selector(handleDisplayLink(_:)))
        fpsDisplayLink?.add(to: .main, forMode: .common)
    }

    private func startFallbackMonitoring() {
        thermalWatcher.start()
        batteryMonitor.start()

        fallbackTimer?.invalidate()
        let timer = Timer.scheduledTimer(withTimeInterval: fallbackInterval, repeats: true) { [weak self] _ in
            self?.evaluateFallbackState()
        }
        timer.tolerance = 5
        fallbackTimer = timer

        evaluateFallbackState()
    }

    private func stopFallbackMonitoring() {
        fallbackTimer?.invalidate()
        fallbackTimer = nil
        thermalWatcher.stop()
        batteryMonitor.stop()
        lastFallbackAction = .none
    }

    private func evaluateFallbackState() {
        let thermalState = thermalWatcher.currentStateString()
        let batteryDrop = batteryMonitor.dropLast15Minutes()
        let batteryLevel = batteryMonitor.currentLevel()

        let action = FallbackPolicy.evaluate(thermal: thermalState, drop15m: batteryDrop)
        telemetry.sendThermalBattery(
            thermal: thermalState,
            batteryPct: batteryLevel,
            drop15m: batteryDrop,
            action: action.rawValue
        )

        if action == .switchTo2D, lastFallbackAction != .switchTo2D {
            HUDRuntime.shared.switchTo2DCompass()
        }

        lastFallbackAction = action
    }

    private func startSession() {
        guard ARWorldTrackingConfiguration.isSupported else {
            overlayView.updateStatus("ARKit world tracking not supported on this device")
            return
        }

        if #available(iOS 14.0, *), ARGeoTrackingConfiguration.isSupported {
            ARGeoTrackingConfiguration.checkAvailability { [weak self] available, _ in
                DispatchQueue.main.async {
                    guard let self else { return }
                    if available {
                        self.runGeoTrackingSession()
                    } else {
                        self.runWorldTrackingSession()
                    }
                }
            }
        } else {
            runWorldTrackingSession()
        }
    }

    private func runWorldTrackingSession() {
        geospatialSessionActive = false
        geospatialAnchors.removeAll()
        geospatialAnchorMetadata.removeAll()
        let configuration = ARWorldTrackingConfiguration()
        configuration.worldAlignment = .gravityAndHeading
        configuration.planeDetection = [.horizontal]
        sceneView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
        overlayView.updateModeBadge(.compass)
        updateFieldTestTrackingLabel()
    }

    @available(iOS 14.0, *)
    private func runGeoTrackingSession() {
        geospatialSessionActive = true
        geospatialAnchors.removeAll()
        geospatialAnchorMetadata.removeAll()
        let configuration = ARGeoTrackingConfiguration()
        configuration.environmentTexturing = .automatic
        configuration.planeDetection = []
        configuration.worldAlignment = .gravity
        if let location = locationManager.location {
            configuration.initialLocation = location
        }
        sceneView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
        overlayView.updateModeBadge(.geospatial)
        updateFieldTestTrackingLabel()
    }

    private func loadCourseBundle(forceRefresh: Bool = false) {
        overlayView.updateStatus(forceRefresh ? "Refreshing course bundle…" : "Loading course bundle…")
        courseLoader.load(courseId: courseId, forceRefresh: forceRefresh) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case let .success(bundle):
                    self?.currentCourse = bundle
                    self?.clearGeospatialAnchors()
                    self?.sceneView.scene.rootNode.childNodes.forEach { $0.removeFromParentNode() }
                    self?.overlayView.updateStatus("Aim at pin and calibrate")
                    self?.updateDistances(with: self?.locationManager.location)
                case let .failure(error):
                    self?.overlayView.updateStatus("Failed to load course: \(error.localizedDescription)")
                }
            }
        }
    }

    @objc
    private func handleManualBundleRefresh() {
        sendFieldMarker("bundle_refresh")
        loadCourseBundle(forceRefresh: true)
    }

    @objc
    private func handleCalibrateTapped() {
        guard featureFlags.current().hudEnabled else {
            overlayView.updateStatus("HUD disabled in settings")
            return
        }

        guard let course = currentCourse else {
            overlayView.updateStatus("Course not loaded yet")
            return
        }

        guard let location = locationManager.location else {
            overlayView.updateStatus("Waiting for GPS lock…")
            return
        }

        guard let frame = sceneView.session.currentFrame else {
            overlayView.updateStatus("No AR frame available")
            return
        }

        originLocation = location
        headingOffset = computeHeadingOffset(from: location, to: course.pin.location)

        if #available(iOS 14.0, *), geospatialSessionActive,
           attemptGeospatialPlacement(course: course, frame: frame, location: location, showFallbackMessage: true) {
            updateDistances(with: location)
            telemetry.logHudCalibration()
            overlayView.updateStatus("Calibrated – geospatial anchors pinned")
            updateFieldTestTrackingLabel()
            return
        }

        overlayView.updateModeBadge(.compass)
        updateFieldTestTrackingLabel()
        clearGeospatialAnchors()

        if let anchor = calibrationAnchor {
            sceneView.session.remove(anchor: anchor)
        }

        let anchor = ARAnchor(transform: frame.camera.transform)
        sceneView.session.add(anchor: anchor)
        calibrationAnchor = anchor

        placeMarkers(for: course, origin: location)
        updateDistances(with: location)
        telemetry.logHudCalibration()
        overlayView.updateStatus("Calibrated – markers pinned")
        updateFieldTestTrackingLabel()
    }

    @objc
    private func handleMarkTapped() {
        showFieldMarkerSheet()
    }

    @objc
    private func handleFieldRunStart() {
        startFieldRun()
    }

    @objc
    private func handleFieldRunNext() {
        advanceFieldRun()
    }

    @objc
    private func handleFieldRunEnd() {
        endFieldRun()
    }

    private func clearGeospatialAnchors() {
        geospatialAnchors.forEach { sceneView.session.remove(anchor: $0) }
        geospatialAnchors.removeAll()
        geospatialAnchorMetadata.removeAll()
        updateFieldTestTrackingLabel()
    }

    @available(iOS 14.0, *)
    private func attemptGeospatialPlacement(
        course: ARHUDCourseBundle,
        frame: ARFrame,
        location: CLLocation,
        showFallbackMessage: Bool
    ) -> Bool {
        let status = frame.geoTrackingStatus
        guard status.state == .localized, status.accuracy == .high else {
            if showFallbackMessage {
                overlayView.updateStatus("Geospatial alignment not ready, using compass fallback")
            } else {
                overlayView.updateStatus("Geospatial alignment not ready")
            }
            return false
        }

        let altitude = location.altitude
        lastCalibrationAltitude = altitude
        clearGeospatialAnchors()
        sceneView.scene.rootNode.childNodes.forEach { $0.removeFromParentNode() }

        let targets: [(CLLocationCoordinate2D, String, UIColor)] = [
            (course.pin.location.coordinate, "Pin", .systemRed),
            (course.greenFront.location.coordinate, "Front", .systemGreen),
            (course.greenCenter.location.coordinate, "Center", .systemTeal),
            (course.greenBack.location.coordinate, "Back", .systemBlue)
        ]

        targets.forEach { coordinate, label, color in
            let anchor = ARGeoAnchor(coordinate: coordinate, altitude: altitude)
            sceneView.session.add(anchor: anchor)
            geospatialAnchors.append(anchor)
            geospatialAnchorMetadata[anchor.identifier] = (label: label, color: color)
        }

        calibrationAnchor = nil
        overlayView.updateModeBadge(.geospatial)
        updateFieldTestTrackingLabel()
        return true
    }

    @objc
    private func handleRecenterTapped() {
        if #available(iOS 14.0, *), geospatialSessionActive,
           !geospatialAnchors.isEmpty,
           let course = currentCourse {
            guard let frame = sceneView.session.currentFrame else {
                overlayView.updateStatus("No AR frame available")
                return
            }
            guard let location = locationManager.location ?? originLocation else {
                overlayView.updateStatus("Waiting for GPS lock…")
                return
            }

            if attemptGeospatialPlacement(
                course: course,
                frame: frame,
                location: location,
                showFallbackMessage: false
            ) {
                updateDistances(with: location)
                telemetry.logHudRecenter()
                overlayView.updateStatus("Re-centered geospatial anchors")
                updateFieldTestTrackingLabel()
                onFieldRunRecenter()
            }
            return
        }

        guard let configuration = sceneView.session.configuration else {
            startSession()
            return
        }

        sceneView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])

        if let anchor = calibrationAnchor {
            sceneView.session.add(anchor: anchor)
            if let course = currentCourse, let originLocation = originLocation {
                placeMarkers(for: course, origin: originLocation)
                updateDistances(with: originLocation)
            }
        }

        telemetry.logHudRecenter()
        overlayView.updateStatus("Re-centered scene")
        updateFieldTestTrackingLabel()
        onFieldRunRecenter()
    }

    private func computeHeadingOffset(from location: CLLocation, to target: CLLocation) -> CLLocationDirection {
        let deviceHeading = locationManager.heading?.trueHeading ?? locationManager.heading?.magneticHeading ?? 0
        let bearing = bearingBetween(start: location.coordinate, end: target.coordinate)
        let offset = bearing - deviceHeading
        return offset
    }

    private func bearingBetween(start: CLLocationCoordinate2D, end: CLLocationCoordinate2D) -> CLLocationDirection {
        let startLat = start.latitude.degreesToRadians
        let startLon = start.longitude.degreesToRadians
        let endLat = end.latitude.degreesToRadians
        let endLon = end.longitude.degreesToRadians

        let dLon = endLon - startLon
        let y = sin(dLon) * cos(endLat)
        let x = cos(startLat) * sin(endLat) - sin(startLat) * cos(endLat) * cos(dLon)
        let radiansBearing = atan2(y, x)
        let degrees = radiansBearing.radiansToDegrees
        return fmod((degrees + 360), 360)
    }

    private func placeMarkers(for course: ARHUDCourseBundle, origin: CLLocation) {
        let root = sceneView.scene.rootNode
        root.childNodes.forEach { $0.removeFromParentNode() }

        let pinNode = makeMarkerNode(text: "Pin", color: .systemRed)
        let frontNode = makeMarkerNode(text: "Front", color: .systemGreen)
        let centerNode = makeMarkerNode(text: "Center", color: .systemTeal)
        let backNode = makeMarkerNode(text: "Back", color: .systemBlue)

        pinNode.position = position(for: course.pin.location, relativeTo: origin)
        frontNode.position = position(for: course.greenFront.location, relativeTo: origin)
        centerNode.position = position(for: course.greenCenter.location, relativeTo: origin)
        backNode.position = position(for: course.greenBack.location, relativeTo: origin)

        root.addChildNode(pinNode)
        root.addChildNode(frontNode)
        root.addChildNode(centerNode)
        root.addChildNode(backNode)

        if featureFlags.current().hudTracerEnabled {
            [pinNode, frontNode, centerNode, backNode].forEach { node in
                let tracer = makeTracerNode(to: node.position)
                root.addChildNode(tracer)
            }
        }
    }

    private func position(for coordinate: CLLocation, relativeTo origin: CLLocation) -> SCNVector3 {
        let deltaLat = (coordinate.coordinate.latitude - origin.coordinate.latitude).degreesToRadians
        let deltaLon = (coordinate.coordinate.longitude - origin.coordinate.longitude).degreesToRadians
        let earthRadius: Double = 6_371_000

        let x = earthRadius * deltaLon * cos(origin.coordinate.latitude.degreesToRadians)
        let z = earthRadius * deltaLat

        let adjustedHeading = headingOffset.degreesToRadians
        let rotatedX = x * cos(adjustedHeading) - z * sin(adjustedHeading)
        let rotatedZ = x * sin(adjustedHeading) + z * cos(adjustedHeading)

        return SCNVector3(Float(rotatedX), 0, Float(-rotatedZ))
    }

    private func makeMarkerNode(text: String, color: UIColor) -> SCNNode {
        let textGeometry = SCNText(string: text, extrusionDepth: 0.1)
        textGeometry.font = UIFont.preferredFont(forTextStyle: .headline)
        textGeometry.firstMaterial?.diffuse.contents = color

        let textNode = SCNNode(geometry: textGeometry)
        textNode.scale = SCNVector3(0.01, 0.01, 0.01)
        let billboard = SCNBillboardConstraint()
        billboard.freeAxes = .all
        textNode.constraints = [billboard]

        let sphere = SCNSphere(radius: 0.2)
        sphere.firstMaterial?.diffuse.contents = color.withAlphaComponent(0.6)
        let sphereNode = SCNNode(geometry: sphere)
        sphereNode.position = SCNVector3(0, -0.2, 0)

        let container = SCNNode()
        container.addChildNode(textNode)
        container.addChildNode(sphereNode)
        return container
    }

    func renderer(_ renderer: SCNSceneRenderer, nodeFor anchor: ARAnchor) -> SCNNode? {
        if #available(iOS 14.0, *), geospatialSessionActive,
           let metadata = geospatialAnchorMetadata[anchor.identifier] {
            return makeMarkerNode(text: metadata.label, color: metadata.color)
        }
        return nil
    }

    private func makeTracerNode(to position: SCNVector3) -> SCNNode {
        let vertices = [SCNVector3Zero, position]
        let source = SCNGeometrySource(vertices: vertices)
        let indices: [UInt32] = [0, 1]
        let element = SCNGeometryElement(indices: indices, primitiveType: .line)
        let geometry = SCNGeometry(sources: [source], elements: [element])
        geometry.firstMaterial?.diffuse.contents = UIColor.white.withAlphaComponent(0.35)
        geometry.firstMaterial?.isDoubleSided = true
        return SCNNode(geometry: geometry)
    }

    private func updateDistances(with location: CLLocation?) {
        guard let location = location, let course = currentCourse else {
            overlayView.updateDistances(front: "--", center: "--", back: "--")
            overlayView.setPlaysLikeVisible(false)
            return
        }

        let distances = course.distances(from: location)
        let formatted = distances.formattedYards()
        overlayView.updateDistances(front: formatted.front, center: formatted.center, back: formatted.back)
        updatePlaysLike(distanceMeters: distances.center, location: location, course: course)
    }

    private func updatePlaysLike(distanceMeters: CLLocationDistance, location: CLLocation, course: ARHUDCourseBundle) {
        let flags = featureFlags.current()
        guard flags.playsLikeEnabled, distanceMeters.isFinite, distanceMeters > 0 else {
            overlayView.setPlaysLikeVisible(false)
            return
        }

        let fallbackAltitude: Double? = location.verticalAccuracy >= 0 ? location.altitude : nil

        let playerElevation = elevationProvider.elevationMeters(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            fallback: fallbackAltitude
        )
        let targetLocation = course.greenCenter.location
        let targetElevation = elevationProvider.elevationMeters(
            latitude: targetLocation.coordinate.latitude,
            longitude: targetLocation.coordinate.longitude,
            fallback: nil
        )
        let deltaH = targetElevation - playerElevation
        let bearing = bearingBetween(start: location.coordinate, end: targetLocation.coordinate)
        let wind = windProvider.current(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude, bearingDegrees: bearing)
        let result = PlaysLikeService.compute(
            D: distanceMeters,
            deltaH: deltaH,
            wParallel: wind.parallel,
            opts: playsLikeOptions
        )
        overlayView.setPlaysLikeVisible(true)
        overlayView.updatePlaysLike(
            effective: result.distanceEff,
            slope: result.components.slopeM,
            wind: result.components.windM,
            quality: result.quality.rawValue
        )
        telemetry.logPlaysLikeEval(
            D: distanceMeters,
            deltaH: deltaH,
            wParallel: wind.parallel,
            eff: result.distanceEff,
            kS: playsLikeOptions.kS,
            kHW: playsLikeOptions.kHW,
            quality: result.quality.rawValue
        )
    }

    private func handleRemoteFlags(flags: FeatureFlagConfig, hash: String?) {
        analyticsCoordinator?.apply(flags: flags, configHash: hash)
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if !flags.playsLikeEnabled || !flags.hudEnabled {
                self.overlayView.setPlaysLikeVisible(false)
                return
            }
            guard let course = self.currentCourse, let location = self.locationManager.location else {
                self.overlayView.setPlaysLikeVisible(false)
                return
            }
            let distances = course.distances(from: location)
            self.updatePlaysLike(distanceMeters: distances.center, location: location, course: course)
        }
    }

    @objc
    private func handleDisplayLink(_ link: CADisplayLink) {
        if fieldTestEnabled != featureFlags.current().fieldTestModeEnabled {
            updateFieldTestUi()
        }
        fpsSamples.append(link.timestamp)

        while let first = fpsSamples.first, link.timestamp - first > 1.0 {
            fpsSamples.removeFirst()
        }

        guard let first = fpsSamples.first, first < link.timestamp else {
            return
        }

        let fps = Double(fpsSamples.count - 1) / (link.timestamp - first)
        if fieldTestEnabled && link.timestamp - lastFpsOverlayUpdate >= 0.5 {
            overlayView.updateFieldTestFps(String(format: "%.1f", fps))
            recordFieldRunFps(fps)
            lastFpsOverlayUpdate = link.timestamp
        }
        if fieldTestEnabled && link.timestamp - lastEtagOverlayUpdate >= 60 {
            overlayView.updateFieldTestEtagAge(remoteConfigClient?.etagAgeDays())
            lastEtagOverlayUpdate = link.timestamp
        }
        if link.timestamp - lastFpsEmission >= fpsEmissionInterval {
            telemetry.logHudFps(fps)
            lastFpsEmission = link.timestamp
        }
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let latest = locations.last else { return }
        updateDistances(with: latest)
    }

    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        if status == .denied || status == .restricted {
            overlayView.updateStatus("Location permission required for HUD")
        }
    }
}

private struct StaticMicrobench: InferenceMicrobench {
    func sampleLatency(duration: TimeInterval) -> [Double] {
        let frames = max(1, Int(duration * 60.0 / 1000.0))
        return Array(repeating: 33.0, count: frames)
    }
}

private extension ARHUDViewController {
    static func computeLatencyBucket(for estimatedFps: Double) -> String {
        guard estimatedFps > 0 else { return "unknown" }
        let latency = 1000.0 / estimatedFps
        switch latency {
        case ..<40: return "<40ms"
        case ..<66: return "40-65ms"
        case ..<100: return "66-99ms"
        default: return "≥100ms"
        }
    }

    func updateFieldTestUi(force: Bool = false) {
        let enabled = featureFlags.current().fieldTestModeEnabled
        if enabled != fieldTestEnabled || force {
            fieldTestEnabled = enabled
            overlayView.setFieldTestVisible(enabled)
        }
        guard fieldTestEnabled else {
            overlayView.updateFieldRunState(active: false, currentHole: nil, recenterCount: 0)
            return
        }
        overlayView.updateFieldTestLatency(fieldTestLatencyBucket)
        overlayView.updateFieldTestTracking(geospatialSessionActive ? "Geospatial" : "Compass")
        overlayView.updateFieldTestEtagAge(remoteConfigClient?.etagAgeDays())
        updateFieldRunUi()
    }

    func updateFieldTestTrackingLabel() {
        guard fieldTestEnabled else { return }
        overlayView.updateFieldTestTracking(geospatialSessionActive ? "Geospatial" : "Compass")
    }

    func showFieldMarkerSheet() {
        guard fieldTestEnabled else { return }
        let options: [(String, String)] = [
            ("Tee", "tee"),
            ("Approach", "approach"),
            ("Putt", "putt"),
            ("Re-center", "recenter"),
            ("Bundle refresh", "bundle_refresh")
        ]
        let alert = UIAlertController(title: "Mark event", message: nil, preferredStyle: .alert)
        options.forEach { title, event in
            alert.addAction(UIAlertAction(title: title, style: .default) { [weak self] _ in
                guard let self else { return }
                if event == "recenter" {
                    self.onFieldRunRecenter()
                } else {
                    self.sendFieldMarker(event)
                }
            })
        }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel, handler: nil))
        present(alert, animated: true)
    }

    func sendFieldMarker(_ event: String) {
        guard fieldTestEnabled else { return }
        let hole = fieldRunSession?.currentHole
        telemetry.sendFieldMarker(event: event, hole: hole, timestamp: Date().timeIntervalSince1970 * 1000)
    }

    func startFieldRun() {
        guard fieldTestEnabled else { return }
        let session = FieldRunSession(
            startedAt: Date(),
            currentHole: 1,
            holesCompleted: 0,
            recenterCount: 0,
            fpsSum: 0,
            fpsSamples: 0,
            startBattery: batteryMonitor.currentLevel()
        )
        fieldRunSession = session
        lastFpsOverlayUpdate = 0
        updateFieldRunUi()
        sendFieldMarker("run_start")
    }

    func advanceFieldRun() {
        guard var session = fieldRunSession else { return }
        session.holesCompleted = max(session.holesCompleted, session.currentHole)
        if session.currentHole < 9 {
            session.currentHole += 1
        }
        fieldRunSession = session
        updateFieldRunUi()
    }

    func endFieldRun() {
        guard let session = fieldRunSession else { return }
        var completed = max(session.holesCompleted, session.currentHole)
        completed = min(completed, 9)
        let averageFps = session.fpsSamples > 0 ? session.fpsSum / Double(session.fpsSamples) : 0
        let batteryDelta = session.startBattery - batteryMonitor.currentLevel()
        telemetry.sendFieldRunSummary(
            holesPlayed: completed,
            recenterCount: session.recenterCount,
            averageFps: averageFps,
            batteryDelta: batteryDelta
        )
        fieldRunSession = nil
        updateFieldRunUi()
    }

    func recordFieldRunFps(_ fps: Double) {
        guard var session = fieldRunSession else { return }
        session.fpsSum += fps
        session.fpsSamples += 1
        fieldRunSession = session
    }

    func onFieldRunRecenter() {
        guard fieldTestEnabled else { return }
        sendFieldMarker("recenter")
        if var session = fieldRunSession {
            session.recenterCount += 1
            fieldRunSession = session
        }
        updateFieldRunUi()
    }

    func updateFieldRunUi() {
        if let session = fieldRunSession {
            overlayView.updateFieldRunState(active: true, currentHole: session.currentHole, recenterCount: session.recenterCount)
        } else {
            overlayView.updateFieldRunState(active: false, currentHole: nil, recenterCount: 0)
        }
    }
}

private struct FieldRunSession {
    var startedAt: Date
    var currentHole: Int
    var holesCompleted: Int
    var recenterCount: Int
    var fpsSum: Double
    var fpsSamples: Int
    var startBattery: Double
}

private extension CLLocationDegrees {
    var degreesToRadians: Double { self * .pi / 180.0 }
    var radiansToDegrees: Double { self * 180.0 / .pi }
}
