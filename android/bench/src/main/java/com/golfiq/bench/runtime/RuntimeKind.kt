package com.golfiq.bench.runtime

enum class RuntimeKind(val wireName: String) {
    TFLITE_CPU("tflite_cpu"),
    TFLITE_NNAPI("tflite_nnapi"),
    TFLITE_GPU("tflite_gpu"),
    ORT_NNAPI("ort_nnapi"),
    NCNN_CPU("ncnn_cpu"),
    NCNN_VULKAN("ncnn_vulkan");

    companion object {
        fun fromWireName(raw: String): RuntimeKind? = values().firstOrNull { it.wireName == raw }
    }
}
