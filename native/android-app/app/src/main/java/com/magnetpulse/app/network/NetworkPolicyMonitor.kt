package com.magnetpulse.app.network

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.BatteryManager

class NetworkPolicyMonitor(
    private val context: Context,
    private val onEnvironmentChanged: (isWifi: Boolean, isCharging: Boolean) -> Unit
) {
    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    @Volatile
    private var currentWifi: Boolean = checkWifiNow()

    @Volatile
    private var currentCharging: Boolean = checkChargingNow()

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onCapabilitiesChanged(
            network: Network,
            capabilities: NetworkCapabilities
        ) {
            currentWifi = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
            onEnvironmentChanged(currentWifi, currentCharging)
        }

        override fun onLost(network: Network) {
            currentWifi = checkWifiNow()
            onEnvironmentChanged(currentWifi, currentCharging)
        }
    }

    private val powerReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            currentCharging = checkChargingNow()
            onEnvironmentChanged(currentWifi, currentCharging)
        }
    }

    fun start() {
        connectivityManager.registerDefaultNetworkCallback(networkCallback)
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
        }
        context.registerReceiver(powerReceiver, filter)
        onEnvironmentChanged(currentWifi, currentCharging)
    }

    fun stop() {
        runCatching { connectivityManager.unregisterNetworkCallback(networkCallback) }
        runCatching { context.unregisterReceiver(powerReceiver) }
    }

    private fun checkWifiNow(): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        val caps = connectivityManager.getNetworkCapabilities(network) ?: return false
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }

    private fun checkChargingNow(): Boolean {
        val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return batteryManager.isCharging
    }
}
