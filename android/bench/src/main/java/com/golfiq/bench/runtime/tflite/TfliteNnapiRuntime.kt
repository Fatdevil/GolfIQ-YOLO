package com.golfiq.bench.runtime.tflite

import android.content.Context
import com.golfiq.bench.runtime.RuntimeKind
import org.tensorflow.lite.Delegate
import org.tensorflow.lite.nnapi.NnApiDelegate

class TfliteNnapiRuntime(context: Context) : BaseTfliteRuntime(context, RuntimeKind.TFLITE_NNAPI) {
    private val nnApiDelegate: Delegate by lazy { NnApiDelegate() }

    override val delegate: Delegate
        get() = nnApiDelegate
}
