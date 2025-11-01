package com.golfiq.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.MaterialTheme
import androidx.compose.material.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.golfiq.wear.bridge.WearConnector
import com.golfiq.wear.ui.HoleMapScreen

class MainActivity : ComponentActivity() {
  private val connector by viewModels<WearConnector>()

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    connector.initialize(this)
    setContent {
      val uiState by connector.uiState.collectAsState()
      MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
          HoleMapScreen(
            hole = uiState.hole,
            player = uiState.player,
            target = uiState.target,
            tournamentSafe = uiState.tournamentSafe,
            onTargetChanged = connector::emitTargetMoved,
          )
        }
      }
    }
  }

  override fun onResume() {
    super.onResume()
    connector.onResume()
  }

  override fun onPause() {
    connector.onPause()
    super.onPause()
  }
}
