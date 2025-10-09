package com.golfiq.hud.arhud

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Choreographer
import android.view.Gravity
import android.widget.FrameLayout
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.ar.core.Anchor
import com.google.ar.core.Config
import com.google.ar.core.Earth
import com.google.ar.core.TrackingState
import com.google.ar.sceneform.AnchorNode
import com.google.ar.sceneform.Node
import com.google.ar.sceneform.math.Quaternion
import com.google.ar.sceneform.math.Vector3
import com.google.ar.sceneform.rendering.Color
import com.google.ar.sceneform.rendering.MaterialFactory
import com.google.ar.sceneform.rendering.ShapeFactory
import com.google.ar.sceneform.ux.ArFragment
import com.golfiq.hud.analytics.AnalyticsCoordinator
import com.golfiq.hud.config.DeviceProfileManager
import com.golfiq.hud.config.FeatureFlagsService
import com.golfiq.hud.config.RemoteConfigClient
import com.golfiq.hud.hud.HUDRuntime
import com.golfiq.hud.inference.RuntimeAdapter
import com.golfiq.hud.model.DeviceProfile
import com.golfiq.hud.model.FeatureFlagConfig
import com.golfiq.hud.playslike.ElevationProvider
import com.golfiq.hud.playslike.WindProvider
import com.golfiq.hud.runtime.BatteryMonitor
import com.golfiq.hud.runtime.FallbackAction
import com.golfiq.hud.runtime.FallbackPolicy
import com.golfiq.hud.runtime.ThermalWatchdog
import com.golfiq.hud.telemetry.TelemetryClient
import com.golfiq.shared.playslike.PlaysLikeService
import org.json.JSONObject
import java.net.URL
import java.util.ArrayDeque
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

class ARHUDActivity : AppCompatActivity(), SensorEventListener {

    private lateinit var arFragment: ArFragment
    private lateinit var overlayView: ARHUDOverlayView
    private lateinit var featureFlags: FeatureFlagsService
    private lateinit var telemetry: TelemetryClient
    private lateinit var analyticsCoordinator: AnalyticsCoordinator
    private lateinit var courseRepository: CourseBundleRepository
    private lateinit var thermalWatchdog: ThermalWatchdog
    private lateinit var batteryMonitor: BatteryMonitor
    private lateinit var courseId: String
    private lateinit var deviceProfile: DeviceProfile
    private lateinit var deviceProfileManager: DeviceProfileManager
    private lateinit var runtimeAdapter: RuntimeAdapter
    private var remoteConfigClient: RemoteConfigClient? = null
    private val elevationProvider = ElevationProvider()
    private val windProvider = WindProvider()
    private var playsLikeOptions = PlaysLikeService.Options()

    private val fallbackHandler = Handler(Looper.getMainLooper())
    private val fallbackIntervalMs = 60_000L
    private val fallbackRunnable = object : Runnable {
        override fun run() {
            evaluateFallbackState()
            fallbackHandler.postDelayed(this, fallbackIntervalMs)
        }
    }
    private var lastFallbackAction: FallbackAction = FallbackAction.NONE
    private var playsLikeDrawerOpenedAtMillis: Long? = null

    private val executor = Executors.newSingleThreadExecutor()
    private val fusedLocationClient by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private val locationRequest: LocationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1_000L).build()
    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let { location ->
                lastLocation = location
                updateDistances()
            }
        }
    }

    private val frameCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            if (fieldTestEnabled != featureFlags.current().fieldTestModeEnabled) {
                updateFieldTestUi()
            }
            fpsSamples.addLast(frameTimeNanos)
            while (fpsSamples.isNotEmpty() && frameTimeNanos - fpsSamples.first() > 1_000_000_000L) {
                fpsSamples.removeFirst()
            }

            if (fpsSamples.size >= 2) {
                val durationNs = (fpsSamples.last() - fpsSamples.first()).coerceAtLeast(1)
                val fps = (fpsSamples.size - 1) * 1_000_000_000.0 / durationNs
                if (fieldTestEnabled && frameTimeNanos - lastFpsOverlayUpdate > 500_000_000L) {
                    overlayView.updateFieldTestFps(String.format(Locale.US, "%.1f", fps))
                    recordFieldRunFps(fps)
                    lastFpsOverlayUpdate = frameTimeNanos
                }
                if (fieldTestEnabled && frameTimeNanos - lastFieldTestEtagUpdate > TimeUnit.MINUTES.toNanos(1)) {
                    overlayView.updateFieldTestEtagAge(remoteConfigClient?.etagAgeDays())
                    lastFieldTestEtagUpdate = frameTimeNanos
                }
                if (frameTimeNanos - lastFpsEmission > 5_000_000_000L) {
                    telemetry.logHudFps(fps)
                    lastFpsEmission = frameTimeNanos
                }
            }

            Choreographer.getInstance().postFrameCallback(this)
        }
    }

    private val sensorManager by lazy { getSystemService(Context.SENSOR_SERVICE) as SensorManager }
    private val rotationVectorSensor by lazy { sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) }

    private var deviceHeading: Double = 0.0
    private var currentCourse: CourseBundle? = null
    private var calibrationAnchor: Anchor? = null
    private var originLocation: Location? = null
    private var lastLocation: Location? = null
    private var headingOffset: Double = 0.0
    private val fpsSamples = ArrayDeque<Long>()
    private var lastFpsEmission: Long = 0
    private val geospatialAnchors = mutableListOf<Anchor>()
    private var usingGeospatial: Boolean = false
    private var lastCalibrationAltitude: Double? = null
    private var refreshRegistration: (() -> Unit)? = null
    private var geospatialSupported: Boolean = false
    private var fieldTestEnabled: Boolean = false
    private var fieldTestLatencyBucket: String = "–"
    private var lastFpsOverlayUpdate: Long = 0
    private var lastFieldTestEtagUpdate: Long = 0
    private var fieldRunSession: FieldRunSession? = null

    private data class FieldRunSession(
        var startedAtMillis: Long,
        var currentHole: Int,
        var holesCompleted: Int,
        var recenterCount: Int,
        var fpsSum: Double,
        var fpsSamples: Int,
        var startBattery: Double,
    )

    private val permissionsLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            startLocationUpdates()
        } else {
            overlayView.updateStatus("Location permission required for AR HUD")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        featureFlags = FeatureFlagsService()
        telemetry = TelemetryClient()
        thermalWatchdog = ThermalWatchdog(this)
        batteryMonitor = BatteryMonitor(this)

        val profilePreferences = getSharedPreferences("device_profile", MODE_PRIVATE)
        val microbench = DeviceProfileManager.Microbench { durationMillis ->
            val iterations = (durationMillis / 16L).coerceAtLeast(1L)
            MutableList(iterations.toInt()) { 33.0 }
        }
        deviceProfileManager = DeviceProfileManager(
            context = this,
            preferences = profilePreferences,
            microbench = microbench,
            telemetryClient = telemetry,
        )
        deviceProfile = deviceProfileManager.ensureProfile()
        fieldTestLatencyBucket = computeLatencyBucket(deviceProfile.estimatedFps)
        runtimeAdapter = RuntimeAdapter(
            getSharedPreferences("runtime_adapter", MODE_PRIVATE),
            deviceProfileManager,
        )
        featureFlags.applyDeviceTier(deviceProfile)

        val baseUrlString = intent.getStringExtra(EXTRA_BASE_URL) ?: DEFAULT_BASE_URL
        val baseUrl = URL(baseUrlString)

        analyticsCoordinator = AnalyticsCoordinator(
            context = applicationContext,
            telemetryClient = telemetry,
            baseUrl = baseUrl,
            dsnProvider = { System.getenv("SENTRY_DSN_MOBILE") },
        )
        analyticsCoordinator.apply(
            featureFlags.current(),
            "tier-${deviceProfile.tier.name.lowercase()}",
        )

        if (!featureFlags.current().hudEnabled) {
            finish()
            return
        }

        courseId = intent.getStringExtra(EXTRA_COURSE_ID) ?: run {
            finish()
            return
        }

        courseRepository = CourseBundleRepository(applicationContext, baseUrl, telemetry)

        remoteConfigClient = RemoteConfigClient(
            baseUrl = baseUrl,
            deviceProfiles = deviceProfileManager,
            featureFlags = featureFlags,
            telemetry = telemetry,
            runtimeAdapter = runtimeAdapter,
            onFlagsApplied = { flags, hash, playsLike -> handleRemoteFlags(flags, hash, playsLike) },
        ).also { it.start() }

        val container = FrameLayout(this).apply { id = CONTAINER_ID }
        overlayView = ARHUDOverlayView(this)
        overlayView.setPlaysLikeVisible(isPlaysLikeUiEnabled(featureFlags.current()))

        setContentView(FrameLayout(this).apply {
            addView(container, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
            addView(overlayView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT).apply {
                gravity = Gravity.BOTTOM
            })
        })

        if (savedInstanceState == null) {
            arFragment = ArFragment()
            supportFragmentManager.beginTransaction()
                .replace(CONTAINER_ID, arFragment)
                .commitNow()
        } else {
            arFragment = supportFragmentManager.findFragmentById(CONTAINER_ID) as ArFragment
        }

        overlayView.updateStatus("Loading course…")
        overlayView.updateModeBadge(ARHUDOverlayView.Mode.COMPASS)
        updateFieldTestTrackingLabel()
        overlayView.alpha = if (featureFlags.current().hudEnabled) 1f else 0f
        overlayView.calibrateButton.setOnClickListener { calibrate() }
        overlayView.recenterButton.setOnClickListener { recenter() }
        overlayView.markButton.setOnClickListener { showFieldMarkerSheet() }
        overlayView.fieldRunStartButton.setOnClickListener { startFieldRun() }
        overlayView.fieldRunNextButton.setOnClickListener { advanceFieldRun() }
        overlayView.fieldRunEndButton.setOnClickListener { endFieldRun() }

        updateFieldTestUi(force = true)

        refreshRegistration = BundleRefreshBus.register {
            sendFieldMarker("bundle_refresh")
            runOnUiThread { loadCourse(courseId, forceRefresh = true) }
        }

        arFragment.setOnSessionConfigurationListener { session, config ->
            if (session.isGeospatialModeSupported(Config.GeospatialMode.ENABLED)) {
                config.geospatialMode = Config.GeospatialMode.ENABLED
                geospatialSupported = true
                overlayView.updateModeBadge(ARHUDOverlayView.Mode.GEOSPATIAL)
                updateFieldTestTrackingLabel()
            } else {
                geospatialSupported = false
                usingGeospatial = false
                overlayView.updateModeBadge(ARHUDOverlayView.Mode.COMPASS)
                updateFieldTestTrackingLabel()
            }
        }

        loadCourse(courseId)
        requestLocationPermission()
    }

    override fun onResume() {
        super.onResume()
        if (rotationVectorSensor != null) {
            sensorManager.registerListener(this, rotationVectorSensor, SensorManager.SENSOR_DELAY_UI)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            startLocationUpdates()
        }
        Choreographer.getInstance().postFrameCallback(frameCallback)
        startFallbackMonitoring()
        updateFieldTestUi()
    }

    override fun onPause() {
        super.onPause()
        sensorManager.unregisterListener(this)
        fusedLocationClient.removeLocationUpdates(locationCallback)
        Choreographer.getInstance().removeFrameCallback(frameCallback)
        stopFallbackMonitoring()
    }

    override fun onDestroy() {
        super.onDestroy()
        calibrationAnchor?.detach()
        geospatialAnchors.forEach { it.detach() }
        geospatialAnchors.clear()
        refreshRegistration?.invoke()
        executor.shutdownNow()
        remoteConfigClient?.shutdown()
    }

    private fun computeLatencyBucket(estimatedFps: Double): String {
        if (estimatedFps <= 0) {
            return "unknown"
        }
        val latencyMs = 1000.0 / estimatedFps
        return when {
            latencyMs < 40 -> "<40ms"
            latencyMs < 66 -> "40-65ms"
            latencyMs < 100 -> "66-99ms"
            else -> "≥100ms"
        }
    }

    private fun updateFieldTestUi(force: Boolean = false) {
        val enabled = featureFlags.current().fieldTestModeEnabled
        if (enabled != fieldTestEnabled) {
            fieldTestEnabled = enabled
            overlayView.setFieldTestVisible(enabled)
            trackPlaysLikeDrawerToggle(enabled)
        } else if (force) {
            overlayView.setFieldTestVisible(enabled)
        }
        if (!fieldTestEnabled) {
            overlayView.updateFieldRunState(false, null, fieldRunSession?.recenterCount ?: 0)
            return
        }
        overlayView.updateFieldTestLatency(fieldTestLatencyBucket)
        overlayView.updateFieldTestTracking(if (usingGeospatial) "Geospatial" else "Compass")
        overlayView.updateFieldTestEtagAge(remoteConfigClient?.etagAgeDays())
        val session = fieldRunSession
        overlayView.updateFieldRunState(session != null, session?.currentHole, session?.recenterCount ?: 0)
    }

    private fun updateFieldTestTrackingLabel() {
        if (!fieldTestEnabled) {
            return
        }
        overlayView.updateFieldTestTracking(if (usingGeospatial) "Geospatial" else "Compass")
    }

    private fun showFieldMarkerSheet() {
        if (!fieldTestEnabled) {
            return
        }
        val options = listOf(
            "Tee" to "tee",
            "Approach" to "approach",
            "Putt" to "putt",
            "Re-center" to "recenter",
            "Bundle refresh" to "bundle_refresh",
        )
        AlertDialog.Builder(this)
            .setTitle("Mark event")
            .setItems(options.map { it.first }.toTypedArray()) { _, which ->
                val selection = options.getOrNull(which) ?: return@setItems
                if (selection.second == "recenter") {
                    onFieldRunRecenter()
                } else {
                    sendFieldMarker(selection.second)
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun sendFieldMarker(event: String) {
        if (!fieldTestEnabled) {
            return
        }
        val hole = fieldRunSession?.currentHole
        telemetry.sendFieldMarker(event, hole, System.currentTimeMillis())
    }

    private fun startFieldRun() {
        if (!fieldTestEnabled) {
            return
        }
        val startBattery = batteryMonitor.currentLevel()
        fieldRunSession = FieldRunSession(
            startedAtMillis = System.currentTimeMillis(),
            currentHole = 1,
            holesCompleted = 0,
            recenterCount = 0,
            fpsSum = 0.0,
            fpsSamples = 0,
            startBattery = startBattery,
        )
        lastFpsOverlayUpdate = 0
        overlayView.updateFieldRunState(true, 1, 0)
        sendFieldMarker("run_start")
    }

    private fun advanceFieldRun() {
        val session = fieldRunSession ?: return
        session.holesCompleted = max(session.holesCompleted, session.currentHole)
        if (session.currentHole < 9) {
            session.currentHole += 1
        }
        overlayView.updateFieldRunState(true, session.currentHole, session.recenterCount)
    }

    private fun endFieldRun() {
        val session = fieldRunSession ?: return
        session.holesCompleted = max(session.holesCompleted, session.currentHole)
        val avgFps = if (session.fpsSamples > 0) session.fpsSum / session.fpsSamples else 0.0
        val batteryDelta = session.startBattery - batteryMonitor.currentLevel()
        telemetry.sendFieldRunSummary(
            holesPlayed = session.holesCompleted.coerceAtMost(9),
            recenterCount = session.recenterCount,
            averageFps = avgFps,
            batteryDelta = batteryDelta,
        )
        fieldRunSession = null
        overlayView.updateFieldRunState(false, null, 0)
    }

    private fun recordFieldRunFps(fps: Double) {
        val session = fieldRunSession ?: return
        session.fpsSum += fps
        session.fpsSamples += 1
    }

    private fun onFieldRunRecenter() {
        if (!fieldTestEnabled) {
            return
        }
        sendFieldMarker("recenter")
        fieldRunSession?.let { session ->
            session.recenterCount += 1
            overlayView.updateFieldRunState(true, session.currentHole, session.recenterCount)
        }
    }

    private fun loadCourse(courseId: String, forceRefresh: Boolean = false) {
        runOnUiThread {
            overlayView.updateStatus(if (forceRefresh) "Refreshing course…" else "Loading course…")
        }
        executor.execute {
            courseRepository.cached(courseId)?.let { cached ->
                currentCourse = cached
                runOnUiThread {
                    overlayView.updateStatus("Aim at pin and calibrate")
                    updateDistances()
                }
            }

            try {
                val bundle = courseRepository.refresh(courseId, forceRefresh)
                currentCourse = bundle
                runOnUiThread {
                    resetAnchors()
                    overlayView.updateStatus("Aim at pin and calibrate")
                    updateDistances()
                }
            } catch (t: Throwable) {
                runOnUiThread {
                    if (currentCourse == null) {
                        overlayView.updateStatus("Failed to load course: ${t.message}")
                    } else {
                        overlayView.updateStatus("Offline – showing cached course")
                    }
                }
            }
        }
    }

    private fun requestLocationPermission() {
        when {
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED -> {
                startLocationUpdates()
            }
            ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.ACCESS_FINE_LOCATION) -> {
                overlayView.updateStatus("Location access needed for distance overlays")
                permissionsLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
            }
            else -> permissionsLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }

    private fun resetAnchors() {
        geospatialAnchors.forEach { it.detach() }
        geospatialAnchors.clear()
        calibrationAnchor?.detach()
        calibrationAnchor = null
        usingGeospatial = false
        lastCalibrationAltitude = null
        val scene = arFragment.arSceneView.scene
        scene.children.filterIsInstance<AnchorNode>().forEach { node ->
            node.anchor?.detach()
            node.setParent(null)
        }
        overlayView.updateModeBadge(ARHUDOverlayView.Mode.COMPASS)
        updateFieldTestTrackingLabel()
    }

    private fun clearGeospatialAnchors() {
        geospatialAnchors.forEach { it.detach() }
        geospatialAnchors.clear()
        usingGeospatial = false
        overlayView.updateModeBadge(ARHUDOverlayView.Mode.COMPASS)
        updateFieldTestTrackingLabel()
    }

    private fun startFallbackMonitoring() {
        thermalWatchdog.start()
        batteryMonitor.start()
        evaluateFallbackState()
        fallbackHandler.removeCallbacks(fallbackRunnable)
        fallbackHandler.postDelayed(fallbackRunnable, fallbackIntervalMs)
    }

    private fun stopFallbackMonitoring() {
        fallbackHandler.removeCallbacks(fallbackRunnable)
        thermalWatchdog.stop()
        batteryMonitor.stop()
        lastFallbackAction = FallbackAction.NONE
    }

    private fun evaluateFallbackState() {
        val thermalState = thermalWatchdog.currentState()
        val batteryDrop = batteryMonitor.dropLast15Minutes()
        val batteryLevel = batteryMonitor.currentLevel()

        val action = FallbackPolicy.evaluate(thermalState, batteryDrop)
        telemetry.sendThermalBattery(
            thermal = thermalState,
            batteryPct = batteryLevel,
            drop15m = batteryDrop,
            action = action.wireName,
        )

        if (action == FallbackAction.SWITCH_TO_2D && lastFallbackAction != FallbackAction.SWITCH_TO_2D) {
            HUDRuntime.switchTo2DCompass()
        }

        lastFallbackAction = action
    }

    private fun startLocationUpdates() {
        fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, mainLooper)
    }

    private fun calibrate() {
        val bundle = currentCourse ?: run {
            overlayView.updateStatus("Course not loaded yet")
            return
        }

        val frame = arFragment.arSceneView.arFrame ?: run {
            overlayView.updateStatus("Tracking not ready")
            return
        }

        val session = arFragment.arSceneView.session ?: return
        val latestLocation = lastLocation ?: run {
            overlayView.updateStatus("Waiting for GPS lock…")
            return
        }

        if (geospatialSupported) {
            val earth = session.earth
            if (earth != null && earth.trackingState == TrackingState.TRACKING) {
                attachGeospatialAnchors(earth, bundle, latestLocation.altitude)
                originLocation = latestLocation
                updateDistances()
                telemetry.logHudCalibration()
                overlayView.updateStatus("Calibrated – geospatial anchors pinned")
                overlayView.updateModeBadge(ARHUDOverlayView.Mode.GEOSPATIAL)
                updateFieldTestTrackingLabel()
                return
            } else {
                overlayView.updateStatus("Geospatial localization not ready, using compass fallback")
                overlayView.updateModeBadge(ARHUDOverlayView.Mode.COMPASS)
                updateFieldTestTrackingLabel()
                clearGeospatialAnchors()
            }
        }

        originLocation = latestLocation
        headingOffset = (bearingBetween(latestLocation, bundle.pin.toLocation()) - deviceHeading + 360) % 360

        calibrationAnchor?.detach()
        val cameraPose = frame.camera.pose
        calibrationAnchor = session.createAnchor(cameraPose)

        placeMarkers(bundle)
        updateDistances()
        telemetry.logHudCalibration()
        overlayView.updateStatus("Calibrated – markers pinned")
        overlayView.updateModeBadge(ARHUDOverlayView.Mode.COMPASS)
        updateFieldTestTrackingLabel()
    }

    private fun recenter() {
        val bundle = currentCourse
        val session = arFragment.arSceneView.session
        if (bundle == null || session == null) {
            overlayView.updateStatus("Calibrate first")
            return
        }

        if (usingGeospatial && geospatialAnchors.isNotEmpty()) {
            val earth = session.earth
            val altitude = lastLocation?.altitude ?: lastCalibrationAltitude
            if (earth != null && earth.trackingState == TrackingState.TRACKING && altitude != null) {
                attachGeospatialAnchors(earth, bundle, altitude)
                updateDistances()
                telemetry.logHudRecenter()
                overlayView.updateStatus("Re-centered geospatial anchors")
                overlayView.updateModeBadge(ARHUDOverlayView.Mode.GEOSPATIAL)
                updateFieldTestTrackingLabel()
                onFieldRunRecenter()
            } else {
                overlayView.updateStatus("Geospatial localization not ready")
            }
            return
        }

        val origin = originLocation ?: run {
            overlayView.updateStatus("Calibrate first")
            return
        }

        calibrationAnchor?.detach()
        val frame = arFragment.arSceneView.arFrame ?: return
        calibrationAnchor = session.createAnchor(frame.camera.pose)
        placeMarkers(bundle)
        updateDistances()
        telemetry.logHudRecenter()
        overlayView.updateStatus("Re-centered scene")
        overlayView.updateModeBadge(ARHUDOverlayView.Mode.COMPASS)
        updateFieldTestTrackingLabel()
        onFieldRunRecenter()
    }

    private fun placeMarkers(bundle: CourseBundle) {
        val scene = arFragment.arSceneView.scene
        clearGeospatialAnchors()
        scene.children.filterIsInstance<AnchorNode>().forEach { node ->
            node.anchor?.detach()
            node.setParent(null)
        }

        val anchor = calibrationAnchor ?: return
        val anchorNode = AnchorNode(anchor).apply { setParent(scene) }

        val origin = originLocation ?: return

        createMarkerNode(anchorNode, bundle.pin, "Pin", Color(1.0f, 0f, 0f))
        createMarkerNode(anchorNode, bundle.greenFront, "Front", Color(0f, 0.8f, 0f))
        createMarkerNode(anchorNode, bundle.greenCenter, "Center", Color(0f, 0.7f, 0.7f))
        createMarkerNode(anchorNode, bundle.greenBack, "Back", Color(0f, 0.4f, 1.0f))
    }

    private fun createMarkerNode(parent: AnchorNode, coordinate: CourseCoordinate, label: String, color: Color) {
        val origin = originLocation ?: return
        val localPosition = positionFor(coordinate, origin)

        val node = Node().apply {
            setParent(parent)
            localPosition = localPosition
            name = label
        }

        MaterialFactory.makeOpaqueWithColor(this, color).thenAccept { material ->
            val sphere = ShapeFactory.makeSphere(0.05f, Vector3.zero(), material)
            node.renderable = sphere
        }

        if (featureFlags.current().hudTracerEnabled) {
            addTracer(parent, localPosition, color)
        }
    }

    private fun attachGeospatialAnchors(earth: Earth, bundle: CourseBundle, altitude: Double) {
        clearGeospatialAnchors()
        calibrationAnchor?.detach()
        calibrationAnchor = null
        val scene = arFragment.arSceneView.scene
        scene.children.filterIsInstance<AnchorNode>().forEach { node ->
            node.anchor?.detach()
            node.setParent(null)
        }

        val entries = listOf(
            Triple(bundle.pin, "Pin", Color(1.0f, 0f, 0f)),
            Triple(bundle.greenFront, "Front", Color(0f, 0.8f, 0f)),
            Triple(bundle.greenCenter, "Center", Color(0f, 0.7f, 0.7f)),
            Triple(bundle.greenBack, "Back", Color(0f, 0.4f, 1.0f)),
        )

        entries.forEach { (coordinate, label, color) ->
            val anchor = earth.createAnchor(coordinate.latitude, coordinate.longitude, altitude, 0f)
            geospatialAnchors += anchor
            val node = AnchorNode(anchor).apply { setParent(scene) }
            createGeospatialNode(node, label, color)
        }

        usingGeospatial = true
        lastCalibrationAltitude = altitude
        updateFieldTestTrackingLabel()
    }

    private fun createGeospatialNode(parent: AnchorNode, label: String, color: Color) {
        val node = Node().apply {
            setParent(parent)
            localPosition = Vector3.zero()
            name = label
        }

        MaterialFactory.makeOpaqueWithColor(this, color).thenAccept { material ->
            val sphere = ShapeFactory.makeSphere(0.05f, Vector3.zero(), material)
            node.renderable = sphere
        }
    }

    private fun addTracer(parent: AnchorNode, position: Vector3, color: Color) {
        MaterialFactory.makeOpaqueWithColor(this, color).thenAccept { material ->
            val vector = Vector3(position.x, position.y, position.z)
            val length = vector.length()
            if (length <= 0f) return@thenAccept
            val midpoint = Vector3(position.x / 2f, position.y / 2f, position.z / 2f)
            val cylinder = ShapeFactory.makeCylinder(0.01f, length, Vector3.zero(), material)
            val tracerNode = Node().apply {
                setParent(parent)
                localPosition = midpoint
                renderable = cylinder
                val normalized = Vector3(vector.x / length, vector.y / length, vector.z / length)
                localRotation = Quaternion.lookRotation(normalized, Vector3.up())
            }
        }
    }

    private fun updateDistances() {
        val bundle = currentCourse ?: return
        val location = lastLocation ?: return
        val distances = bundle.distancesFrom(location)
        val (front, center, back) = distances.formattedYards()
        overlayView.updateDistances(front, center, back)
        updatePlaysLike(distances.center.toDouble())
    }

    private fun updatePlaysLike(distanceOverride: Double? = null) {
        val flags = featureFlags.current()
        if (!isPlaysLikeUiEnabled(flags)) {
            overlayView.setPlaysLikeVisible(false)
            return
        }

        val bundle = currentCourse ?: run {
            overlayView.setPlaysLikeVisible(false)
            return
        }
        val location = lastLocation ?: run {
            overlayView.setPlaysLikeVisible(false)
            return
        }

        val distanceMeters = distanceOverride ?: location.distanceTo(bundle.greenCenter.toLocation()).toDouble()
        if (!distanceMeters.isFinite() || distanceMeters <= 0.0) {
            overlayView.setPlaysLikeVisible(false)
            return
        }

        val playerElevation = elevationProvider.elevationMeters(
            latitude = location.latitude,
            longitude = location.longitude,
            fallback = if (location.hasAltitude()) location.altitude else null,
        )
        val targetCoordinate = bundle.greenCenter
        val targetElevation = elevationProvider.elevationMeters(
            latitude = targetCoordinate.latitude,
            longitude = targetCoordinate.longitude,
            fallback = null,
        )
        val deltaH = targetElevation - playerElevation
        val bearing = bearingBetween(location, targetCoordinate.toLocation())
        val windVector = windProvider.current(location.latitude, location.longitude, bearing)
        val result = PlaysLikeService.compute(distanceMeters, deltaH, windVector.parallel, playsLikeOptions)

        overlayView.setPlaysLikeVisible(true)
        overlayView.updatePlaysLike(
            result.distanceEff,
            result.components.slopeM,
            result.components.windM,
            result.quality.value,
        )

        val config = playsLikeOptions.config ?: PlaysLikeService.Config()
        overlayView.updatePlaysLikeQa(
            distanceMeters = distanceMeters,
            deltaHMeters = deltaH,
            windParallel = windVector.parallel,
            kS = playsLikeOptions.kS,
            alphaHead = config.alphaHeadPerMph,
            alphaTail = config.alphaTailPerMph,
            eff = result.distanceEff,
            quality = result.quality.value,
        )

        telemetry.logPlaysLikeEval(
            D = distanceMeters,
            deltaH = deltaH,
            wParallel = windVector.parallel,
            eff = result.distanceEff,
            kS = playsLikeOptions.kS,
            kHW = playsLikeOptions.kHW,
            quality = result.quality.value,
        )
    }

    private fun handleRemoteFlags(flags: FeatureFlagConfig, hash: String?, playsLikeConfig: JSONObject?) {
        analyticsCoordinator.apply(flags, hash)
        parsePlaysLikeConfig(playsLikeConfig)?.let { config ->
            playsLikeOptions = playsLikeOptions.copy(
                kS = config.slopeFactor,
                config = config,
            )
        }
        val effectiveConfig = playsLikeOptions.config ?: PlaysLikeService.Config()
        telemetry.logPlaysLikeAssign(
            variant = flags.playsLikeVariant.storageValue,
            tier = deviceProfile.tier.name,
            kS = playsLikeOptions.kS,
            alphaHead = effectiveConfig.alphaHeadPerMph,
            alphaTail = effectiveConfig.alphaTailPerMph,
        )
        runOnUiThread {
            if (!isPlaysLikeUiEnabled(flags) || !flags.hudEnabled) {
                overlayView.setPlaysLikeVisible(false)
            } else {
                updatePlaysLike()
            }
        }
    }

    private fun trackPlaysLikeDrawerToggle(visible: Boolean) {
        val now = System.currentTimeMillis()
        if (!isPlaysLikeUiEnabled(featureFlags.current())) {
            playsLikeDrawerOpenedAtMillis = if (visible) now else null
            return
        }
        if (visible) {
            playsLikeDrawerOpenedAtMillis = now
            telemetry.logPlaysLikeUi(action = "drawer_open", dtMs = 0)
        } else {
            val openedAt = playsLikeDrawerOpenedAtMillis
            val duration = if (openedAt != null && now >= openedAt) now - openedAt else 0L
            telemetry.logPlaysLikeUi(action = "drawer_close", dtMs = duration)
            playsLikeDrawerOpenedAtMillis = null
        }
    }

    private fun isPlaysLikeUiEnabled(flags: FeatureFlagConfig): Boolean {
        return flags.playsLikeEnabled && flags.playsLikeVariant == FeatureFlagConfig.PlaysLikeVariant.V1
    }

    private fun parsePlaysLikeConfig(json: JSONObject?): PlaysLikeService.Config? {
        json ?: return null
        val defaults = PlaysLikeService.Config()
        return PlaysLikeService.Config(
            windModel = json.optString("windModel", defaults.windModel),
            alphaHeadPerMph = json.optDouble("alphaHead_per_mph", defaults.alphaHeadPerMph),
            alphaTailPerMph = json.optDouble("alphaTail_per_mph", defaults.alphaTailPerMph),
            slopeFactor = json.optDouble("slopeFactor", defaults.slopeFactor),
            windCapPctOfD = json.optDouble("windCap_pctOfD", defaults.windCapPctOfD),
            taperStartMph = json.optDouble("taperStart_mph", defaults.taperStartMph),
            sidewindDistanceAdjust = json.optBoolean("sidewindDistanceAdjust", defaults.sidewindDistanceAdjust),
        )
    }

    private fun bearingBetween(start: Location, target: Location): Double {
        val lat1 = Math.toRadians(start.latitude)
        val lat2 = Math.toRadians(target.latitude)
        val dLon = Math.toRadians(target.longitude - start.longitude)
        val y = sin(dLon) * cos(lat2)
        val x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
        return (Math.toDegrees(Math.atan2(y, x)) + 360) % 360
    }

    private fun positionFor(coordinate: CourseCoordinate, origin: Location): Vector3 {
        val earthRadius = 6_371_000.0
        val deltaLat = Math.toRadians(coordinate.latitude - origin.latitude)
        val deltaLon = Math.toRadians(coordinate.longitude - origin.longitude)
        val x = earthRadius * deltaLon * cos(Math.toRadians(origin.latitude))
        val z = earthRadius * deltaLat
        val headingRad = Math.toRadians(headingOffset)
        val rotatedX = x * cos(headingRad) - z * sin(headingRad)
        val rotatedZ = x * sin(headingRad) + z * cos(headingRad)
        return Vector3(rotatedX.toFloat(), 0f, (-rotatedZ).toFloat())
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type == Sensor.TYPE_ROTATION_VECTOR) {
            val rotationMatrix = FloatArray(9)
            SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
            val orientation = FloatArray(3)
            SensorManager.getOrientation(rotationMatrix, orientation)
            val azimuth = Math.toDegrees(orientation[0].toDouble())
            deviceHeading = (azimuth + 360) % 360
        }
    }

    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) = Unit

    companion object {
        private const val EXTRA_COURSE_ID = "course_id"
        private const val EXTRA_BASE_URL = "base_url"
        private const val DEFAULT_BASE_URL = "https://api.golfiq.app/"
        private const val CONTAINER_ID = 0x0F0D0001

        fun intent(context: Context, courseId: String, baseUrl: String = DEFAULT_BASE_URL): Intent {
            return Intent(context, ARHUDActivity::class.java).apply {
                putExtra(EXTRA_COURSE_ID, courseId)
                putExtra(EXTRA_BASE_URL, baseUrl)
            }
        }
    }
}

