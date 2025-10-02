package com.golfiq.bench.runtime.ncnn

import android.content.Context
import android.util.Log
import com.golfiq.bench.runtime.InferenceRuntime
import com.golfiq.bench.runtime.RuntimeKind
import com.golfiq.bench.runtime.model.Detection
import com.golfiq.bench.runtime.model.InferenceFrame
import com.golfiq.bench.runtime.model.InferenceResult
import com.golfiq.bench.util.SimpleNms

abstract class BaseNcnnRuntime(
    private val context: Context,
    private val kindOverride: RuntimeKind,
    private val useVulkan: Boolean,
) : InferenceRuntime {
    private var nativeHandle: NativeNcnn? = null

    override val kind: RuntimeKind = kindOverride
    override val modelAssetParam: String? = "models/benchmark.param"
    override val modelAssetBin: String? = "models/benchmark.bin"
    override val modelAssetData: String = "models/benchmark.bin"

    override fun prepare() {
        if (nativeHandle != null) return
        val missing = listOfNotNull(modelAssetParam, modelAssetBin).filterNot { assetExists(it) }
        if (missing.isNotEmpty()) {
            Log.w(TAG, "Model assets ${missing.joinToString()} missing. Run `./gradlew :bench:downloadBenchAssets` to fetch benchmark weights.")
            return
        }
        nativeHandle = NativeNcnn.create(context, modelAssetParam, modelAssetBin, useVulkan)
    }

    override fun run(frame: InferenceFrame): InferenceResult {
        val handle = nativeHandle ?: return InferenceResult(emptyList(), 0)
        val result = runCatching { handle.run(frame.normalized, frame.width, frame.height) }
        val detections = result.getOrNull()?.toDetections() ?: emptyList()
        if (result.isFailure) {
            Log.e(TAG, "NCNN inference failed", result.exceptionOrNull())
        }
        return InferenceResult(SimpleNms.apply(detections), 0)
    }

    override fun close() {
        nativeHandle?.close()
        nativeHandle = null
    }

    private fun assetExists(assetPath: String): Boolean = runCatching {
        context.assets.open(assetPath).use { }
        true
    }.getOrElse { false }

    private fun FloatArray.toDetections(): List<Detection> {
        val detections = mutableListOf<Detection>()
        var index = 0
        while (index + 5 < size) {
            val score = this[index]
            val classId = this[index + 1].toInt()
            val x1 = this[index + 2]
            val y1 = this[index + 3]
            val x2 = this[index + 4]
            val y2 = this[index + 5]
            detections += Detection(score, classId, x1, y1, x2, y2)
            index += 6
        }
        return detections
    }

    companion object {
        private const val TAG = "BaseNcnnRuntime"
    }
}
