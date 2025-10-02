package com.golfiq.bench.runtime.ort

import android.content.Context
import android.util.Log
import com.golfiq.bench.runtime.InferenceRuntime
import com.golfiq.bench.runtime.RuntimeKind
import com.golfiq.bench.runtime.model.InferenceFrame
import com.golfiq.bench.runtime.model.InferenceResult
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.onnxruntime.OnnxTensor
import java.nio.FloatBuffer
import kotlin.io.use

class OrtNnapiRuntime(private val context: Context) : InferenceRuntime {
    private var environment: OrtEnvironment? = null
    private var session: OrtSession? = null

    override val kind: RuntimeKind = RuntimeKind.ORT_NNAPI
    override val modelAssetParam: String? = null
    override val modelAssetBin: String? = null
    override val modelAssetData: String = MODEL_ASSET

    override fun prepare() {
        if (session != null) return
        environment = OrtEnvironment.getEnvironment()
        try {
            if (!assetExists(modelAssetData)) {
                Log.w(TAG, "Model asset $modelAssetData missing. Run `./gradlew :bench:downloadBenchAssets` to fetch benchmark weights.")
                return
            }
            val bytes = context.assets.open(modelAssetData).use { it.readBytes() }
            val options = OrtSession.SessionOptions().apply {
                addNnapi()
            }
            session = environment?.createSession(bytes, options)
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to create ORT session", t)
        }
    }

    override fun run(frame: InferenceFrame): InferenceResult {
        val env = environment ?: return InferenceResult(emptyList(), 0)
        val sess = session ?: return InferenceResult(emptyList(), 0)
        return try {
            val shape = longArrayOf(1, frame.height.toLong(), frame.width.toLong(), 3)
            OnnxTensor.createTensor(env, FloatBuffer.wrap(frame.normalized), shape).use { tensor ->
                val inputName = sess.inputNames.firstOrNull()
                if (inputName != null) {
                    sess.run(mapOf(inputName to tensor)).use { _ -> }
                }
            }
            InferenceResult(emptyList(), 0)
        } catch (t: Throwable) {
            Log.e(TAG, "ORT inference failed", t)
            InferenceResult(emptyList(), 0)
        }
    }

    override fun close() {
        session?.close()
        session = null
        environment?.close()
        environment = null
    }

    private fun assetExists(assetPath: String): Boolean = runCatching {
        context.assets.open(assetPath).use { }
        true
    }.getOrElse { false }

    companion object {
        private const val MODEL_ASSET = "models/benchmark.onnx"
        private const val TAG = "OrtNnapiRuntime"
    }
}
