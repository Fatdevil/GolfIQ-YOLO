package com.golfiq.bench.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.util.Log
import com.golfiq.bench.runtime.model.InferenceFrame
import kotlin.io.use
import kotlin.math.min

class FrameRepository(private val context: Context) {
    fun load(): FrameSequence {
        val assetManager = context.assets
        val frames = mutableListOf<InferenceFrame>()
        val names = enumerateFrameAssets()
        val targetSize = 640
        for (name in names) {
            try {
                val bitmap = assetManager.open("frames/$name").use { input ->
                    android.graphics.BitmapFactory.decodeStream(input)
                } ?: continue
                val letterboxed = letterbox(bitmap, targetSize, targetSize)
                frames += InferenceFrame(
                    normalized = normalize(letterboxed),
                    width = targetSize,
                    height = targetSize,
                )
                bitmap.recycle()
                letterboxed.recycle()
            } catch (t: Throwable) {
                Log.e(TAG, "Failed to load frame $name", t)
            }
        }
        if (frames.isEmpty()) {
            Log.w(TAG, "No frames found; generating synthetic fallback frame")
            frames += syntheticFrame(targetSize)
        }
        return FrameSequence(frames, assetManager)
    }

    private fun enumerateFrameAssets(): List<String> = runCatching {
        context.assets.list("frames")
            ?.filter { it.endsWith(".png", ignoreCase = true) }
            ?.sorted()
            ?: emptyList()
    }.getOrElse {
        Log.i(TAG, "Frame assets unavailable; falling back to synthetic frames")
        emptyList()
    }

    private fun letterbox(source: Bitmap, targetWidth: Int, targetHeight: Int): Bitmap {
        val scale = min(targetWidth.toFloat() / source.width, targetHeight.toFloat() / source.height)
        val scaledWidth = (source.width * scale).toInt()
        val scaledHeight = (source.height * scale).toInt()
        val bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.BLACK)
        val dx = (targetWidth - scaledWidth) / 2
        val dy = (targetHeight - scaledHeight) / 2
        val destRect = Rect(dx, dy, dx + scaledWidth, dy + scaledHeight)
        canvas.drawBitmap(source, null, destRect, Paint(Paint.ANTI_ALIAS_FLAG))
        return bitmap
    }

    private fun normalize(bitmap: Bitmap): FloatArray {
        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        val data = FloatArray(pixels.size * 3)
        var index = 0
        for (pixel in pixels) {
            val r = Color.red(pixel) / 255f
            val g = Color.green(pixel) / 255f
            val b = Color.blue(pixel) / 255f
            data[index++] = (r - 0.5f) * 2f
            data[index++] = (g - 0.5f) * 2f
            data[index++] = (b - 0.5f) * 2f
        }
        return data
    }

    companion object {
        private const val TAG = "FrameRepository"
    }

    private fun syntheticFrame(size: Int): InferenceFrame {
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint()
        for (y in 0 until size) {
            val intensity = (y.toFloat() / size * 255).toInt()
            paint.color = Color.rgb(intensity, 255 - intensity, 128)
            canvas.drawLine(0f, y.toFloat(), size.toFloat(), y.toFloat(), paint)
        }
        val frame = InferenceFrame(
            normalized = normalize(bitmap),
            width = size,
            height = size,
        )
        bitmap.recycle()
        return frame
    }
}

class FrameSequence(
    private val frames: List<InferenceFrame>,
    private val assetManager: android.content.res.AssetManager,
) {
    private var index = 0

    fun nextFrame(): InferenceFrame {
        if (frames.isEmpty()) throw IllegalStateException("No frames available")
        val frame = frames[index % frames.size]
        index++
        return frame
    }

    fun modelSize(assetName: String): Double? = try {
        assetManager.openFd(assetName).use { fd ->
            fd.length / (1024.0 * 1024.0)
        }
    } catch (t: Throwable) {
        runCatching {
            assetManager.open(assetName).use { input ->
                val size = input.available()
                size / (1024.0 * 1024.0)
            }
        }.getOrElse {
            Log.w("FrameSequence", "Unable to read asset size for $assetName", t)
            null
        }
    }
}
