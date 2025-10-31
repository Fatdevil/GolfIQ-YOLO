package com.golfiq

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.golfiq.watch.WatchConnectorPackage

class MainApplication : Application(), ReactApplication {
  private val reactNativeHost: ReactNativeHost = object : ReactNativeHost(this) {
    override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

    override fun getPackages(): MutableList<ReactPackage> {
      val packages = PackageList(this).packages
      packages.add(WatchConnectorPackage())
      return packages
    }

    override fun getJSMainModuleName(): String = "index"
  }

  override fun getReactNativeHost(): ReactNativeHost = reactNativeHost

  override fun onCreate() {
    super.onCreate()
  }
}
