import { NativeEventEmitter, NativeModules } from 'react-native'

interface HolePoint {
  lat: number
  lon: number
}

interface TargetMovedEvent extends HolePoint {}

type TargetListener = (event: TargetMovedEvent) => void

const module =
  NativeModules.VectorWatchBridge ||
  NativeModules.WatchBridgeModule ||
  NativeModules.WatchConnectorIOS

const emitter = new NativeEventEmitter(module)

export const sendHoleModel = (json: string, tournamentSafe: boolean) => {
  if (!module?.sendHoleModel) return
  module.sendHoleModel(json, tournamentSafe)
}

export const sendPlayerPos = (lat: number, lon: number) => {
  if (!module?.sendPlayerPosition) return
  module.sendPlayerPosition(lat, lon)
}

export const sendTargetPos = (lat: number, lon: number) => {
  if (!module?.sendTargetPosition) return
  module.sendTargetPosition(lat, lon)
}

export const notifyRoundSaved = () => {
  if (!module?.notifyRoundSaved) return
  module.notifyRoundSaved()
}

export const subscribeTargetMoved = (listener: TargetListener) => {
  const subscription = emitter.addListener('WatchTargetMoved', listener)
  return () => subscription.remove()
}
