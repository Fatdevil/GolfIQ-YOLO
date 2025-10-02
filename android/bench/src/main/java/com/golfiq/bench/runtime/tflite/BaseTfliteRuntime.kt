package com.golfiq.bench.runtime.tflite

import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.golfiq.bench.runtime.InferenceRuntime
import com.golfiq.bench.runtime.RuntimeKind
import com.golfiq.bench.runtime.model.InferenceFrame
import com.golfiq.bench.runtime.model.InferenceResult
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.tensorflow.lite.DataType
import org.tensorflow.lite.Delegate
import org.tensorflow.lite.Interpreter

abstract class BaseTfliteRuntime(
    private val context: Context,
    private val kindOverride: RuntimeKind,
) : InferenceRuntime {
    protected open val delegate: Delegate? = null
    private var interpreter: Interpreter? = null
    private var cachedInputShape: IntArray? = null

    override val kind: RuntimeKind = kindOverride
    override val modelAssetParam: String? = null
    override val modelAssetBin: String? = null
    override val modelAssetData: String = MODEL_ASSET

    override fun prepare() {
        if (interpreter != null) return
        if (!assetExists(MODEL_ASSET)) {
            Log.w(TAG, "Model asset $MODEL_ASSET missing. Run `./gradlew :bench:downloadBenchAssets` to fetch benchmark weights.")
            return
        }
        interpreter = createInterpreter()
    }

    override fun run(frame: InferenceFrame): InferenceResult {
        val current = interpreter ?: return InferenceResult(emptyList(), 0)
        val inputBuffer = ByteBuffer.allocateDirect(frame.normalized.size * 4)
            .order(ByteOrder.nativeOrder())
        frame.normalized.forEach { inputBuffer.putFloat(it) }
        inputBuffer.rewind()
        val dims = intArrayOf(1, frame.height, frame.width, 3)
        if (cachedInputShape?.contentEquals(dims) != true) {
            runCatching { current.resizeInput(0, dims) }
            runCatching { current.allocateTensors() }
            cachedInputShape = dims
        }
        val outputs = prepareOutputs(current)
        val start = SystemClock.elapsedRealtime()
        try {
            current.runForMultipleInputsOutputs(arrayOf<Any>(inputBuffer), outputs)
        } catch (t: Throwable) {
            Log.e(TAG, "TFLite inference failed", t)
        }
        val latency = SystemClock.elapsedRealtime() - start
        return InferenceResult(emptyList(), latency)
    }

    override fun close() {
        interpreter?.close()
        interpreter = null
        delegate?.close()
        cachedInputShape = null
    }

    private fun prepareOutputs(interpreter: Interpreter): MutableMap<Int, Any> {
        val outputs = mutableMapOf<Int, Any>()
        for (index in 0 until interpreter.outputTensorCount) {
            val tensor = interpreter.getOutputTensor(index)
            val numElements = tensor.numElements()
            val value: Any = when (tensor.dataType()) {
                DataType.FLOAT32 -> FloatArray(numElements)
                DataType.UINT8 -> ByteArray(numElements)
                DataType.INT32 -> IntArray(numElements)
                DataType.INT64 -> LongArray(numElements)
                DataType.INT16 -> ShortArray(numElements)
                else -> ByteArray(numElements * tensor.dataType().byteSize())
            }
            outputs[index] = value
        }
        return outputs
    }

    private fun createInterpreter(): Interpreter? = try {
        val options = Interpreter.Options().apply {
            delegate?.let { addDelegate(it) }
        }
        context.assets.openFd(MODEL_ASSET).use { fd ->
            fd.createInputStream().use { stream ->
                val bytes = stream.readBytes()
                val buffer = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder())
                buffer.put(bytes)
                buffer.rewind()
                Interpreter(buffer, options)
            }
        }
    } catch (t: Throwable) {
        Log.e(TAG, "Failed to initialize interpreter", t)
        null
    }

    private fun assetExists(assetPath: String): Boolean = runCatching {
        context.assets.open(assetPath).use { }
        true
    }.getOrElse { false }

    companion object {
        private const val MODEL_ASSET = "models/benchmark.tflite"
        private const val TAG = "BaseTfliteRuntime"
    }
}
