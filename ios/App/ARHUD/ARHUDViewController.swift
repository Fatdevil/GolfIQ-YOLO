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
    private let thermalWatcher = ThermalWatcher()
    private let batteryMonitor = BatteryMonitor()
    private var fallbackTimer: Timer?
    private let fallbackInterval: TimeInterval = 60
    private var lastFallbackAction: FallbackAction = .none

    private let locationManager = CLLocationManager()
    private var currentCourse: ARHUDCourseBundle?
    private var calibrationAnchor: ARAnchor?
    private var originLocation: CLLocation?
    private var headingOffset: CLLocationDirection = 0
    private var fpsDisplayLink: CADisplayLink?
    private var fpsSamples: [CFTimeInterval] = []
    private var lastFpsEmission: CFTimeInterval = 0
    private let fpsEmissionInterval: CFTimeInterval = 5.0

    init(
        courseId: String,
        courseLoader: ARHUDCourseBundleLoader,
        telemetry: TelemetryClient,
        featureFlags: FeatureFlagsService
    ) {
        self.courseId = courseId
        self.courseLoader = courseLoader
        self.telemetry = telemetry
        self.featureFlags = featureFlags
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
        loadCourseBundle()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        overlayView.isHidden = !featureFlags.current().hudEnabled
        startFallbackMonitoring()
        startSession()
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
        overlayView.calibrateButton.addTarget(self, action: #selector(handleCalibrateTapped), for: .touchUpInside)
        overlayView.recenterButton.addTarget(self, action: #selector(handleRecenterTapped), for: .touchUpInside)
    }

    private func configureLocationServices() {
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.headingFilter = 1
        locationManager.requestWhenInUseAuthorization()
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

        let configuration = ARWorldTrackingConfiguration()
        configuration.worldAlignment = .gravityAndHeading
        configuration.planeDetection = [.horizontal]
        sceneView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    }

    private func loadCourseBundle() {
        overlayView.updateStatus("Loading course bundle…")
        courseLoader.load(courseId: courseId) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case let .success(bundle):
                    self?.currentCourse = bundle
                    self?.overlayView.updateStatus("Aim at pin and calibrate")
                    self?.updateDistances(with: self?.locationManager.location)
                case let .failure(error):
                    self?.overlayView.updateStatus("Failed to load course: \(error.localizedDescription)")
                }
            }
        }
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
    }

    @objc
    private func handleRecenterTapped() {
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
            return
        }

        let distances = course.distances(from: location)
        let formatted = distances.formattedYards()
        overlayView.updateDistances(front: formatted.front, center: formatted.center, back: formatted.back)
    }

    @objc
    private func handleDisplayLink(_ link: CADisplayLink) {
        fpsSamples.append(link.timestamp)

        while let first = fpsSamples.first, link.timestamp - first > 1.0 {
            fpsSamples.removeFirst()
        }

        guard let first = fpsSamples.first, first < link.timestamp else {
            return
        }

        let fps = Double(fpsSamples.count - 1) / (link.timestamp - first)
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

private extension CLLocationDegrees {
    var degreesToRadians: Double { self * .pi / 180.0 }
    var radiansToDegrees: Double { self * 180.0 / .pi }
}
