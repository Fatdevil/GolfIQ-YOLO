package com.golfiq.bench

import android.app.Application
import android.os.StrictMode

class BenchApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.ENABLE_VM_STRICT_MODE) {
            StrictMode.setThreadPolicy(
                StrictMode.ThreadPolicy.Builder().detectAll().penaltyLog().build()
            )
            StrictMode.setVmPolicy(
                StrictMode.VmPolicy.Builder().detectAll().penaltyLog().build()
            )
        }
    }
}
