package com.golfiq.watch

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.golfiq.watch.bridge.WearShotSenseModule

class WatchConnectorPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(
            WatchConnectorModule(reactContext),
            VectorWatchBridgeModule(reactContext),
            WearShotSenseModule(reactContext),
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
