#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(WatchBridgeModule, RCTEventEmitter)
RCT_EXTERN_METHOD(sendHoleModel:(NSString *)json tournamentSafe:(BOOL)tournamentSafe)
RCT_EXTERN_METHOD(sendPlayerPosition:(nonnull NSNumber *)lat lon:(nonnull NSNumber *)lon)
RCT_EXTERN_METHOD(sendTargetPosition:(nonnull NSNumber *)lat lon:(nonnull NSNumber *)lon)
@end
