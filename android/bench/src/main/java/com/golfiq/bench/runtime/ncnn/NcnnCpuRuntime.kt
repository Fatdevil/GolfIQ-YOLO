package com.golfiq.bench.runtime.ncnn

import android.content.Context
import com.golfiq.bench.runtime.RuntimeKind

class NcnnCpuRuntime(context: Context) : BaseNcnnRuntime(context, RuntimeKind.NCNN_CPU, useVulkan = false)
