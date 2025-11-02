package com.golfiq.wear.overlay

import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt

@Composable
fun WearOverlay(snapshot: OverlaySnapshotV1DTO?) {
    val darkTheme = isSystemInDarkTheme()
    Canvas(modifier = Modifier.fillMaxSize()) {
        val s = snapshot ?: return@Canvas
        val width = size.width
        val height = size.height

        buildPath(s.corridor, width, height)?.let { corridorPath ->
            drawPath(corridorPath, color = corridorFillColor(darkTheme))
            drawPath(
                corridorPath,
                color = corridorStrokeColor(darkTheme),
                style = Stroke(width = 1.5f)
            )
        }

        buildPath(s.ring, width, height)?.let { ringPath ->
            drawPath(ringPath, color = ringFillColor(darkTheme))
            drawPath(ringPath, color = ringStrokeColor(darkTheme), style = Stroke(width = 1.5f))
        }

        if (s.labelsAllowed) {
            val p50 = s.meta?.p50_m
            val center = centroid(s.ring, width, height)
            if (p50 != null && center != null) {
                val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = labelColor(darkTheme).toArgb()
                    textAlign = Paint.Align.CENTER
                    textSize = 12.sp.toPx()
                }
                drawContext.canvas.nativeCanvas.drawText(
                    "${p50.roundToInt()} m",
                    center.x,
                    center.y + paint.textSize * 0.35f,
                    paint
                )
            }
        }
    }
}
