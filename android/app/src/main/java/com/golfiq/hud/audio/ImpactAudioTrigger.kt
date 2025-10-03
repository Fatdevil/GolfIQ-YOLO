package com.golfiq.hud.audio

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.golfiq.hud.telemetry.TelemetryClient
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

class ImpactAudioTrigger(
    private val telemetryClient: TelemetryClient,
    private val onStartCapture: () -> Unit,
    private val onStopCapture: () -> Unit,
    private val sampleRateHz: Int = 16_000,
    private val thresholdDb: Double = -18.0,
    private val debounceMillis: Long = 1_200,
    private val audioSource: Int = MediaRecorder.AudioSource.DEFAULT,
) {
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val running = AtomicBoolean(false)
    private val capturing = AtomicBoolean(false)
    private val lastAboveThreshold = AtomicLong(0L)
    private var audioRecord: AudioRecord? = null

    fun start() {
        if (!running.compareAndSet(false, true)) {
            return
        }
        val minBuffer = AudioRecord.getMinBufferSize(
            sampleRateHz,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val bufferSize = max(minBuffer, sampleRateHz / 2)
        audioRecord = AudioRecord(
            audioSource,
            sampleRateHz,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize,
        )
        audioRecord?.startRecording()
        executor.execute { pump(bufferSize) }
    }

    fun stop() {
        if (!running.compareAndSet(true, false)) {
            return
        }
        audioRecord?.apply {
            try {
                stop()
            } finally {
                release()
            }
        }
        audioRecord = null
        capturing.set(false)
    }

    private fun pump(bufferSize: Int) {
        val buffer = ShortArray(bufferSize)
        val record = audioRecord ?: return
        while (running.get()) {
            val read = record.read(buffer, 0, buffer.size)
            if (read <= 0) continue
            val rms = rms(buffer, read)
            val db = amplitudeToDb(rms)
            val now = System.currentTimeMillis()
            if (db >= thresholdDb) {
                lastAboveThreshold.set(now)
                telemetryClient.logImpactTriggerEvent(db)
                if (capturing.compareAndSet(false, true)) {
                    onStartCapture()
                }
            } else if (capturing.get() && now - lastAboveThreshold.get() > debounceMillis) {
                capturing.set(false)
                onStopCapture()
            }
        }
    }

    private fun rms(samples: ShortArray, length: Int): Double {
        var sum = 0.0
        for (i in 0 until length) {
            val s = samples[i].toDouble()
            sum += s * s
        }
        return sqrt(sum / length)
    }

    private fun amplitudeToDb(rms: Double): Double {
        if (rms <= 0.0) {
            return -160.0
        }
        val reference = 32_767.0
        return 20.0 * log10(rms / reference)
    }
}
