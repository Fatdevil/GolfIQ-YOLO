package com.golfiq.bench.runtime

import android.content.Context
import com.golfiq.bench.runtime.ncnn.NcnnCpuRuntime
import com.golfiq.bench.runtime.ncnn.NcnnVulkanRuntime
import com.golfiq.bench.runtime.ort.OrtNnapiRuntime
import com.golfiq.bench.runtime.tflite.TfliteCpuRuntime
import com.golfiq.bench.runtime.tflite.TfliteGpuRuntime
import com.golfiq.bench.runtime.tflite.TfliteNnapiRuntime

object RuntimeFactory {
    fun create(context: Context, kind: RuntimeKind): InferenceRuntime? = try {
        when (kind) {
            RuntimeKind.TFLITE_CPU -> TfliteCpuRuntime(context)
            RuntimeKind.TFLITE_NNAPI -> TfliteNnapiRuntime(context)
            RuntimeKind.TFLITE_GPU -> TfliteGpuRuntime(context)
            RuntimeKind.ORT_NNAPI -> OrtNnapiRuntime(context)
            RuntimeKind.NCNN_CPU -> NcnnCpuRuntime(context)
            RuntimeKind.NCNN_VULKAN -> NcnnVulkanRuntime(context)
        }
    } catch (t: Throwable) {
        android.util.Log.e("RuntimeFactory", "Failed to create runtime ${kind.wireName}", t)
        null
    }
}
