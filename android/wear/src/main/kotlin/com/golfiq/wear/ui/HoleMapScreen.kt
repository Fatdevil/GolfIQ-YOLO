package com.golfiq.wear.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.toSize
import com.golfiq.wear.model.HoleModel
import com.golfiq.wear.model.HolePoint

@Composable
fun HoleMapScreen(
  hole: HoleModel?,
  player: HolePoint?,
  target: HolePoint?,
  tournamentSafe: Boolean,
  onTargetChanged: (HolePoint) -> Unit,
) {
  Box(
    modifier = Modifier
      .fillMaxSize()
      .background(MaterialTheme.colors.background)
  ) {
    hole?.let { holeModel ->
      Canvas(
        modifier = Modifier
          .fillMaxSize()
          .pointerInput(holeModel) {
            val canvasSize = size.toSize()
            detectTapGestures { offset ->
              if (canvasSize.width == 0f || canvasSize.height == 0f) return@detectTapGestures
              val bbox = holeModel.bbox
              val fracX = (offset.x / canvasSize.width).coerceIn(0f, 1f)
              val fracY = (offset.y / canvasSize.height).coerceIn(0f, 1f)
              val lat = bbox.minLat + (bbox.maxLat - bbox.minLat) * fracY
              val lon = bbox.minLon + (bbox.maxLon - bbox.minLon) * fracX
              onTargetChanged(HolePoint(lat, lon))
            }
          }
      ) {
        drawHole(holeModel, tournamentSafe)
        player?.let { drawMarker(it, Color.Blue, holeModel) }
        target?.let { drawMarker(it, Color(0xFFFF9800), holeModel) }
      }
    }
  }
}

private fun DrawScope.drawHole(hole: HoleModel, tournamentSafe: Boolean) {
  val fairwayColor = Color(0xFF4CAF50).copy(alpha = if (tournamentSafe) 0.6f else 0.3f)
  hole.fairways.forEach { drawPolygon(it, fairwayColor, hole) }

  val greenColor = Color(0xFF8BC34A).copy(alpha = if (tournamentSafe) 0.9f else 0.5f)
  hole.greens.forEach { drawPolygon(it, greenColor, hole) }

  val bunkerColor = Color(0xFFFFEB3B).copy(alpha = 0.5f)
  hole.bunkers.forEach { drawPolygon(it, bunkerColor, hole) }
}

private fun DrawScope.drawPolygon(points: List<HolePoint>, color: Color, hole: HoleModel) {
  if (points.size < 3) return
  val path = Path()
  points.forEachIndexed { index, point ->
    val projected = project(point, hole)
    if (index == 0) {
      path.moveTo(projected.x, projected.y)
    } else {
      path.lineTo(projected.x, projected.y)
    }
  }
  path.close()
  drawPath(path, color)
}

private fun DrawScope.drawMarker(point: HolePoint, color: Color, hole: HoleModel) {
  val projected = project(point, hole)
  drawCircle(color, radius = 6f, center = projected)
}

private fun DrawScope.project(point: HolePoint, hole: HoleModel): Offset {
  val bbox = hole.bbox
  val fracX = ((point.lon - bbox.minLon) / (bbox.maxLon - bbox.minLon)).toFloat()
  val fracY = ((point.lat - bbox.minLat) / (bbox.maxLat - bbox.minLat)).toFloat()
  return Offset(size.width * fracX, size.height * fracY)
}
