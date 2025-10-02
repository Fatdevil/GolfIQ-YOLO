package com.golfiq.bench.runtime.ncnn

import android.content.Context
import android.content.res.AssetManager
import java.io.Closeable

class NativeNcnn private constructor(
    private val handle: Long,
) : Closeable {
    override fun close() {
        nativeRelease(handle)
    }

    fun run(input: FloatArray, width: Int, height: Int): FloatArray = nativeRun(handle, input, width, height)

    companion object {
        private val loadResult = runCatching { System.loadLibrary("bench_ncnn") }

        fun create(context: Context, paramAsset: String?, binAsset: String?, vulkan: Boolean): NativeNcnn? {
            if (loadResult.isFailure) {
                return null
            }
            val assetManager = context.assets
            val handle = nativeInit(assetManager, paramAsset, binAsset, vulkan)
            return if (handle == 0L) null else NativeNcnn(handle)
        }

        @JvmStatic
        private external fun nativeInit(assetManager: AssetManager, paramAsset: String?, binAsset: String?, vulkan: Boolean): Long

        @JvmStatic
        private external fun nativeRelease(handle: Long)

        @JvmStatic
        private external fun nativeRun(handle: Long, input: FloatArray, width: Int, height: Int): FloatArray
    }
}
