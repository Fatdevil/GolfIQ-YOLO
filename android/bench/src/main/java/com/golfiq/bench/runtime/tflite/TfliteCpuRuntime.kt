package com.golfiq.bench.runtime.tflite

import android.content.Context
import com.golfiq.bench.runtime.RuntimeKind

class TfliteCpuRuntime(context: Context) : BaseTfliteRuntime(context, RuntimeKind.TFLITE_CPU)
