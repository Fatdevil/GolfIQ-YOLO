package com.golfiq.wear.sense

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import android.util.Log
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.SupervisorJob
import org.json.JSONArray
import org.json.JSONObject

private const val TAG = "IMUStreamer"
private const val SAMPLE_RATE_HZ = 50
private const val SAMPLING_PERIOD_US = 1_000_000 / SAMPLE_RATE_HZ
private const val MAX_REPORT_LATENCY_US = 150_000
private const val BATCH_WINDOW_MS = 150L
private const val FRAME_STRIDE = 7
private const val MESSAGE_PATH = "/golfiq/imu/v1"

class IMUStreamer(private val context: Context) : SensorEventListener {
  private val sensorManager =
    context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val messageClient: MessageClient = Wearable.getMessageClient(context)
  private val nodeClient = Wearable.getNodeClient(context)
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private val running = AtomicBoolean(false)

  private val frames = mutableListOf<Frame>()
  private val frameLock = Any()
  private var flushJob: Job? = null
  private var baseEpochMillis: Long = 0
  private var baseElapsedRealtimeNanos: Long = 0
  private var latestGyro: FloatArray? = null

  fun start() {
    if (running.getAndSet(true)) {
      return
    }
    val accel = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    val gyro = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    if (accel == null || gyro == null) {
      Log.w(TAG, "IMU sensors unavailable; accel=${accel != null} gyro=${gyro != null}")
      running.set(false)
      return
    }

    baseEpochMillis = System.currentTimeMillis()
    baseElapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
    latestGyro = null
    synchronized(frameLock) { frames.clear() }

    sensorManager.registerListener(this, accel, SAMPLING_PERIOD_US, MAX_REPORT_LATENCY_US)
    sensorManager.registerListener(this, gyro, SAMPLING_PERIOD_US, MAX_REPORT_LATENCY_US)

    flushJob = scope.launch {
      while (running.get()) {
        delay(BATCH_WINDOW_MS)
        flush()
      }
    }
    Log.d(TAG, "IMU streaming started")
  }

  fun stop() {
    if (!running.getAndSet(false)) {
      return
    }
    flushJob?.cancel()
    flushJob = null
    sensorManager.unregisterListener(this)
    flush()
    synchronized(frameLock) { frames.clear() }
    Log.d(TAG, "IMU streaming stopped")
  }

  fun release() {
    stop()
    scope.cancel()
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (!running.get()) {
      return
    }
    when (event.sensor.type) {
      Sensor.TYPE_GYROSCOPE -> handleGyro(event)
      Sensor.TYPE_ACCELEROMETER -> handleAccel(event)
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
    // no-op
  }

  private fun handleGyro(event: SensorEvent) {
    latestGyro = event.values.clone()
  }

  private fun handleAccel(event: SensorEvent) {
    val gyro = latestGyro ?: return
    val ax = event.values.getOrNull(0) ?: return
    val ay = event.values.getOrNull(1) ?: return
    val az = event.values.getOrNull(2) ?: return
    val gx = gyro.getOrNull(0) ?: return
    val gy = gyro.getOrNull(1) ?: return
    val gz = gyro.getOrNull(2) ?: return
    val tsMs = toEpochMillis(event.timestamp)
    synchronized(frameLock) { frames.add(Frame(tsMs, ax, ay, az, gx, gy, gz)) }
  }

  private fun flush() {
    val snapshot: Array<Frame>
    synchronized(frameLock) {
      if (frames.isEmpty()) {
        return
      }
      snapshot = frames.toTypedArray()
      frames.clear()
    }
    val payload = buildPayload(snapshot) ?: return
    nodeClient.connectedNodes.addOnSuccessListener { nodes ->
      sendToNodes(nodes, payload)
    }
  }

  private fun sendToNodes(nodes: List<Node>, payload: ByteArray) {
    if (nodes.isEmpty()) {
      return
    }
    nodes.forEach { node ->
      messageClient.sendMessage(node.id, MESSAGE_PATH, payload)
    }
  }

  private fun buildPayload(frames: Array<Frame>): ByteArray? {
    if (frames.isEmpty()) {
      return null
    }
    val floats = DoubleArray(frames.size * FRAME_STRIDE)
    var prevTs = frames.first().timestampMs
    for (i in frames.indices) {
      val frame = frames[i]
      val base = i * FRAME_STRIDE
      floats[base + 0] = frame.ax.toDouble()
      floats[base + 1] = frame.ay.toDouble()
      floats[base + 2] = frame.az.toDouble()
      floats[base + 3] = frame.gx.toDouble()
      floats[base + 4] = frame.gy.toDouble()
      floats[base + 5] = frame.gz.toDouble()
      val dt = if (i == 0) 0L else max(0L, frame.timestampMs - prevTs)
      prevTs = frame.timestampMs
      floats[base + 6] = dt.toDouble()
    }
    val hz = estimateHz(frames)
    val json = JSONObject()
      .put("v", 1)
      .put("hz", hz)
      .put("t0", frames.first().timestampMs)
      .put("frames", JSONArray().apply { floats.forEach { put(it) } })
    return json.toString().toByteArray(StandardCharsets.UTF_8)
  }

  private fun estimateHz(frames: Array<Frame>): Int {
    if (frames.size < 2) {
      return SAMPLE_RATE_HZ
    }
    val durationMs = max(1L, frames.last().timestampMs - frames.first().timestampMs)
    val hz = ((frames.size - 1) * 1000.0 / durationMs).toInt()
    return hz.coerceIn(1, 200)
  }

  private fun toEpochMillis(eventTimestampNs: Long): Long {
    val deltaNs = eventTimestampNs - baseElapsedRealtimeNanos
    return baseEpochMillis + deltaNs / 1_000_000L
  }

  private data class Frame(
    val timestampMs: Long,
    val ax: Float,
    val ay: Float,
    val az: Float,
    val gx: Float,
    val gy: Float,
    val gz: Float,
  )
}
