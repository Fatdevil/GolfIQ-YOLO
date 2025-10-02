package com.golfiq.bench.runtime.ncnn

import android.content.Context
import com.golfiq.bench.runtime.RuntimeKind

class NcnnVulkanRuntime(context: Context) : BaseNcnnRuntime(context, RuntimeKind.NCNN_VULKAN, useVulkan = true)
