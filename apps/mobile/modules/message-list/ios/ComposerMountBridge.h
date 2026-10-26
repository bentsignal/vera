#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// Implemented by this module's two views; no C++ types cross into Swift.
@protocol VeraComposerMountObserver <NSObject>
- (void)composerSurfaceDidMount:(NSInteger)surface transaction:(NSInteger)transaction;
@end

FOUNDATION_EXPORT BOOL VeraPrepareComposerMountClass(Class viewClass);
FOUNDATION_EXPORT NSInteger VeraComposerSurfaceForView(UIView *view);

NS_ASSUME_NONNULL_END
