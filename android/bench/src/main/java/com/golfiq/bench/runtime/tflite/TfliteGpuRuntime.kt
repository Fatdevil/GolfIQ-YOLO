package com.golfiq.bench.runtime.tflite

import android.content.Context
import com.golfiq.bench.runtime.RuntimeKind
import org.tensorflow.lite.Delegate
import org.tensorflow.lite.gpu.GpuDelegate

class TfliteGpuRuntime(context: Context) : BaseTfliteRuntime(context, RuntimeKind.TFLITE_GPU) {
    private val gpuDelegate: Delegate by lazy { GpuDelegate() }

    override val delegate: Delegate
        get() = gpuDelegate
}
