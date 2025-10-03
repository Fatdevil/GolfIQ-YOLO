package com.golfiq.hud.arhud

import android.content.Context
import android.util.AttributeSet
import android.view.Gravity
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat

class ARHUDOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {

    val calibrateButton: Button = Button(context).apply { text = "Aim → Calibrate" }
    val recenterButton: Button = Button(context).apply { text = "Re-center" }
    private val statusLabel: TextView = TextView(context)
    private val frontLabel: TextView = TextView(context)
    private val centerLabel: TextView = TextView(context)
    private val backLabel: TextView = TextView(context)

    init {
        setWillNotDraw(false)
        foregroundGravity = Gravity.BOTTOM

        statusLabel.apply {
            text = "Align with pin, then calibrate"
            setTextColor(ContextCompat.getColor(context, android.R.color.white))
            textSize = 12f
            gravity = Gravity.CENTER
        }

        val distanceContainer = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.END
        }

        listOf(frontLabel to "F:", centerLabel to "C:", backLabel to "B:").forEach { (label, prefix) ->
            label.apply {
                text = "$prefix --"
                setTextColor(ContextCompat.getColor(context, android.R.color.white))
                textSize = 16f
            }
            distanceContainer.addView(label)
        }

        val controls = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            addView(calibrateButton)
            addView(recenterButton)
        }

        val stack = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val density = resources.displayMetrics.density
            val horizontal = (16 * density).toInt()
            val vertical = (24 * density).toInt()
            setPadding(horizontal, vertical, horizontal, vertical * 2)
            gravity = Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM
            addView(statusLabel)
            addView(controls)
            addView(distanceContainer)
        }

        addView(stack, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
        })
    }

    fun updateStatus(text: String) {
        post { statusLabel.text = text }
    }

    fun updateDistances(front: String, center: String, back: String) {
        post {
            frontLabel.text = "F: $front"
            centerLabel.text = "C: $center"
            backLabel.text = "B: $back"
        }
    }
}
