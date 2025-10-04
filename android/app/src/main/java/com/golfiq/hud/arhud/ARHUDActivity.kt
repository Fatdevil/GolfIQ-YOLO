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
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.ar.core.Anchor
import com.google.ar.sceneform.AnchorNode
import com.google.ar.sceneform.Node
import com.google.ar.sceneform.math.Quaternion
import com.google.ar.sceneform.math.Vector3
import com.google.ar.sceneform.rendering.Color
import com.google.ar.sceneform.rendering.MaterialFactory
import com.google.ar.sceneform.rendering.ShapeFactory
import com.google.ar.sceneform.ux.ArFragment
import com.golfiq.hud.config.DeviceProfileManager
import com.golfiq.hud.config.FeatureFlagsService
import com.golfiq.hud.config.RemoteConfigClient
import com.golfiq.hud.hud.HUDRuntime
import com.golfiq.hud.inference.RuntimeAdapter
import com.golfiq.hud.runtime.BatteryMonitor
import com.golfiq.hud.runtime.FallbackAction
import com.golfiq.hud.runtime.FallbackPolicy
import com.golfiq.hud.runtime.ThermalWatchdog
import com.golfiq.hud.telemetry.TelemetryClient
import java.net.URL
import java.util.ArrayDeque
import java.util.concurrent.Executors
import kotlin.math.cos
import kotlin.math.sin

class ARHUDActivity : AppCompatActivity(), SensorEventListener {

    private lateinit var arFragment: ArFragment
    private lateinit var overlayView: ARHUDOverlayView
    private lateinit var featureFlags: FeatureFlagsService
    private lateinit var telemetry: TelemetryClient
    private lateinit var courseRepository: CourseBundleRepository
    private lateinit var thermalWatchdog: ThermalWatchdog
    private lateinit var batteryMonitor: BatteryMonitor
    private lateinit var deviceProfileManager: DeviceProfileManager
    private lateinit var runtimeAdapter: RuntimeAdapter
    private var remoteConfigClient: RemoteConfigClient? = null

    private val fallbackHandler = Handler(Looper.getMainLooper())
    private val fallbackIntervalMs = 60_000L
    private val fallbackRunnable = object : Runnable {
        override fun run() {
            evaluateFallbackState()
            fallbackHandler.postDelayed(this, fallbackIntervalMs)
        }
    }
    private var lastFallbackAction: FallbackAction = FallbackAction.NONE

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
            fpsSamples.addLast(frameTimeNanos)
            while (fpsSamples.isNotEmpty() && frameTimeNanos - fpsSamples.first() > 1_000_000_000L) {
                fpsSamples.removeFirst()
            }

            if (fpsSamples.size >= 2) {
                val durationNs = (fpsSamples.last() - fpsSamples.first()).coerceAtLeast(1)
                val fps = (fpsSamples.size - 1) * 1_000_000_000.0 / durationNs
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
        val deviceProfile = deviceProfileManager.ensureProfile()
        runtimeAdapter = RuntimeAdapter(
            getSharedPreferences("runtime_adapter", MODE_PRIVATE),
            deviceProfileManager,
        )
        featureFlags.applyDeviceTier(deviceProfile)

        if (!featureFlags.current().hudEnabled) {
            finish()
            return
        }

        val courseId = intent.getStringExtra(EXTRA_COURSE_ID) ?: run {
            finish()
            return
        }

        val baseUrlString = intent.getStringExtra(EXTRA_BASE_URL) ?: DEFAULT_BASE_URL
        courseRepository = CourseBundleRepository(URL(baseUrlString))

        remoteConfigClient = RemoteConfigClient(
            baseUrl = URL(baseUrlString),
            deviceProfiles = deviceProfileManager,
            featureFlags = featureFlags,
            telemetry = telemetry,
            runtimeAdapter = runtimeAdapter,
        ).also { it.start() }

        val container = FrameLayout(this).apply { id = CONTAINER_ID }
        overlayView = ARHUDOverlayView(this)

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
        overlayView.alpha = if (featureFlags.current().hudEnabled) 1f else 0f
        overlayView.calibrateButton.setOnClickListener { calibrate() }
        overlayView.recenterButton.setOnClickListener { recenter() }

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
        executor.shutdownNow()
        remoteConfigClient?.shutdown()
    }

    private fun loadCourse(courseId: String) {
        executor.execute {
            try {
                val bundle = courseRepository.fetch(courseId)
                runOnUiThread {
                    currentCourse = bundle
                    overlayView.updateStatus("Aim at pin and calibrate")
                    updateDistances()
                }
            } catch (t: Throwable) {
                runOnUiThread {
                    overlayView.updateStatus("Failed to load course: ${t.message}")
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

        originLocation = latestLocation
        headingOffset = (bearingBetween(latestLocation, bundle.pin.toLocation()) - deviceHeading + 360) % 360

        calibrationAnchor?.detach()
        val cameraPose = frame.camera.pose
        calibrationAnchor = session.createAnchor(cameraPose)

        placeMarkers(bundle)
        updateDistances()
        telemetry.logHudCalibration()
        overlayView.updateStatus("Calibrated – markers pinned")
    }

    private fun recenter() {
        val bundle = currentCourse
        val origin = originLocation
        val session = arFragment.arSceneView.session
        if (bundle == null || origin == null || session == null) {
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
    }

    private fun placeMarkers(bundle: CourseBundle) {
        val scene = arFragment.arSceneView.scene
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
        val (front, center, back) = bundle.distancesFrom(location).formattedYards()
        overlayView.updateDistances(front, center, back)
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

