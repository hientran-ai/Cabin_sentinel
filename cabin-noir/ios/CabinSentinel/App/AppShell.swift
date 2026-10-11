import SwiftUI
import UserNotifications

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    // Show alerts while the app is open; for a safety app the banner matters even in foreground.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        OrientationLock.mask
    }
}

/// The owner app stays portrait; the in-car screen is usually landscape (phone near the rear-view mirror).
enum OrientationLock {
    /// "Landscape" on a Mac: a wide, short window, like a screen above the dashboard.
    private static func shapeMacWindow(landscape: Bool) {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene, let r = scene.sizeRestrictions else { return }
        if landscape {
            r.minimumSize = CGSize(width: 900, height: 420)
            r.maximumSize = CGSize(width: 10000, height: 640)
        } else {
            r.minimumSize = CGSize(width: 320, height: 480)
            r.maximumSize = CGSize(width: 10000, height: 10000)
        }
    }

    static var mask: UIInterfaceOrientationMask = .portrait

    static func apply(_ m: UIInterfaceOrientationMask) {
        mask = m
        // On a Mac the window is not a rotating screen: asking it to rotate turns the whole content sideways.
        // Instead the window itself is made wide (or free again).
        if VisionOrientation.onMac { shapeMacWindow(landscape: m == .landscape); return }
        #if !targetEnvironment(macCatalyst)
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene else { return }
        scene.windows.first?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: m)) { _ in }
        #endif
    }
}

struct RootView<Main: View, SignedOut: View>: View {
    @Environment(AppModel.self) private var model
    @ViewBuilder var main: () -> Main
    @ViewBuilder var signedOut: () -> SignedOut

    var body: some View {
        Group {
            switch model.phase {
            case .launching:
                #if PRODUCTION
                NoirLaunchView()
                #else
                VStack(spacing: 16) {
                    Image(systemName: "shield.lefthalf.filled").font(.system(size: 48)).foregroundStyle(Theme.primary)
                    ProgressView()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity).screenBackground()
                #endif
            case .signedOut:
                signedOut()
            case .onboarding(let step):
                OnboardingFlow(step: step)
            case .main:
                main()
            }
        }
        .animation(.snappy(duration: 0.2), value: model.phase)
    }
}


extension RootView where SignedOut == WelcomeFlow {
    init(@ViewBuilder main: @escaping () -> Main) {
        self.main = main
        self.signedOut = { WelcomeFlow() }
    }
}
